"use client";
import {useEffect,useState} from 'react';
import type {LiveMarket} from '@/lib/server/live-market';
import {streamSubscription,parseStream} from '@/lib/market-stream';
type Snapshot={data:LiveMarket|null;error:string;checkedAt:number};
export function useLiveFeeds({exchange,market,symbols,timeframe,source}:{exchange:string;market:string;symbols:string[];timeframe:string;source:string}){
 const symbolsKey=symbols.join(','),key=[exchange,market,symbolsKey,timeframe,source].join(':');
 const [state,setState]=useState<{key:string;feeds:Record<string,Snapshot>}>({key:'',feeds:{}});
 useEffect(()=>{
  if(source!=='exchange')return;
  const context={exchange,market,symbols:symbolsKey.split(','),timeframe};
  let active=true,socket:WebSocket|null=null,retry:ReturnType<typeof setTimeout>|undefined,attempt=0,lastMessage=0,busy=false;
  const controller=new AbortController(),seen=new Map<string,number>();
  const publish=(symbol:string,data:LiveMarket|null,error='')=>{if(active)setState(current=>({key,feeds:{...(current.key===key?current.feeds:{}),[symbol]:{data:data||(current.key===key?current.feeds[symbol]?.data||null:null),error,checkedAt:data?.receivedAt||0}}}));};
  const unavailable=()=>context.symbols.forEach(s=>publish(s,null,'Stream disconnected; reconnecting.'));
  const connect=()=>{
   if(!active||document.hidden)return;
   try{
    const subscription=streamSubscription(context);socket=new WebSocket(subscription.url);const ws=socket;lastMessage=Date.now();
    ws.onopen=()=>ws.send(JSON.stringify(subscription.message));
    ws.onmessage=event=>{if(!active||ws!==socket)return;try{const rows=parseStream(context,JSON.parse(event.data));for(const row of rows){const previous=seen.get(row.symbol)||0;if(row.candle.time<previous)continue;seen.set(row.symbol,row.candle.time);lastMessage=Date.now();attempt=0;publish(row.symbol,row);}}catch{/* Reject malformed frames; heartbeat detects a stalled stream. */}};
    ws.onerror=()=>ws.close();
    ws.onclose=()=>{if(!active||ws!==socket)return;socket=null;unavailable();retry=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempt++,5))+Math.random()*500);};
   }catch{unavailable();retry=setTimeout(connect,30000);}
  };
  // REST fallback is explicitly labelled and never reported as streaming.
  const fallback=async()=>{
   if(!active||busy||document.hidden)return;
   if(socket?.readyState===WebSocket.OPEN&&Date.now()-lastMessage<12000)return;
   busy=true;
   try{await Promise.all(context.symbols.map(async symbol=>{try{const r=await fetch('/api/terminal/live?'+new URLSearchParams({exchange,market,symbol,timeframe}),{signal:controller.signal}),data=await r.json();if(!r.ok)throw new Error(data.error||'Exchange feed unavailable');if(!socket||Date.now()-lastMessage>=12000)publish(symbol,data);}catch(e){if(!controller.signal.aborted)publish(symbol,null,e instanceof Error?e.message:'Market feed unavailable');}}));}finally{busy=false;}
  };
  connect();const heartbeat=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN&&Date.now()-lastMessage>20000)socket.close();if(socket?.readyState===WebSocket.OPEN&&exchange==='bybit')socket.send(JSON.stringify({op:'ping'}));void fallback();},15000);
  const initial=setTimeout(()=>void fallback(),5000),visible=()=>{if(document.hidden){clearTimeout(retry);socket?.close();}else{clearTimeout(retry);socket?.close();socket=null;connect();void fallback();}};
  document.addEventListener('visibilitychange',visible);
  return()=>{active=false;controller.abort();clearTimeout(initial);clearTimeout(retry);clearInterval(heartbeat);socket?.close();document.removeEventListener('visibilitychange',visible);};
 },[exchange,market,timeframe,source,key,symbolsKey]);
 return state.key===key?state.feeds:{};
}
