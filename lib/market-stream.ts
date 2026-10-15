import type {LiveMarket} from './server/live-market.ts';
export type StreamContext={exchange:string;market:string;symbols:string[];timeframe:string};
const minutes:Record<string,number>={'5m':5,'15m':15,'1h':60,'4h':240};
export function streamSubscription(c:StreamContext){
 if(!minutes[c.timeframe]||!c.symbols.length||c.symbols.length>8||!c.symbols.every(s=>/^[A-Z0-9]{2,12}$/.test(s))||!['spot','perpetual'].includes(c.market))throw new Error('Unsupported stream context');
 if(c.exchange==='binance')return {url:c.market==='spot'?'wss://stream.binance.com:9443/ws':'wss://fstream.binance.com/ws',message:{method:'SUBSCRIBE',params:c.symbols.map(s=>`${s.toLowerCase()}usdt@kline_${c.timeframe}`),id:1}};
 if(c.exchange==='bybit')return {url:`wss://stream.bybit.com/v5/public/${c.market==='spot'?'spot':'linear'}`,message:{op:'subscribe',args:c.symbols.map(s=>`kline.${minutes[c.timeframe]}.${s}USDT`)}};
 if(c.exchange==='kraken'&&c.market==='spot')return {url:'wss://ws.kraken.com/v2',message:{method:'subscribe',params:{channel:'ohlc',symbol:c.symbols.map(s=>`${s}/USD`),interval:minutes[c.timeframe],snapshot:true}}};
 throw new Error('Unsupported exchange stream');
}
// Browser prices are display-only. Fixed subscriptions never accept a user URL or credentials.
export function parseStream(c:StreamContext,body:unknown,now=Date.now()):LiveMarket[]{
 if(!body||typeof body!=='object')return [];
 const b=body as Record<string,unknown>;
 const out:LiveMarket[]=[];
 const add=(symbol:string,time:unknown,values:unknown[])=>{
  if(!c.symbols.includes(symbol))return;
  const [open,high,low,close,volume]=values.map(Number),candle={time:Number(time),open,high,low,close,volume};
  const duration=minutes[c.timeframe]*60;
  if(!Object.values(candle).every(Number.isFinite)||Math.min(open,high,low,close)<=0||volume<0||low>Math.min(open,close)||high<Math.max(open,close)||candle.time>now/1000+10||now/1000-candle.time>duration*2)return;
  out.push({exchange:c.exchange,market:c.market,timeframe:c.timeframe,symbol,price:close,candle,receivedAt:now,mode:'websocket',pollSeconds:0});
 };
 if(c.exchange==='binance'&&b.e==='kline'){
  const k=b.k as Record<string,unknown>|undefined;
  if(k&&k.i===c.timeframe&&typeof b.s==='string'&&b.s.endsWith('USDT'))add(b.s.slice(0,-4),Number(k.t)/1000,[k.o,k.h,k.l,k.c,k.v]);
 }else if(c.exchange==='bybit'&&typeof b.topic==='string'&&Array.isArray(b.data)){
  const parts=b.topic.split('.');
  if(parts[0]==='kline'&&parts[1]===String(minutes[c.timeframe])&&parts[2]?.endsWith('USDT'))for(const k of b.data){if(String(k.interval)!==String(minutes[c.timeframe]))continue;add(parts[2].slice(0,-4),Number(k.start)/1000,[k.open,k.high,k.low,k.close,k.volume]);}
 }else if(c.exchange==='kraken'&&b.channel==='ohlc'&&Array.isArray(b.data)){
  for(const k of b.data)if(k.interval===minutes[c.timeframe]&&typeof k.symbol==='string'&&k.symbol.endsWith('/USD'))add(k.symbol.slice(0,-4),Date.parse(k.interval_begin)/1000,[k.open,k.high,k.low,k.close,k.volume]);
 }
 return out;
}
