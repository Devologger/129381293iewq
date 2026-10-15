import type {DatabaseSync} from 'node:sqlite';
import type {Workspace} from './store.ts';
import type {Fill} from '../terminal-engine.ts';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {vaultDirectory} from './account-context.ts';
export function recordOutcomes(connection:DatabaseSync,id:string,before:Workspace,after:Workspace){
 const previous=new Set(before.portfolio.fills.map(f=>f.id));
 for(const fill of after.portfolio.fills.filter(f=>!previous.has(f.id))){
  connection.prepare('INSERT OR IGNORE INTO trade_outcomes VALUES (?,?,?,?)').run(fill.id,id,fill.time,JSON.stringify(fill));
  if(fill.origin!=='automation'||fill.source!=='exchange'||!fill.market||!fill.timeframe)continue;
  const recent=(connection.prepare("SELECT state FROM trade_outcomes WHERE workspace_id=? AND json_extract(state,'$.origin')='automation' AND json_extract(state,'$.source')='exchange' AND json_extract(state,'$.exchange')=? AND json_extract(state,'$.market')=? AND json_extract(state,'$.symbol')=? AND json_extract(state,'$.timeframe')=? ORDER BY rowid DESC LIMIT 3").all(id,fill.exchange,fill.market,fill.symbol,fill.timeframe) as {state:string}[]).map(r=>JSON.parse(r.state) as Fill);
  if(recent.length===3&&recent.every(f=>f.pnl<0))after.bots=after.bots.map(b=>b.exchange===fill.exchange&&b.market===fill.market&&b.symbol===fill.symbol&&b.timeframe===fill.timeframe&&b.source==='exchange'?{...b,enabled:false,feedbackPaused:true,feedbackReason:'Three consecutive automatic paper losses. Review outcomes and new research before explicitly resuming.'}:b);
 }
}
export function writeOutcomeNote(connection:DatabaseSync,id:string){
 if(!/^[a-f\d]{48}$/.test(id))throw new Error('Invalid workspace');
 const fills=(connection.prepare('SELECT state FROM trade_outcomes WHERE workspace_id=? ORDER BY rowid DESC LIMIT 50').all(id) as {state:string}[]).map(r=>JSON.parse(r.state) as Fill);
 const directory=join(vaultDirectory(),'Research',id);mkdirSync(directory,{recursive:true,mode:0o700});
 const path=join(directory,'Trade Outcomes.md'),text=`# Recorded paper trade outcomes\n\n[[Paper Trade Journal]] · [[Codex Research Protocol]]\n\nActual recorded paper closures after modeled costs; not neural-weight training, simulated backtests, or proof of an edge. Manual/sample/legacy provenance is retained; only known automatic exchange-paper outcomes feed the three-loss pause. Latest 50 shown; full outcome ledger persists.\n\n| Closed | Market | Source | Origin | P&L USD | Net R | Reason |\n|---|---|---|---|---|---|---|\n${fills.map(f=>`| ${f.time} | ${f.exchange} ${f.symbol} ${f.timeframe||'unknown'} | ${f.source} | ${f.origin||'legacy/unknown'} | ${f.pnl.toFixed(4)} | ${Number.isFinite(f.netR)?f.netR!.toFixed(3):'unknown'} | ${f.reason.replace(/[|\r\n]/g,' ')} |`).join('\n')}\n\nLosses suggest hypotheses, not permission to change exits or increase risk. Compare proposed changes using training-only selection and untouched forward evidence; keep execution gates intact.\n`;
 writeFileSync(path+'.tmp',text,{mode:0o600});renameSync(path+'.tmp',path);
}
