import {contextKey,updateWorkspace,readWorkspace,type Bot,type Context} from './store.ts';
import {validateContext} from './worker.ts';
export function configureScan(id:string,context:Context,enabled:boolean){
 validateContext(context);if(typeof enabled!=='boolean')throw new Error('Use an explicit scan switch');
 if(context.source!=='exchange')throw new Error('Watchlist scanning requires exchange candles; sample data is static');
 return updateWorkspace(id,ws=>{
  if(!enabled)return {...ws,bots:ws.bots.map(b=>({...b,scanning:false}))};
  const keys=ws.watchlist.map(symbol=>contextKey({...context,symbol}));
  const retained=ws.bots.filter(b=>!keys.includes(b.key));
  if(retained.length+keys.length>8)throw new Error('Eight configured markets maximum. Remove other configured bots first.');
  const scanned=ws.watchlist.map(symbol=>{const c={...context,symbol},key=contextKey(c),existing=ws.bots.find(b=>b.key===key);return {...c,key,enabled:false,learning:false,tolerance:.08,lastBar:0,research:null,error:null,updatedAt:null,...existing,scanning:true} as Bot;});
  return {...ws,bots:[...retained.map(b=>({...b,scanning:false})),...scanned]};
 });
}
export function scannerStatus(id:string){const ws=readWorkspace(id),bots=ws.bots.filter(b=>b.scanning||b.enabled||b.learning);return {enabled:bots.some(b=>b.scanning),pollSeconds:30,lastCycle:ws.lastWorkerAt,error:ws.workerError,markets:bots.map(b=>({key:b.key,symbol:b.symbol,exchange:b.exchange,timeframe:b.timeframe,source:b.source,lastBar:b.lastBar,updated:b.updatedAt,error:b.error,scanning:Boolean(b.scanning),paperExecution:b.enabled,decision:b.research?.decision||'Awaiting first closed-candle scan'}))};}
