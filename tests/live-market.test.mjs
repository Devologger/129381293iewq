import test from 'node:test';import assert from 'node:assert/strict';import {liveMarket} from '../lib/server/live-market.ts';
const query=(exchange,symbol='BTC',market='spot')=>new URLSearchParams({exchange,symbol,market,timeframe:'15m'});
const time=Math.floor(Date.now()/900000)*900000;
test('live display accepts forming candles, normalizes three exchanges and caches snapshots',async()=>{
 for(const [exchange,symbol] of [['binance','BTC'],['bybit','ETH'],['kraken','SOL']]){let calls=0;const fetcher=async url=>{calls++;assert.equal(new URL(url).protocol,'https:');const row=[exchange==='kraken'?time/1000:time,'100','103','99','102','7','8'];return Response.json(exchange==='binance'?[row]:exchange==='bybit'?{retCode:0,result:{list:[row]}}:{error:[],result:{SOLUSD:[row],last:time/1000}});};const result=await liveMarket(query(exchange,symbol),fetcher);assert.equal(result.price,102);assert.equal(result.candle.time,time/1000);assert.equal(result.pollSeconds,3);assert.equal(result.mode,'rest-snapshot');await liveMarket(query(exchange,symbol),fetcher);assert.equal(calls,1);}
});
test('live display rejects unsupported destinations, stale candles and inconsistent prices',async()=>{
 await assert.rejects(liveMarket(query('arbitrary-host')),/Unsupported/);await assert.rejects(liveMarket(query('kraken','ETH','perpetual')),/Unsupported/);
 await assert.rejects(liveMarket(query('binance','STALE'),async()=>Response.json([[time-9000000,'100','101','99','100','2']])),/stale/);
 await assert.rejects(liveMarket(query('binance','INVALID'),async()=>Response.json([[time,'100','90','99','100','2']])),/Invalid/);
 await assert.rejects(liveMarket(query('bybit','FAILED'),async()=>Response.json({retCode:1})),/rejected/);
});
