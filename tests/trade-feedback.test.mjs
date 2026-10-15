import test,{after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';
import {db,createWorkspace,readWorkspace,updateWorkspace} from '../lib/server/store.ts';import {tradeFeedback} from '../lib/server/trade-feedback.ts';import {demoCandles,openPaper,closePaper} from '../lib/terminal-engine.ts';import {tickWorkspace} from '../lib/server/worker.ts';
const folder=mkdtempSync(join(tmpdir(),'penguin-outcomes-'));process.env.TERMINAL_DATA_DIR=folder;process.env.TERMINAL_VAULT_DIR=join(folder,'vault');after(()=>{db().close();rmSync(folder,{recursive:true,force:true});});
const context={exchange:'binance',market:'spot',symbol:'BTC',timeframe:'15m',source:'exchange'},key='binance:spot:BTC:15m:exchange';
const feed=()=>({...context,candles:demoCandles('BTC','15m'),fetchedAt:Date.now()});
function workspace(){const id=randomBytes(24).toString('hex');createWorkspace(id);updateWorkspace(id,ws=>({...ws,portfolio:{...ws.portfolio,paused:false},bots:[{...context,key,enabled:true,learning:false,scanning:true,tolerance:.08,lastBar:0,research:null,error:null,updatedAt:null}]}));return id;}
function roundTrip(id,origin='automation',symbol='BTC',source='exchange'){const f={...feed(),symbol,source};updateWorkspace(id,ws=>({...ws,portfolio:openPaper(ws.portfolio,f,'long',100,{origin,tolerance:.08,researchAsOf:f.candles.at(-1).time})}));const p=readWorkspace(id).portfolio.positions.at(-1);f.candles=f.candles.map((c,i,all)=>i===all.length-1?{...c,close:p.entry*.98,low:Math.min(c.low,p.entry*.98)}:c);updateWorkspace(id,ws=>({...ws,portfolio:closePaper(ws.portfolio,p.id,f,'Test closed-bar stop')}));}
test('paper outcomes retain net costs, entry risk and provenance in durable ledger and vault',()=>{
 const id=workspace();roundTrip(id);const result=tradeFeedback(id);assert.equal(result.paper.trades,1);assert.equal(result.automaticExchangePaper.losses,1);assert.ok(result.recent[0].netR<-1);assert.equal(result.recent[0].origin,'automation');assert.equal(result.recent[0].tolerance,.08);assert.ok(result.recent[0].positionId);assert.match(readFileSync(join(folder,'vault','Research',id,'Trade Outcomes.md'),'utf8'),/Actual recorded paper closures/);tradeFeedback(id);assert.equal(tradeFeedback(id).paper.trades,1);
});
test('three automatic exchange-paper losses pause that context and a new signal cannot reopen it',async()=>{
 const id=workspace();roundTrip(id);roundTrip(id);roundTrip(id);const bot=readWorkspace(id).bots[0];assert.equal(bot.enabled,false);assert.equal(bot.feedbackPaused,true);assert.equal(bot.scanning,true);assert.equal(tradeFeedback(id).pausedContexts.length,1);
 const f=feed();await tickWorkspace(id,async()=>f,async()=>({as_of:f.candles.at(-1).time,decision:'keep_baseline',active_tolerance:.08,model:'test',studies:[],snapshot:{display_levels:[{price:1,label:'test',confirmed:true}]}}));assert.equal(readWorkspace(id).portfolio.positions.length,0);
});
test('manual/sample losses and another market do not pause unrelated automation; ledger survives UI history trimming',()=>{
 const id=workspace();for(let i=0;i<3;i++)roundTrip(id,'manual');assert.equal(readWorkspace(id).bots[0].feedbackPaused,undefined);assert.equal(tradeFeedback(id).automaticExchangePaper.trades,0);for(let i=0;i<3;i++)roundTrip(id,'automation','BTC','demo');assert.equal(readWorkspace(id).bots[0].feedbackPaused,undefined);
 for(let i=0;i<3;i++)roundTrip(id,'automation','ETH');assert.equal(readWorkspace(id).bots[0].feedbackPaused,undefined);updateWorkspace(id,ws=>({...ws,portfolio:{...ws.portfolio,fills:[]}}));assert.equal(tradeFeedback(id).paper.trades,9);assert.equal(tradeFeedback(id).automaticExchangePaper.trades,3);
 const other=workspace();assert.equal(tradeFeedback(other).paper.trades,0);
});

test('recorded failures veto a tolerance promotion without changing the baseline geometry',async()=>{
 const {candidateOutcomeVeto}=await import('../lib/server/trade-feedback.ts');const id=workspace();for(let i=0;i<5;i++)roundTrip(id);
 const veto=candidateOutcomeVeto(id,context,.08);assert.equal(veto.trades,5);assert.ok(veto.netR<0);assert.equal(candidateOutcomeVeto(id,{...context,symbol:'ETH'},.08),null);assert.equal(candidateOutcomeVeto(id,context,.12),null);
 updateWorkspace(id,ws=>({...ws,bots:ws.bots.map(b=>({...b,tolerance:.12,learning:true}))}));let calls=0;const f=feed();await tickWorkspace(id,async()=>f,async(_candles,tolerance,autoApply)=>{calls++;return {as_of:f.candles.at(-1).time,model:'test',decision:'review_paper_candidate',methodology:'Known research protocol.',candidate:.08,active_tolerance:autoApply ? .08 : tolerance,studies:[],snapshot:{display_levels:[{price:tolerance,label:'test baseline',confirmed:true}]}};});
 const bot=readWorkspace(id).bots[0];assert.equal(calls,2);assert.equal(bot.tolerance,.12);assert.equal(bot.research.active_tolerance,.12);assert.equal(bot.research.snapshot.display_levels[0].price,.12);assert.equal(bot.research.candidate,null);assert.equal(bot.research.decision,'veto_recorded_paper_losses');assert.equal(bot.enabled,false);
});

test('automatic entry records the tolerance that produced the actual promoted snapshot',async()=>{
 const id=workspace(),f=feed(),last=f.candles.at(-1),level=last.close-1;f.candles=f.candles.map((c,i,all)=>i===all.length-2?{...c,close:level-1,low:Math.min(c.low,level-1),high:Math.max(c.high,level-1)}:c);
 updateWorkspace(id,ws=>({...ws,bots:ws.bots.map(b=>({...b,learning:true,lastBar:last.time-900}))}));
 await tickWorkspace(id,async()=>f,async()=>({as_of:last.time,model:'test',methodology:'Fixture',candidate:.12,active_tolerance:.12,decision:'review_paper_candidate',studies:[],snapshot:{display_levels:[{price:level,label:'promoted',confirmed:true}]}}));
 const result=readWorkspace(id);assert.equal(result.portfolio.positions.length,1);assert.equal(result.bots[0].tolerance,.12);assert.equal(result.portfolio.positions[0].tolerance,.12);assert.equal(result.portfolio.positions[0].origin,'automation');
});
