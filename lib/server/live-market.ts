import type {Candle} from '../terminal-engine.ts';
const durations:Record<string,number>={'5m':300,'15m':900,'1h':3600,'4h':14400};
const cache=new Map<string,{at:number;data:LiveMarket}>();
export type LiveMarket={exchange:string;market:string;symbol:string;timeframe:string;price:number;candle:Candle;receivedAt:number;mode:'rest-snapshot';pollSeconds:number};
// Display-only open candles. Never use this endpoint for research or execution.
export async function liveMarket(query:URLSearchParams,fetcher:typeof fetch=fetch):Promise<LiveMarket>{
 const exchange=query.get('exchange')||'',market=query.get('market')||'',symbol=query.get('symbol')||'',timeframe=query.get('timeframe')||'',duration=durations[timeframe];
 if(!['binance','bybit','kraken'].includes(exchange)||!['spot','perpetual'].includes(market)||(exchange==='kraken'&&market!=='spot')||!duration||!(/^[A-Z0-9]{2,12}$/).test(symbol))throw new Error('Unsupported live market');
 const key=[exchange,market,symbol,timeframe].join(':'),hit=cache.get(key);if(hit&&Date.now()-hit.at<2500)return hit.data;
 const url=exchange==='binance'?`https://${market==='spot'?'api.binance.com/api/v3':'fapi.binance.com/fapi/v1'}/klines?symbol=${symbol}USDT&interval=${timeframe}&limit=2`:exchange==='bybit'?`https://api.bybit.com/v5/market/kline?category=${market==='spot'?'spot':'linear'}&symbol=${symbol}USDT&interval=${duration/60}&limit=2`:`https://api.kraken.com/0/public/OHLC?pair=${symbol==='BTC'?'XBT':symbol}USD&interval=${duration/60}&since=${Math.floor(Date.now()/1000)-duration*2}`;
 const response=await fetcher(url,{signal:AbortSignal.timeout(6000),cache:'no-store'});if(!response.ok)throw new Error(`Live exchange feed HTTP ${response.status}`);
 const body=await response.json();let rows:unknown[][];
 if(exchange==='bybit'){if(body.retCode!==0)throw new Error('Live exchange rejected market');rows=body.result?.list?.toReversed();}
 else if(exchange==='kraken'){if(body.error?.length)throw new Error('Live exchange rejected market');const pair=Object.keys(body.result||{}).find(p=>p!=='last');rows=pair?body.result[pair]:[];}
 else rows=body;
 if(!Array.isArray(rows)||!rows.length)throw new Error('Live exchange feed has no candles');
 const row=rows.at(-1)!;const candle:Candle={time:Math.floor(Number(row[0])/(exchange==='kraken'?1:1000)),open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),volume:Number(row[exchange==='kraken'?6:5])};
 const now=Date.now();
 if(!Object.values(candle).every(Number.isFinite)||Math.min(candle.open,candle.high,candle.low,candle.close)<=0||candle.volume<0||candle.low>Math.min(candle.open,candle.close)||candle.high<Math.max(candle.open,candle.close)||candle.time>now/1000+10||now/1000-candle.time>duration*2)throw new Error('Invalid or stale live exchange candle');
 const data:LiveMarket={exchange,market,symbol,timeframe,price:candle.close,candle,receivedAt:now,mode:'rest-snapshot',pollSeconds:3};
 if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{at:now,data});return data;
}
