import type {Candle} from './terminal-engine.ts';
export type ChartLevel={price:number;label:string;color?:string;confirmed?:boolean;kind?:'entry'|'stop'|'target'|'order'|'drawing'|'research'};
export type ChartPosition={symbol:string;positionSide?:string;positionAmt:string;entryPrice:string;unRealizedProfit?:string};
export type ChartOrder={symbol:string;positionSide?:string;side:string;type?:string;status?:string;price?:string;stopPrice?:string;reduceOnly?:boolean;closePosition?:boolean;origQty?:string};
export type ChartProtection={symbol:string;legs:{kind:string;price:string;status:string}[]};
export function movingAverage(candles:Candle[],period:number,exponential=false){
 if(!Number.isInteger(period)||period<1)return [];let sum=0,previous=0;
 return candles.flatMap((c,i)=>{sum+=c.close;if(i>=period)sum-=candles[i-period].close;if(i<period-1)return [];previous=i===period-1||!exponential?sum/period:c.close*2/(period+1)+previous*(1-2/(period+1));return [{time:c.time,value:previous}];});
}
export function relativeStrength(candles:Candle[],period=14){
 if(candles.length<=period)return null;let gain=0,loss=0;
 for(let i=1;i<candles.length;i++){const delta=candles[i].close-candles[i-1].close;if(i<=period){gain+=Math.max(0,delta)/period;loss+=Math.max(0,-delta)/period;}else{gain=(gain*(period-1)+Math.max(0,delta))/period;loss=(loss*(period-1)+Math.max(0,-delta))/period;}}
 return gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);
}
export function marketBias(candles:Candle[]){
 const unavailable={bias:'unavailable' as const,poc:null as number|null,val:null as number|null,vah:null as number|null,tolerance:null as number|null,asOf:candles.at(-1)?.time||0,reason:'Needs 122 valid closed candles with positive range volume'};
 if(candles.length<122||candles.some((c,i)=>!Object.values(c).every(Number.isFinite)||c.low<=0||c.high<c.low||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close)||c.volume<0||(i>0&&c.time<=candles[i-1].time)))return unavailable;
 const range=candles.slice(-122,-2),low=Math.min(...range.map(c=>c.low)),high=Math.max(...range.map(c=>c.high)),width=Math.max(high-low,Math.max(low,1)*1e-8)/24,volumes=Array(24).fill(0) as number[];
 for(const c of range){if(c.high===c.low)volumes[Math.min(23,Math.max(0,Math.floor((c.close-low)/width)))]+=c.volume;else for(let i=0;i<24;i++)volumes[i]+=c.volume*Math.max(0,Math.min(c.high,low+(i+1)*width)-Math.max(c.low,low+i*width))/(c.high-c.low);}
 const total=volumes.reduce((n,v)=>n+v,0);if(total<=0)return unavailable;
 const peak=volumes.indexOf(Math.max(...volumes));let left=peak,right=peak,covered=volumes[peak];
 while(covered<total*.7&&(left>0||right<23)){if((right<23?volumes[right+1]:-1)>=(left>0?volumes[left-1]:-1))covered+=volumes[++right];else covered+=volumes[--left];}
 const poc=low+(peak+.5)*width,val=low+left*width,vah=low+(right+1)*width,tolerance=Math.max((vah-val)*.05,poc*.0015),last=candles.slice(-2);
 const bias=last.every(c=>c.close>poc+tolerance)?'bullish':last.every(c=>c.close<poc-tolerance)?'bearish':'neutral';
 return {bias,poc,val,vah,tolerance,asOf:candles.at(-1)!.time,reason:`${bias==='neutral'?'Mixed or unconfirmed acceptance':`Two closed bars accepted ${bias==='bullish'?'above':'below'} frozen POC`}. Previous 120 bars, 24 OHLCV volume bins; approximation, not a trade signal.`};
}
export function accountChartLevels({exchange,market,source,symbol,mode,positions,orders,protections=[]}:{exchange:string;market:string;source:string;symbol:string;mode:'demo'|'live';positions:ChartPosition[];orders:ChartOrder[];protections?:ChartProtection[]}):ChartLevel[]{
 if(exchange!=='binance'||source!=='exchange'||(mode==='demo'&&market!=='perpetual'))return [];
 const contract=symbol+'USDT',tag=mode==='demo'?'DEMO':'REAL',levels:ChartLevel[]=[],active=['NEW','ACCEPTED','PARTIALLY_FILLED','TRIGGERING'];
 const add=(price:unknown,label:string,kind:ChartLevel['kind'],confirmed=true)=>{const n=Number(price);if(Number.isFinite(n)&&n>0)levels.push({price:n,label,color:!confirmed?'#8596aa':kind==='entry'?'#78b8fa':kind==='stop'?'#f18489':kind==='target'?'#8cd9ad':'#dabb7b',kind,confirmed});};
 for(const p of positions.filter(p=>p.symbol===contract)){
  const side=Number(p.positionAmt)>0?'LONG':'SHORT',closing=side==='LONG'?'SELL':'BUY';add(p.entryPrice,`${tag} ${side} ${Math.abs(Number(p.positionAmt))} ENTRY`,'entry');
  if(mode==='demo'){
   const protection=protections.filter(v=>v.symbol===contract).at(-1);
   for(const l of protection?.legs||[])if(active.includes(l.status)||['UNKNOWN','SUBMITTING'].includes(l.status))add(l.price,`${tag} ${l.kind}${active.includes(l.status)?'':' UNVERIFIED'}`,l.kind==='SL'?'stop':'target',active.includes(l.status));
  }
  if(mode==='live'){
   const exits=orders.filter(o=>o.symbol===contract&&o.side===closing&&(['LONG','SHORT'].includes(p.positionSide||'')?o.positionSide===p.positionSide:(!o.positionSide||o.positionSide==='BOTH'))&&(o.reduceOnly||o.closePosition||(['LONG','SHORT'].includes(p.positionSide||'')&&o.positionSide===p.positionSide))&&active.includes(o.status||''));
   const targets=exits.filter(o=>o.type?.startsWith('TAKE_PROFIT')).sort((a,b)=>(Number(a.stopPrice)-Number(b.stopPrice))*(side==='LONG'?1:-1));
   for(const o of exits.filter(o=>['STOP','STOP_MARKET'].includes(o.type||'')))add(o.stopPrice,`${tag} ${side} SL`,'stop');
   targets.forEach((o,i)=>add(o.stopPrice,`${tag} ${side} TP${i+1}`,'target'));
  }
 }
 for(const o of orders.filter(o=>o.symbol===contract&&o.type==='LIMIT'&&active.includes(o.status||'')))add(o.price,`${tag} ${o.side} LIMIT ${o.origQty||''}`,'order');
 return levels;
}
export function tradingViewSymbol(exchange:string,market:string,symbol:string){
 if(!['binance','bybit','kraken'].includes(exchange)||!['spot','perpetual'].includes(market)||!/^[A-Z0-9]{2,12}$/.test(symbol)||(exchange==='kraken'&&market!=='spot'))throw new Error('Unsupported TradingView symbol');
 return `${exchange.toUpperCase()}:${symbol}${exchange==='kraken'?'USD':'USDT'}${market==='perpetual'?'.P':''}`;
}
export type ChartDrawing={id:string;type:'level'|'trend';points:{time:number;price:number}[]};
export function validateDrawings(value:unknown):asserts value is ChartDrawing[]{
 if(!Array.isArray(value)||value.length>30||new Set(value.map(v=>v?.id)).size!==value.length)throw new Error('Use up to 30 unique chart drawings');
 for(const d of value){if(!d||typeof d.id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(d.id)||!['level','trend'].includes(d.type)||!Array.isArray(d.points)||d.points.length!==(d.type==='level'?1:2)||d.points.some((p:{time:number;price:number})=>!p||!Number.isFinite(p.time)||p.time<=0||p.time>Date.now()/1000+315360000||!Number.isFinite(p.price)||p.price<=0||p.price>1e15)||(d.type==='trend'&&d.points[0].time===d.points[1].time))throw new Error('Invalid chart drawing');}
}

export function priceDigits(value:number){return value>=100?2:value>=1?4:Math.min(10,Math.max(4,Math.ceil(-Math.log10(Math.max(value,1e-10)))+3));}
