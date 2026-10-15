import {createHmac} from 'node:crypto';
import {credential} from './store.ts';
// Production account connector is intentionally GET-only. It cannot place, cancel or transfer funds.
const BASES={spot:'https://api.binance.com',perpetual:'https://fapi.binance.com'} as const;
export type AccountPosition={symbol:string;positionSide:string;positionAmt:string;entryPrice:string;markPrice:string;unRealizedProfit:string};
export type AccountOrder={symbol:string;side:string;positionSide:string;type:string;status:string;price:string;stopPrice:string;origQty:string;orderId:string;reduceOnly:boolean;closePosition:boolean};
const number=(v:unknown)=>{if(!['string','number'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(Number(v)))throw new Error('Invalid real Binance account values');return String(v);};
function orders(rows:unknown,conditional=false):AccountOrder[]{
 if(!Array.isArray(rows))throw new Error('Invalid Binance open-order response');
 return rows.map(r=>{if(!r||typeof r!=='object'||!(/^[A-Z0-9]{2,24}$/).test(r.symbol)||!['BUY','SELL'].includes(r.side))throw new Error('Invalid Binance order identity');if(!/^\d+$/.test(String(conditional?r.algoId:r.orderId)))throw new Error('Invalid Binance order ID');return {symbol:r.symbol,side:r.side,positionSide:r.positionSide||'BOTH',type:String(r.type||r.orderType||''),status:String(r.status||r.algoStatus||''),price:number(r.price??0),stopPrice:number(r.stopPrice??r.triggerPrice??0),origQty:number(r.origQty??r.quantity??0),orderId:String(conditional?r.algoId:r.orderId),reduceOnly:r.reduceOnly===true,closePosition:r.closePosition===true};});
}
export async function binanceLiveAccount(market:'spot'|'perpetual',fetcher:typeof fetch=fetch){
 if(!['spot','perpetual'].includes(market))throw new Error('Choose Binance spot or perpetual account');
 const key=credential('BINANCE_LIVE_API_KEY'),secret=credential('BINANCE_LIVE_API_SECRET');
 if(!key||!secret)throw new Error('Add separate real Binance API key and secret privately in Settings. Demo keys are not reused.');
 const base=BASES[market],clockResponse=await fetcher(base+(market==='spot'?'/api/v3/time':'/fapi/v1/time'),{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!clockResponse.ok)throw new Error(`Real Binance clock HTTP ${clockResponse.status}`);
 const clock=await clockResponse.json();if(!Number.isSafeInteger(clock.serverTime)||clock.serverTime<=0)throw new Error('Invalid Binance server clock');
 const signed=async(path:string)=>{
  const allowed=market==='spot'?['/api/v3/account','/api/v3/openOrders']:['/fapi/v3/account','/fapi/v3/positionRisk','/fapi/v1/openOrders','/fapi/v1/openAlgoOrders'];
  if(!allowed.includes(path))throw new Error('Unsupported read-only account path');
  const query=new URLSearchParams({timestamp:String(clock.serverTime),recvWindow:'5000'}).toString(),signature=createHmac('sha256',secret).update(query).digest('hex');
  const r=await fetcher(`${base}${path}?${query}&signature=${signature}`,{method:'GET',headers:{'X-MBX-APIKEY':key},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new Error(`Real Binance account HTTP ${r.status}. Check API read permissions, IP restrictions and regional availability.`);
  try{return await r.json();}catch{throw new Error('Real Binance returned an unreadable account response');}
 };
 const balances=(rows:unknown,spot:boolean)=>{if(!Array.isArray(rows))throw new Error('Invalid Binance balance response');return rows.map(r=>{if(!r||typeof r!=='object'||!(/^[A-Z0-9]{1,24}$/).test(r.asset))throw new Error('Invalid Binance asset');return {asset:r.asset,free:number(spot?r.free:r.availableBalance),locked:number(spot?r.locked:0),wallet:number(spot?Number(r.free)+Number(r.locked):r.walletBalance)};}).filter(r=>Number(r.wallet)!==0||Number(r.free)!==0);};
 if(market==='spot'){
  const [account,open]=await Promise.all([signed('/api/v3/account'),signed('/api/v3/openOrders')]);
  return {environment:'BINANCE REAL' as const,mode:'read-only' as const,market,receivedAt:Date.now(),balances:balances(account.balances,true),positions:[] as AccountPosition[],openOrders:orders(open),conditionalOrders:[] as AccountOrder[],protectionError:'',walletUsdt:null,unrealizedUsdt:null};
 }
 const [account,rawPositions,open,conditionals]=await Promise.all([signed('/fapi/v3/account'),signed('/fapi/v3/positionRisk'),signed('/fapi/v1/openOrders'),signed('/fapi/v1/openAlgoOrders').then(rows=>({rows,error:''})).catch(()=>({rows:[],error:'Conditional orders unavailable; SL/TP protection cannot be verified from this account snapshot.'}))]);
 if(!Array.isArray(rawPositions))throw new Error('Invalid Binance position response');
 const positions:AccountPosition[]=rawPositions.map(p=>{if(!p||!(/^[A-Z0-9]{2,24}$/).test(p.symbol)||!['BOTH','LONG','SHORT'].includes(p.positionSide))throw new Error('Invalid Binance position identity');return {symbol:p.symbol,positionSide:p.positionSide,positionAmt:number(p.positionAmt),entryPrice:number(p.entryPrice),markPrice:number(p.markPrice),unRealizedProfit:number(p.unRealizedProfit)};}).filter(p=>Number(p.positionAmt)!==0);
 if(positions.some(p=>Number(p.entryPrice)<=0||Number(p.markPrice)<=0))throw new Error('Invalid active Binance position price');
 return {environment:'BINANCE REAL' as const,mode:'read-only' as const,market,receivedAt:Date.now(),balances:balances(account.assets,false),positions,openOrders:orders(open),conditionalOrders:orders(conditionals.rows,true),protectionError:conditionals.error,walletUsdt:Number(number(account.totalWalletBalance)),unrealizedUsdt:Number(number(account.totalUnrealizedProfit))};
}
export type BinanceLiveAccount=Awaited<ReturnType<typeof binanceLiveAccount>>;
