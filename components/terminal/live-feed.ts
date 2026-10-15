"use client";
import {useEffect,useState} from 'react';
import type {LiveMarket} from '@/lib/server/live-market';
type Snapshot={data:LiveMarket|null;error:string;checkedAt:number};
export function useLiveFeeds({exchange,market,symbols,timeframe,source}:{exchange:string;market:string;symbols:string[];timeframe:string;source:string}){
 const symbolsKey=symbols.join(','),key=[exchange,market,symbolsKey,timeframe,source].join(':');
 const [state,setState]=useState<{key:string;feeds:Record<string,Snapshot>}>({key:'',feeds:{}});
 useEffect(()=>{
  if(source!=='exchange')return;
  let active=true,busy=false;const controller=new AbortController();
  const load=async()=>{if(busy||document.hidden)return;busy=true;try{await Promise.all(symbolsKey.split(',').map(async symbol=>{
   try{const r=await fetch('/api/terminal/live?'+new URLSearchParams({exchange,market,symbol,timeframe}),{signal:controller.signal}),data=await r.json();if(!r.ok)throw new Error(data.error||'Live display unavailable');if(active)setState(current=>({key,feeds:{...(current.key===key?current.feeds:{}),[symbol]:{data,error:'',checkedAt:Date.now()}}}));}
   catch(e){if(active&&!controller.signal.aborted)setState(current=>({key,feeds:{...(current.key===key?current.feeds:{}),[symbol]:{data:current.key===key?current.feeds[symbol]?.data||null:null,error:e instanceof Error?e.message:'Live feed unavailable',checkedAt:Date.now()}}}));}
  }));}finally{busy=false;}};
  void load();const timer=setInterval(()=>void load(),3000),visible=()=>{if(!document.hidden)void load();};document.addEventListener('visibilitychange',visible);
  return()=>{active=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[exchange,market,timeframe,source,key,symbolsKey]);
 return state.key===key?state.feeds:{};
}
