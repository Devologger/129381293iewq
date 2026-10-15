"use client";
import {useEffect,useState} from 'react';
import type {ChartPosition,ChartOrder,ChartProtection} from '@/lib/chart-context';
export type AccountMode='demo'|'live';
export type DeskAccount={positions:(ChartPosition&{markPrice:string;unRealizedProfit:string})[];openOrders:ChartOrder[];conditionalOrders?:ChartOrder[];protections?:ChartProtection[];balances?:{asset:string;free:string;locked:string;wallet:string}[];protectionError?:string;walletUsdt?:number|null;unrealizedUsdt?:number|null;bots:{symbol:string;timeframe:string;enabled:boolean;lastBar:number;error:string|null;updatedAt:string|null}[];journal:{id:string;symbol:string;side:string;status:string}[]};
export type AccountSnapshot={mode:AccountMode;market:string;data:DeskAccount|null;error:string;updatedAt:number};
export function useExchangeAccount(mode:AccountMode,market:string,enabled:boolean){
 const [state,setState]=useState<AccountSnapshot>({mode,market,data:null,error:'',updatedAt:0});
 useEffect(()=>{
  if(!enabled)return;let active=true,busy=false,failures=0,retryAt=0;const controller=new AbortController();
  const load=async()=>{if(busy||document.hidden||Date.now()<retryAt)return;busy=true;try{const r=await fetch(mode==='demo'?'/api/terminal/demo-execution':'/api/terminal/binance-live?market='+encodeURIComponent(market),{signal:controller.signal}),data=await r.json();if(!r.ok)throw new Error(data.error||'Account connection unavailable');failures=0;retryAt=0;if(active)setState({mode,market,data:{bots:[],journal:[],...data},error:'',updatedAt:Date.now()});}catch(e){retryAt=Date.now()+Math.min(60000,5000*2**Math.min(++failures,4));if(active&&!controller.signal.aborted)setState(current=>({mode,market,data:current.mode===mode&&current.market===market?current.data:null,error:e instanceof Error?e.message:'Account unavailable',updatedAt:current.mode===mode&&current.market===market?current.updatedAt:0}));}finally{busy=false;}};
  void load();const timer=setInterval(()=>void load(),5000),visible=()=>{if(!document.hidden)void load();};document.addEventListener('visibilitychange',visible);
  return()=>{active=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[mode,market,enabled]);
 return state.mode===mode&&state.market===market?state:{mode,market,data:null,error:'',updatedAt:0};
}
