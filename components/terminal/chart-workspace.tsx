"use client";
import {useRef,useState,useEffect} from 'react';
import type {Candle} from '@/lib/terminal-engine';
import type {ChartLevel,ChartDrawing} from '@/lib/chart-context';
import {relativeStrength} from '@/lib/chart-context';
import {MarketChart} from './market-chart';
import {TradingViewChart} from './tradingview-chart';
const EMPTY:ChartDrawing[]=[];
export function ChartWorkspace({candles,liveCandle,levels,tradeLevels,drawings=EMPTY,onDrawings,contextKey,exchange,market,symbol,timeframe,sample}:{candles:Candle[];liveCandle?:Candle;levels:ChartLevel[];tradeLevels:ChartLevel[];drawings?:ChartDrawing[];onDrawings:(d:ChartDrawing[])=>void;contextKey:string;exchange:string;market:string;symbol:string;timeframe:string;sample:boolean}){
 const [mode,setMode]=useState<'native'|'tradingview'>('native'),[ema,setEma]=useState(true),[sma,setSma]=useState(false),[poc,setPoc]=useState(true),[showTrades,setShowTrades]=useState(true),[tool,setTool]=useState<'cursor'|'level'|'trend'>('cursor'),[full,setFull]=useState(false),[fitTrades,setFitTrades]=useState(0),[pending,setPending]=useState<{time:number;price:number}|null>(null);
 const wrapper=useRef<HTMLDivElement>(null);
 useEffect(()=>{const change=()=>setFull(document.fullscreenElement===wrapper.current);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change);},[]);
 const rsi=relativeStrength(candles);
 const annotate=(point:{time:number;price:number})=>{
  if(tool==='cursor'||drawings.length>=30)return;
  if(tool==='level'){onDrawings([...drawings,{id:crypto.randomUUID(),type:'level',points:[point]}]);setTool('cursor');}
  else if(!pending)setPending(point);else if(pending.time!==point.time){onDrawings([...drawings,{id:crypto.randomUUID(),type:'trend',points:[pending,point]}]);setPending(null);setTool('cursor');}
 };
 return <div className="penguin-chart-workspace" ref={wrapper} data-context={contextKey}>
  <div className="penguin-chart-toolbar"><div role="group" aria-label="Chart provider"><button className={mode==='native'?'active':''} onClick={()=>setMode('native')}>Penguin chart</button><button disabled={sample} className={mode==='tradingview'?'active':''} onClick={()=>setMode('tradingview')}>TradingView</button></div><button aria-label={full?'Exit chart fullscreen':'Chart fullscreen'} onClick={()=>{if(full)void document.exitFullscreen?.();else void wrapper.current?.requestFullscreen?.().catch(()=>{});}}>⛶</button></div>
  {mode==='native'?<><div className="penguin-study-toolbar"><label><input type="checkbox" checked={ema} onChange={e=>setEma(e.target.checked)}/> EMA 20</label><label><input type="checkbox" checked={sma} onChange={e=>setSma(e.target.checked)}/> SMA 50</label><label><input type="checkbox" checked={poc} onChange={e=>setPoc(e.target.checked)}/> POC</label><label><input type="checkbox" checked={showTrades} onChange={e=>setShowTrades(e.target.checked)}/> Trades</label><span title="Wilder RSI(14) from closed candles">RSI 14 · {rsi===null?'—':rsi.toFixed(1)}</span><button aria-pressed={tool==='level'} onClick={()=>{setPending(null);setTool(tool==='level'?'cursor':'level');}}>Horizontal line</button><button aria-pressed={tool==='trend'} onClick={()=>{setPending(null);setTool(tool==='trend'?'cursor':'trend');}}>Trend line</button><button disabled={!drawings.length} onClick={()=>onDrawings(drawings.slice(0,-1))}>Undo drawing</button><button disabled={!drawings.length} onClick={()=>onDrawings([])}>Clear drawings</button><button disabled={!tradeLevels.length} onClick={()=>setFitTrades(n=>n+1)}>Fit trades</button></div>
   <MarketChart fitTradesSignal={fitTrades} candles={candles} liveCandle={liveCandle} levels={poc?levels:levels.filter(l=>l.kind!=='research')} tradeLevels={showTrades?tradeLevels:[]} drawings={drawings} ema={ema} sma={sma} height={full?Math.max(320,window.innerHeight-180):440} onPoint={tool==='cursor'?undefined:annotate}/>
   <div className="penguin-chart-legend">{showTrades&&tradeLevels.map((l,i)=><span key={l.label+i} style={{color:l.color}}>{l.label} · {l.price.toLocaleString(undefined,{maximumFractionDigits:10})}</span>)}{!tradeLevels.length&&<span>No matching active trades on this instrument.</span>}</div>
   {tool!=='cursor'&&<p className="penguin-drawing-hint" role="status">{tool==='level'?'Click a price on the chart to save a horizontal annotation.':pending?'Choose the second point on a different candle.':'Choose two candles to save a trend annotation.'} Drawings do not place or modify orders. <button onClick={()=>{setTool('cursor');setPending(null);}}>Cancel</button></p>}
  </>:<TradingViewChart exchange={exchange} market={market} symbol={symbol} timeframe={timeframe}/>}
 </div>;
}
