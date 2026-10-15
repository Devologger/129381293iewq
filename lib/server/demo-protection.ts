import {randomUUID} from "node:crypto";
import {db} from './store.ts';
import type {DemoOrder} from './demo-execution.ts';
export type ProtectionPlan={stop:string;targets:string[];quantities:string[];policy:'demo-fixed-risk-v1'};
type Leg={id:string;kind:'SL'|'TP1'|'TP2'|'TP3';price:string;quantity?:string;status:string;message?:string};
export type Protection={orderId:string;workspaceId:string;symbol:string;side:string;legs:Leg[];seenPosition:boolean;checkedAt:number};
type Requester=(path:string,method:string,params:Record<string,string>)=>Promise<Record<string,unknown>>;
const ACTIVE=['NEW','ACCEPTED'],TERMINAL=['CANCELED','EXPIRED','REJECTED','FINISHED'];
function table(){db().exec('CREATE TABLE IF NOT EXISTS demo_protections (order_id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS demo_protection_locks (order_id TEXT PRIMARY KEY,token TEXT NOT NULL,expires INTEGER NOT NULL)');}
function lease(orderId:string){table();const token=randomUUID(),now=Date.now();return db().prepare('INSERT INTO demo_protection_locks VALUES (?,?,?) ON CONFLICT(order_id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE demo_protection_locks.expires<?').run(orderId,token,now+300000,now).changes?token:null;}
function release(orderId:string,token:string){db().prepare('DELETE FROM demo_protection_locks WHERE order_id=? AND token=?').run(orderId,token);}

function save(p:Protection){table();db().prepare('INSERT INTO demo_protections VALUES (?,?,?) ON CONFLICT(order_id) DO UPDATE SET state=excluded.state').run(p.orderId,p.workspaceId,JSON.stringify(p));return p;}
export function demoProtections(workspaceId:string):Protection[]{table();return (db().prepare('SELECT state FROM demo_protections WHERE workspace_id=?').all(workspaceId) as {state:string}[]).map(r=>JSON.parse(r.state));}
export function hasUnresolvedProtection(){table();return (db().prepare('SELECT state FROM demo_protections').all() as {state:string}[]).some(r=>(JSON.parse(r.state) as Protection).legs.some(l=>['SUBMITTING','UNKNOWN'].includes(l.status)));}
export function protectionPlan(price:number,quantity:string,step:string,minQty:string,tick:string,side:string):ProtectionPlan{
 const q=Number(quantity),increment=Number(step);
 if(![price,q,increment,Number(minQty),Number(tick)].every(n=>Number.isFinite(n)&&n>0))throw new Error("Invalid protection exchange filters");
 const precision=(step.replace(/0+$/,'').split('.')[1]||'').length,pxPrecision=(tick.replace(/0+$/,'').split('.')[1]||'').length;
 const floor=(n:number)=>(Math.floor((n+increment*1e-8)/increment)*increment).toFixed(precision);
 const quantities=[floor(q*.4),floor(q*.3)];quantities.push(floor(q-Number(quantities[0])-Number(quantities[1])));
 if(quantities.some(v=>Number(v)<Number(minQty))||Math.abs(quantities.reduce((sum,v)=>sum+Number(v),0)-q)>increment/10)throw new Error('Demo size is too small for three exchange-filtered targets. Increase the notional.');
 const direction=side==='BUY'?1:-1,px=(n:number)=>(Math.round(n/Number(tick))*Number(tick)).toFixed(pxPrecision);
 const stop=px(price*(1-direction*.02)),targets=[1,2,3].map(r=>px(price*(1+direction*.02*r)));
 if(![stop,...targets].every(v=>Number(v)>0)||new Set([stop,...targets]).size!==4)throw new Error('Demo protection prices do not satisfy price increments');
 return {stop,targets,quantities,policy:'demo-fixed-risk-v1'};
}
function checked(p:Protection,leg:Leg,b:Record<string,unknown>):Leg{
 const type=leg.kind==='SL'?'STOP_MARKET':'TAKE_PROFIT_MARKET';
 if(leg.kind==='SL'?b.closePosition!==true:(b.reduceOnly!==true||Number(b.quantity)!==Number(leg.quantity)))throw new Error('Conditional order is not reducing the intended position');
 if(b.clientAlgoId!==leg.id||b.symbol!==p.symbol||b.side!==p.side||b.workingType!=='MARK_PRICE'||b.positionSide!=='BOTH'||b.orderType!==type||Number(b.triggerPrice)!==Number(leg.price)||!['NEW','ACCEPTED','TRIGGERING','TRIGGERED','FINISHED','CANCELED','EXPIRED','REJECTED'].includes(String(b.algoStatus)))throw new Error('Conditional order identity or protection mismatch');
 return {...leg,status:String(b.algoStatus),message:undefined};
}
// Every conditional write is durably claimed first. Uncertain writes are queried, never repeated.
export async function protectDemo(order:DemoOrder,request:Requester){
 if(!order.protection||order.reduceOnly||!['FILLED','PARTIALLY_FILLED'].includes(order.status))return;
 const token=lease(order.id);if(!token)return demoProtections(order.workspaceId).find(p=>p.orderId===order.id);
 try{
 let p=demoProtections(order.workspaceId).find(p=>p.orderId===order.id);
 if(!p){p=save({orderId:order.id,workspaceId:order.workspaceId,symbol:order.symbol,side:order.side==='BUY'?'SELL':'BUY',seenPosition:false,checkedAt:0,legs:[order.protection.stop,...order.protection.targets].map((price,i)=>({id:`pg-${order.id.slice(4,28)}-${i}`,kind:(['SL','TP1','TP2','TP3'] as const)[i],price,...(i?{quantity:order.protection!.quantities[i-1]}:{}),status:'DRAFT'}))});}
 for(let i=0;i<p.legs.length;i++){
  let leg=p.legs[i];
  if(leg.status==='DRAFT'){
   const before=JSON.stringify(p),next={...p,legs:p.legs.map((l,j)=>j===i?{...l,status:'SUBMITTING'}:l)};
   const claim=db().prepare('UPDATE demo_protections SET state=? WHERE order_id=? AND state=?').run(JSON.stringify(next),p.orderId,before);
   if(!claim.changes)return demoProtections(order.workspaceId).find(v=>v.orderId===order.id);
   p=next;leg=p.legs[i];
   try{
    const b=await request('/fapi/v1/algoOrder','POST',{algoType:'CONDITIONAL',symbol:order.symbol,side:order.side==='BUY'?'SELL':'BUY',positionSide:'BOTH',type:leg.kind==='SL'?'STOP_MARKET':'TAKE_PROFIT_MARKET',triggerPrice:leg.price,workingType:'MARK_PRICE',clientAlgoId:leg.id,...(leg.kind==='SL'?{closePosition:'true'}:{quantity:leg.quantity!,reduceOnly:'true'})});
    leg=checked(p,leg,b);
   }catch(error){
    const e=error as {status?:number;code?:number};
    const rejected=Number.isInteger(e?.status)&&e.status!>=400&&e.status!<500&&Number.isFinite(e.code)&&![-1001,-1006,-1007].includes(e.code!);
    leg={...leg,status:rejected?'REJECTED':'UNKNOWN',message:rejected?'Conditional order explicitly rejected. Entries halted; inspect or close the demo position.':'Conditional submission unconfirmed. Entries blocked; reconcile without resending.'};
   }
  }
  if(['SUBMITTING','UNKNOWN'].includes(leg.status)){
   try{leg=checked(p,leg,await request('/fapi/v1/algoOrder','GET',{clientAlgoId:leg.id}));}catch{leg={...leg,status:'UNKNOWN',message:'Protection unconfirmed; inspect Binance demo and reconcile. No repeat submission.'};}
  }
  p=save({...p,checkedAt:Date.now(),legs:p.legs.map((l,j)=>j===i?leg:l)});
  // Install and verify the stop before submitting any targets.
  if(i===0&&!ACTIVE.includes(leg.status))break;
 }
 return p;
 }finally{release(order.id,token);}
}
export function protectionReady(p:Protection|undefined){return Boolean(p&&p.legs.every(l=>ACTIVE.includes(l.status)));}
export async function reconcileProtections(workspaceId:string,positions:{symbol:string;positionAmt:string}[],request:Requester){
 for(let p of demoProtections(workspaceId)){
  if(p.legs.every(l=>TERMINAL.includes(l.status)))continue;
  const token=lease(p.orderId);if(!token)continue;
  try{
  p=demoProtections(workspaceId).find(v=>v.orderId===p.orderId)!;
  const position=positions.find(v=>v.symbol===p.symbol&&Number(v.positionAmt)!==0);
  for(let i=0;i<p.legs.length;i++){
   let leg=p.legs[i];if(leg.status==='DRAFT'){if(!position&&p.seenPosition)p={...p,legs:p.legs.map((l,j)=>j===i?{...l,status:'CANCELED'}:l)};continue;}if(TERMINAL.includes(leg.status))continue;
   try{
    leg=checked(p,leg,await request('/fapi/v1/algoOrder','GET',{clientAlgoId:leg.id}));
    if(!position&&p.seenPosition&&ACTIVE.includes(leg.status)){
     // Flat positions must not leave stops capable of affecting a future position.
     await request('/fapi/v1/algoOrder','DELETE',{clientAlgoId:leg.id});
     leg=checked(p,leg,await request('/fapi/v1/algoOrder','GET',{clientAlgoId:leg.id}));
    }
   }catch{leg={...leg,status:'UNKNOWN',message:'Conditional state unavailable. New entries blocked.'};}
   p={...p,legs:p.legs.map((l,j)=>j===i?leg:l)};
  }
  save({...p,seenPosition:p.seenPosition||Boolean(position),checkedAt:Date.now()});
  }finally{release(p.orderId,token);}
 }
}
export function hasOutstandingProtection(symbol:string,workspaceId:string){return demoProtections(workspaceId).some(p=>p.symbol===symbol&&p.legs.some(l=>!TERMINAL.includes(l.status)));}
