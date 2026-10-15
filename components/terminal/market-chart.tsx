"use client";
import {useEffect,useRef} from 'react';
import {CandlestickSeries,ColorType,createChart,HistogramSeries,type UTCTimestamp,type IChartApi,type ISeriesApi,type IPriceLine} from 'lightweight-charts';
import type {Candle} from '@/lib/terminal-engine';
export function MarketChart({candles,levels=[],compact=false,liveCandle}:{candles:Candle[];levels?:{price:number;label:string;confirmed?:boolean}[];compact?:boolean;liveCandle?:Candle}){
 const container=useRef<HTMLDivElement>(null),chartRef=useRef<IChartApi|null>(null),seriesRef=useRef<ISeriesApi<'Candlestick'>|null>(null),volumeRef=useRef<ISeriesApi<'Histogram'>|null>(null),lines=useRef<IPriceLine[]>([]),positioned=useRef(false);
 useEffect(()=>{
  if(!container.current)return;
  const chart=createChart(container.current,{autoSize:true,height:compact?190:360,layout:{background:{type:ColorType.Solid,color:'#0c151b'},textColor:'#7e9aa9',fontSize:10,attributionLogo:true},grid:{vertLines:{color:'#ffffff03'},horzLines:{color:'#ffffff06'}},crosshair:{vertLine:{color:'#78828b'},horzLine:{color:'#78828b'}},rightPriceScale:{borderColor:'#ffffff09',scaleMargins:{top:.13,bottom:.22}},timeScale:{borderColor:'#ffffff09',timeVisible:true,secondsVisible:false},handleScroll:true,handleScale:true});
  const series=chart.addSeries(CandlestickSeries,{upColor:'#80bda7',downColor:'#c97b79',borderVisible:false,wickUpColor:'#80bda7',wickDownColor:'#c97b79'}),volume=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume',lastValueVisible:false,priceLineVisible:false});
  volume.priceScale().applyOptions({visible:false,scaleMargins:{top:.85,bottom:0}});chartRef.current=chart;seriesRef.current=series;volumeRef.current=volume;positioned.current=false;
  return()=>{chart.remove();chartRef.current=null;seriesRef.current=null;volumeRef.current=null;lines.current=[];};
 },[compact]);
 useEffect(()=>{
  const series=seriesRef.current,volume=volumeRef.current,chart=chartRef.current;if(!series||!volume||!chart||!candles.length)return;
  const data=candles;
  series.applyOptions({priceFormat:{type:'price',precision:data.at(-1)!.close<1?4:2,minMove:data.at(-1)!.close<1?.0001:.01}});
  series.setData(data.map(c=>({...c,time:c.time as UTCTimestamp})));volume.setData(data.map(c=>({time:c.time as UTCTimestamp,value:c.volume,color:c.close>=c.open?'#80bda728':'#c97b7928'})));
  if(!positioned.current){chart.timeScale().setVisibleLogicalRange({from:data.length-(compact?45:100),to:data.length+3});positioned.current=true;}
 },[candles,compact]);
 useEffect(()=>{const series=seriesRef.current,volume=volumeRef.current;if(!series||!volume||!liveCandle||!candles.length||liveCandle.time<candles.at(-1)!.time)return;series.update({...liveCandle,time:liveCandle.time as UTCTimestamp});volume.update({time:liveCandle.time as UTCTimestamp,value:liveCandle.volume,color:liveCandle.close>=liveCandle.open?"#80bda728":"#c97b7928"});},[liveCandle,candles,compact]);
 useEffect(()=>{const series=seriesRef.current;if(!series)return;for(const line of lines.current)series.removePriceLine(line);lines.current=levels.slice(-3).map(l=>series.createPriceLine({price:l.price,color:'#d3ad65',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:l.label}));},[levels,compact]);
 return <div ref={container} className="ot-chart-canvas" style={{height:compact?190:360}} role="img" aria-label="Interactive candlestick and volume chart. Drag to pan; scroll to zoom."/>;
}
