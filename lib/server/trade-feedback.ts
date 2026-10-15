import {db,readWorkspace} from './store.ts';
import {writeOutcomeNote} from './outcome-ledger.ts';
import type {Fill} from '../terminal-engine.ts';
const imported=new WeakMap<object,Set<string>>();
export function tradeFeedback(id:string){
 const connection=db(),workspace=readWorkspace(id);let seen=imported.get(connection);if(!seen){seen=new Set();imported.set(connection,seen);}
 // Legacy fills are imported without inventing entry, R, timeframe or automatic provenance.
 if(!seen.has(id)){connection.exec('BEGIN IMMEDIATE');try{for(const fill of workspace.portfolio.fills.toReversed())connection.prepare('INSERT OR IGNORE INTO trade_outcomes VALUES (?,?,?,?)').run(fill.id,id,fill.time,JSON.stringify(fill));connection.exec('COMMIT');seen.add(id);}catch(e){connection.exec('ROLLBACK');throw e;}if(workspace.portfolio.fills.length){try{writeOutcomeNote(connection,id);}catch{/* Durable SQLite remains authoritative. */}}}
 const rows=(db().prepare('SELECT state FROM trade_outcomes WHERE workspace_id=? ORDER BY rowid DESC LIMIT 12').all(id) as {state:string}[]).map(r=>JSON.parse(r.state) as Fill);
 const counts=(automatic=false)=>db().prepare(`SELECT COUNT(*) AS trades,COALESCE(SUM(CASE WHEN json_extract(state,'$.pnl')<0 THEN 1 ELSE 0 END),0) AS losses,COALESCE(SUM(CASE WHEN json_extract(state,'$.pnl')>0 THEN 1 ELSE 0 END),0) AS wins,COALESCE(SUM(json_extract(state,'$.pnl')),0) AS netPnlUsd FROM trade_outcomes WHERE workspace_id=? ${automatic?"AND json_extract(state,'$.origin')='automation' AND json_extract(state,'$.source')='exchange'":""}`).get(id) as {trades:number;losses:number;wins:number;netPnlUsd:number};
 return {paper:counts(),automaticExchangePaper:counts(true),recent:rows.slice(0,12),pausedContexts:workspace.bots.filter(b=>b.feedbackPaused).map(b=>({context:b.key,reason:b.feedbackReason})),methodology:'Recorded paper outcomes after modeled fees. Legacy/manual/sample outcomes are labelled and excluded from the automatic exchange-paper loss guard. This is feedback evidence, not model-weight training or strategy approval.'};
}
export function candidateOutcomeVeto(id:string,context:{exchange:string;market:string;symbol:string;timeframe:string;source:string},tolerance:number){
 if(context.source!=='exchange')return null;
 const rows=(db().prepare("SELECT state FROM trade_outcomes WHERE workspace_id=? AND json_extract(state,'$.origin')='automation' AND json_extract(state,'$.source')='exchange' AND json_extract(state,'$.exchange')=? AND json_extract(state,'$.market')=? AND json_extract(state,'$.symbol')=? AND json_extract(state,'$.timeframe')=? AND json_extract(state,'$.tolerance')=? AND json_type(state,'$.netR') IN ('integer','real') ORDER BY rowid DESC LIMIT 20").all(id,context.exchange,context.market,context.symbol,context.timeframe,tolerance) as {state:string}[]).map(r=>JSON.parse(r.state) as Fill);
 const netR=rows.reduce((sum,f)=>sum+f.netR!,0);
 return rows.length>=5&&netR<=0?{trades:rows.length,netR,reason:`Candidate tolerance ${tolerance} vetoed: ${rows.length} recorded automatic paper outcomes total ${netR.toFixed(3)}R after modeled costs. This conservative veto is not a significance test.`}:null;
}
