"use client";
import {tradingViewSymbol} from '@/lib/chart-context';
export function TradingViewChart({exchange,market,symbol,timeframe}:{exchange:string;market:string;symbol:string;timeframe:string}){
 const ticker=tradingViewSymbol(exchange,market,symbol),interval=({'5m':'5','15m':'15','1h':'60','4h':'240'} as Record<string,string>)[timeframe]||'15';
 const url='https://s.tradingview.com/widgetembed/?'+new URLSearchParams({symbol:ticker,interval,theme:'dark',style:'1',timezone:'Etc/UTC',locale:'en',hidesidetoolbar:'0',symboledit:'0',saveimage:'1',withdateranges:'1',allow_symbol_change:'0',studies:'[]',toolbarbg:'0c151b'});
 return <div className="penguin-tv-chart"><iframe title={`TradingView public chart ${ticker}`} src={url} height="560" loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" allow="fullscreen"/><p>Public chart by <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}`} target="_blank" rel="noreferrer">TradingView ↗</a>. Only symbol and chart preferences are shared. Private trade overlays and Penguin drawings are available on the Penguin chart. Widget availability and features are controlled by TradingView.</p></div>;
}
