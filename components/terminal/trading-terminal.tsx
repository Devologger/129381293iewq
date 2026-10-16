"use client";

import Link from "next/link";
import {ChartWorkspace} from './chart-workspace';
import {useExchangeAccount,type AccountMode} from './exchange-account';
import {priceDigits,accountChartLevels,marketBias,type ChartDrawing,type ChartLevel} from '@/lib/chart-context';
import {useLiveFeeds} from "./live-feed";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {AlertsSettings} from "./alerts-settings";
import {TradingOverview} from "./trading-overview";
import { MarketChart } from "./market-chart";
import { IntegrationSettings } from "./integration-settings";
import { DemoDesk } from "./demo-desk";
import { StrategyExplorer } from "./strategy-explorer";
import { AgentTeamPanel } from "./agent-team-panel";
import { VaultBrowser } from "./vault-browser";
import {AppHelper} from "./app-helper";
import type { Bot, Workspace } from "@/lib/server/store";
import { INITIAL_PORTFOLIO, demoCandles, vaultReport, type Feed, type Portfolio, type Research } from "@/lib/terminal-engine";
import "./terminal.css";
import "./professional.css";

type View = "terminal" | "markets" | "research" | "vault" | "integrations" | "demo" | "team" | "explorer";
const ICONS: Record<string, string> = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  chart: "M3 19h18 M5 15l4-5 4 3 6-9 M15 4h4v4",
  brain: "M9 4a3 3 0 0 0-5 3 4 4 0 0 0-1 7 4 4 0 0 0 6 5 M15 4a3 3 0 0 1 5 3 4 4 0 0 1 1 7 4 4 0 0 1-6 5 M12 3v18 M7 9l5 3 5-3 M7 16l5-4 5 4",
  vault: "M4 3h12l4 4v14H4z M14 3v5h6 M8 12h8 M8 16h5",
  link: "M10 14l4-4 M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  arrow: "M5 12h14 M13 6l6 6-6 6", plus: "M12 5v14 M5 12h14", close: "M6 6l12 12 M6 18L18 6",
  pause: "M8 5v14 M16 5v14", play: "M7 4l14 8-14 8z", down: "M5 9l7 7 7-7", search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M16 16l5 5",
  check: "M4 12l5 5L20 6", download: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4", settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6", shield: "M12 2l8 4v6c0 5-8 10-8 10s-8-5-8-10V6z M8 12l3 3 5-6",
};
function Icon({ name, size = 18 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] || ICONS.grid} /></svg>; }
const usd = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: priceDigits(value), maximumFractionDigits: priceDigits(value) });
const NAMES: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", XRP: "XRP" };
const NAV: { view: View; icon: string; label: string }[] = [
 {view:"terminal",icon:"grid",label:"Overview"},{view:"markets",icon:"chart",label:"Markets"},
 {view:"team",icon:"brain",label:"Research"},{view:"vault",icon:"vault",label:"Knowledge"},
 {view:"research",icon:"chart",label:"Strategy tests"},{view:"explorer",icon:"chart",label:"Strategy library"},
 {view:"demo",icon:"shield",label:"Advanced demo orders"},{view:"integrations",icon:"settings",label:"Settings"}];
const EMPTY_LEVELS: { price: number; label: string; confirmed: boolean }[] = [];

export function TradingTerminal({ initialView = "terminal" }: { initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [accountReady,setAccountReady]=useState(false);
  useEffect(()=>{let active=true;void fetch("/api/account").then(r=>r.json()).then(data=>{if(!active)return;if(data.requireLogin&&!data.account){window.location.replace("/account");return;}setAccountReady(true);}).catch(()=>{if(active)setAccountReady(true);});return()=>{active=false;};},[]);
  const [mobileMenu, setMobileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!mobileMenu) return;
    const previous = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenu(false);
      if (event.key !== "Tab") return;
      const buttons = menuRef.current?.querySelectorAll<HTMLElement>("button, a[href]");
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (previous?.isConnected) previous.focus(); };
  }, [mobileMenu]);
  const [exchange, setExchange] = useState("binance");
  const [market, setMarket] = useState("perpetual");
  const [timeframe, setTimeframe] = useState("15m");
  const [symbol, setSymbol] = useState("BTC");
  const [accountMode,setAccountMode]=useState<AccountMode>("demo");
  const account=useExchangeAccount(accountMode,market,accountReady&&["terminal","markets"].includes(view));
  const [chartDrawings,setChartDrawings]=useState<Record<string,ChartDrawing[]>>({});
  const [watchlist, setWatchlist] = useState(["BTC", "ETH", "SOL", "XRP"]);
  const [source, setSource] = useState<"demo" | "exchange">("exchange");
  const liveFeeds=useLiveFeeds({exchange,market,symbols:watchlist.includes(symbol)?watchlist:[symbol,...watchlist.slice(0,7)],timeframe,source});
  const live=liveFeeds[symbol]||{data:null,error:"",checkedAt:0};
  const [liveNow,setLiveNow]=useState(0);
  useEffect(()=>{const tick=()=>setLiveNow(Date.now()),initial=setTimeout(tick,0),timer=setInterval(tick,1000);return()=>{clearTimeout(initial);clearInterval(timer);};},[]);
  const liveReady=source==='exchange'&&Boolean(live.data)&&!live.error&&liveNow-live.checkedAt<20000;

  const [feeds, setFeeds] = useState<Record<string, Feed>>({});
  const [portfolio, setPortfolio] = useState<Portfolio>(INITIAL_PORTFOLIO);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [researchBusy, setResearchBusy] = useState(false);
  const [research, setResearch] = useState<Research | null>(null);
  const [researchKey, setResearchKey] = useState("");
  const [bots, setBots] = useState<Bot[]>([]);
  const [workerStatus, setWorkerStatus] = useState<{ at: string | null; error: string | null }>({ at: null, error: null });
  const [notice, setNotice] = useState("Welcome to Penguin. Connect your Binance demo account in Settings.");
  const [feedError, setFeedError] = useState("");
  const [modal, setModal] = useState(false);
  const modalRef = useRef<HTMLElement | null>(null);
  const [newSymbol, setNewSymbol] = useState("");
  const [helpOpen,setHelpOpen]=useState(false);
  const closeHelp=useCallback(()=>setHelpOpen(false),[]);
  const [, setDiscord] = useState(false);
  const localTolerance = .08;
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiKey, setAiKey] = useState("");
  const feedKey = `${exchange}:${market}:${symbol}:${timeframe}:${source}`;
  const sample = useMemo<Feed>(() => ({ candles: demoCandles(symbol, timeframe), exchange, market, symbol, timeframe, source: "demo", fetchedAt: 0 }), [symbol, timeframe, exchange, market]);
  const selectedFeed = feeds[symbol];
  const feed = selectedFeed && selectedFeed.exchange === exchange && selectedFeed.market === market && selectedFeed.timeframe === timeframe && selectedFeed.source === source ? selectedFeed : source === "demo" ? sample : null;
  const selectedBot = bots.find(b => b.key === feedKey);
  const tolerance = selectedBot?.tolerance ?? localTolerance;
  const localResearch = researchKey === feedKey ? research : null;
  const matchingResearch = selectedBot?.research && (!localResearch || selectedBot.research.as_of >= localResearch.as_of) ? selectedBot.research : localResearch;

  const restoredContext=useRef(false);
  const applyWorkspace = useCallback((data: Workspace) => {
    setPortfolio(current => JSON.stringify(current) === JSON.stringify(data.portfolio) ? current : data.portfolio);
    setBots(current => JSON.stringify(current) === JSON.stringify(data.bots) ? current : data.bots);
    setWatchlist(current => current.join(",") === data.watchlist.join(",") ? current : data.watchlist);
    setChartDrawings(current=>JSON.stringify(current)===JSON.stringify(data.chartDrawings||{})?current:data.chartDrawings||{});
    setWorkerStatus({ at: data.lastWorkerAt, error: data.workerError });
    if(!restoredContext.current){restoredContext.current=true;const active=data.bots.find(b=>b.scanning)||data.bots.find(b=>b.enabled);if(active){setExchange(active.exchange);setMarket(active.market);setTimeframe(active.timeframe);setSymbol(active.symbol);setSource(active.source);}}
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let loading=false;
    const load = async () => {
      if(loading||document.hidden)return;loading=true;
      try {
        const response = await fetch("/api/terminal/workspace", { signal: controller.signal });
        if (!response.ok) { const failure=await response.json();if(failure.signInRequired){window.location.replace("/account");return;}throw new Error("Persistent workspace is unavailable"); }
        const data = await response.json();
        if (!controller.signal.aborted) { applyWorkspace(data); setLoaded(true); }
      } catch (error) { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Workspace load failed"); } finally{loading=false;}
    };
    void load();
    const timer = setInterval(load, 5000);
    fetch("/api/terminal/discord").then(r => r.json()).then(d => setDiscord(d.configured)).catch(() => {});
    return () => { controller.abort(); clearInterval(timer); };
  }, [applyWorkspace]);
  async function workspaceAction(payload: Record<string, unknown>) {
    if (!loaded) throw new Error("Wait for the persistent workspace to load");
    const response = await fetch("/api/terminal/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Workspace action failed");
    if (data.portfolio) applyWorkspace(data);
    return data;
  }
  async function saveWatchlist(symbols: string[]) {
    try { await workspaceAction({ action: "watchlist", symbols }); if (!symbols.includes(symbol)) setSymbol(symbols[0]); setNotice("Watchlist saved to your workspace."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Watchlist update failed"); }
  }

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(false);
      if (event.key !== "Tab") return;
      const items = modalRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]");
      if (!items?.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [modal]);

  const refresh = useCallback(async (signal: AbortSignal) => {
    setBusy(true);
    const result: Record<string, Feed> = {};
    const errors: string[] = [];
    await Promise.all([...new Set([...watchlist,symbol])].map(async ticker => {
      try {
        let candles;
        if (source === "demo") candles = demoCandles(ticker, timeframe);
        else {
          const response = await fetch(`/api/terminal/market?exchange=${exchange}&symbol=${ticker}&timeframe=${timeframe}&market=${market}`, { signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          candles = data.candles;
        }
        result[ticker] = { candles, exchange, market, symbol: ticker, timeframe, source, fetchedAt: Date.now() };
      } catch (error) { if (!signal.aborted) errors.push(`${ticker}: ${error instanceof Error ? error.message : "Feed unavailable"}`); }
    }));
    if (signal.aborted) return;
    setFeeds(result); setFeedError(errors.join(" · ")); setBusy(false);
  }, [exchange, market, timeframe, source, watchlist,symbol]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { void refresh(controller.signal); }, 0);
    let loading=false;const update=async()=>{if(loading||document.hidden)return;loading=true;try{await refresh(controller.signal);}finally{loading=false;}};
    const poll = setInterval(() => { void update(); }, 30000);
    const visible=()=>{if(!document.hidden)void update();};document.addEventListener("visibilitychange",visible);
    return () => { controller.abort(); clearTimeout(timer); clearInterval(poll);document.removeEventListener("visibilitychange",visible); };
  }, [refresh]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  function notify(message: string) { setNotice(message); }
  function switchContext(action: () => void) { setAiNote(""); action(); }
  async function runResearch() {
    if (!feed) return notify("Load a market feed first.");
    const key = feedKey;
    setAiNote("");
    setResearchBusy(true);
    try {
      const response = await fetch("/api/terminal/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: { exchange, market, symbol, timeframe, source }, tolerance }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResearch(data); setResearchKey(key); notify(`Research complete. ${data.decision === "keep_baseline" ? "Baseline retained; candidate has not met the evidence gates." : "A candidate is ready for paper review."}`);
    } catch (error) { notify(error instanceof Error ? error.message : "Research failed"); }
    finally { setResearchBusy(false); }
  }
  async function analyzeResearch() {
    if (!feed || !matchingResearch) return notify("Run bounded research before requesting an AI analysis.");
    const key = feedKey;
    setAiBusy(true);
    try {
      const response = await fetch("/api/terminal/analyst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contextKey: feedKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI analysis failed");
      setAiNote(data.note); setAiKey(key); notify("Council briefing saved to Obsidian. Review its evidence before changing the strategy.");
    } catch (error) { notify(error instanceof Error ? error.message : "AI analyst is unavailable"); }
    finally { setAiBusy(false); }
  }
  function exportNote() {
    if (!feed) return notify("Load a market feed to export.");
    const blob = new Blob([vaultReport(feed, matchingResearch, portfolio) + (aiNote && aiKey === feedKey ? `\n## AI advisory note\n${aiNote}\n` : "")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${symbol}-fib-research-${new Date().toISOString().slice(0, 10)}.md`; link.click(); URL.revokeObjectURL(url);
    notify("Markdown report exported. Add it to your Obsidian vault.");
  }

  const levels = matchingResearch?.snapshot.display_levels || EMPTY_LEVELS;

  function focusSymbol(ticker:string,fromAccount=false){
    if(!/^[A-Z0-9]{2,12}$/.test(ticker))return notify('This account instrument is not a supported USDT chart.');
    switchContext(()=>{setSymbol(ticker);if(fromAccount){setExchange('binance');setSource('exchange');if(accountMode==='demo')setMarket('perpetual');}});setView('terminal');
  }
  const chartPanel = (ticker: string, compact: boolean) => {
    const f = ticker === symbol ? feed : feeds[ticker];
    const valid = f && f.exchange === exchange && f.market === market && f.source === source && f.timeframe === timeframe;
    const snapshot=liveFeeds[ticker];
    const forming=source==='exchange'&&snapshot?.data&&!snapshot.error&&liveNow-snapshot.checkedAt<20000?snapshot.data.candle:undefined;
    const candle = forming || (valid ? f.candles.at(-1) : null);
    const bias=valid?marketBias(f.candles):null;
    const overlays=accountChartLevels({exchange,market,source,symbol:ticker,mode:accountMode,positions:account.data?.positions||[],orders:[...(account.data?.openOrders||[]),...(account.data?.conditionalOrders||[])],protections:account.data?.protections||[]}).map(l=>account.error||liveNow-account.updatedAt>15000?{...l,label:l.label+' · STALE',confirmed:false,color:'#8596aa'}:l);
    const context={exchange,market,source,symbol:ticker,timeframe},key=`${exchange}:${market}:${ticker}:${timeframe}:${source}`;
    const contextLevels:ChartLevel[]=[...(ticker===symbol?levels:EMPTY_LEVELS),...(bias?.poc?[{price:bias.poc,label:'POC · frozen 120',kind:'research' as const,color:'#d3ad65'}]:[])];
    return <section className={`ot-panel ot-market-panel ${compact ? "compact" : ""}`} key={ticker}>
      <div className="ot-chart-head"><div className="ot-pair"><span className={`ot-coin coin-${ticker}`}>{ticker === "BTC" ? "₿" : ticker === "ETH" ? "Ξ" : ticker.slice(0, 1)}</span><div><strong><button className="penguin-symbol-link" aria-label={`Open ${ticker} chart`} onClick={()=>focusSymbol(ticker)}>{ticker}<span> / {exchange === "kraken" ? "USD" : "USDT"}</span></button></strong><small>{NAMES[ticker] || ticker} · {market === "spot" ? "Spot" : "Perpetual"}</small><span className={`penguin-bias-badge ${bias?.bias||'unavailable'}`} title={bias?.reason||'Closed-candle feed unavailable'}>{source==='demo'?'SAMPLE · ':''}{bias?.bias==='bullish'?'↗ BULLISH':bias?.bias==='bearish'?'↘ BEARISH':bias?.bias==='neutral'?'↔ NEUTRAL':'BIAS UNAVAILABLE'}</span></div></div><div className="ot-chart-price"><span key={candle?.close} className="penguin-price-tick">{candle ? price(candle.close) : "—"}</span><small className="ot-muted">{timeframe} · {source === "demo" ? "SAMPLE" : forming ? "FORMING CANDLE" : "CLOSED BARS"}</small></div></div>
      {valid ? compact?<><MarketChart candles={f.candles} compact liveCandle={forming} levels={contextLevels} tradeLevels={overlays}/><div className="penguin-chart-legend">{overlays.map((l,i)=><span key={i} style={{color:l.color}}>{l.label} · {price(l.price)}</span>)}</div></>:<ChartWorkspace key={key} contextKey={key} exchange={exchange} market={market} symbol={ticker} timeframe={timeframe} sample={source==='demo'} candles={f.candles} liveCandle={forming} levels={contextLevels} tradeLevels={overlays} drawings={chartDrawings[key]} onDrawings={drawings=>void workspaceAction({action:'drawings',context,drawings}).catch(e=>notify(e.message))}/> : <div className="ot-chart-empty">{busy ? "Connecting to market feed…" : "Market feed unavailable. Try another exchange or sample mode."}</div>}
      <div className="ot-chart-foot"><span><i className={`ot-dot ${source === "demo" ? "gold" : ""}`} /> {exchange.toUpperCase()} · {source === "demo" ? "Historical sample" : "Public market data"}</span><button onClick={() => focusSymbol(ticker)}>Focus market <Icon name="arrow" size={13} /></button></div>
    </section>;
  };

  if(!accountReady)return <div className="penguin-loading" role="status">◈ Connecting your workspace…</div>;
  return <div className="ot-root penguin-hud penguin-compact penguin-minimal penguin-professional">
    <aside className="ot-sidebar" tabIndex={0} aria-label="Workspace sidebar">
      <Link href="/terminal" className="ot-brand"><div className="ot-brand-mark">◈</div><div>PENGUIN<small>INTELLIGENT TRADING</small></div></Link>
      <div className="ot-workspace"><span className="ot-workspace-avatar">P</span><div>Personal workspace<small>Research & execution</small></div><Icon name="down" size={14} /></div>
      <p className="ot-nav-label">WORKSPACE</p>
      <nav aria-label="Terminal navigation">{NAV.filter(n=>["terminal","markets","team","vault"].includes(n.view)).map(n => <button key={n.view} aria-label={n.label} title={n.label} className={view === n.view ? "active" : ""} onClick={() => setView(n.view)}><Icon name={n.icon} /><span>{n.label}</span>{n.view === "research" && <span className="ot-nav-tag">LAB</span>}</button>)}</nav><details className="penguin-nav-tools"><summary>Advanced</summary>{NAV.filter(n=>["research","explorer","demo"].includes(n.view)).map(n=><button key={n.view} onClick={()=>setView(n.view)}>{n.label}</button>)}</details>
      <div className="ot-sidebar-bottom"><Link href="/settings" className="penguin-sidebar-link"><Icon name="settings"/>Settings</Link><Link className="ot-account" href="/account"><span className="ot-avatar">P</span><div>Account<small>Profile & security</small></div><Icon name="arrow"/></Link></div>
    </aside>
    <div className="ot-body">
      <header className="ot-topbar"><Link href="/terminal" className="penguin-mobile-brand">◈ Penguin</Link><div className="ot-breadcrumb">Workspace <span>/</span> <strong>{NAV.find(n => n.view === view)?.label}</strong></div><div className="ot-topbar-actions"><span className="ot-paper-badge"><i className="ot-dot gold" /> {accountMode==='demo'?'BINANCE DEMO · VIRTUAL FUNDS':'BINANCE REAL · READ-ONLY'}</span><button className="ot-secondary penguin-help-launch" onClick={()=>setHelpOpen(true)}>Ask Penguin <span>↗</span></button><Link href="/account" className="ot-avatar" aria-label="Your account">P</Link></div></header>
      <main className="ot-main">
        {view!=="terminal"&&<div className="ot-page-heading"><div><p className="ot-eyebrow"><span /> YOUR TRADING, IN FOCUS</p><h1>{view === "markets" ? "Market workspace" : view === "research" ? "Strategy lab" : view === "vault" ? "Knowledge" : view === "demo" ? "Advanced demo orders" : view === "team" ? "Research" : view === "explorer" ? "Strategy explorer" : "Settings"}<span>.</span></h1><p>{view === "markets" ? "Multiple perspectives. One workspace. Choose your market and go deeper." : view === "research" ? "Turn a hypothesis into evidence. Keep what survives the holdout." : view === "vault" ? "Evidence, specialist reviews, and a record of what changed." : view === "demo" ? "Exchange orders and automation on Binance USD-M demo, with a separate account ledger." : view === "team" ? "Three specialists. Reviewed evidence. A shared Obsidian memory." : "Manage your exchange and AI connections."}</p></div></div>}

        {view === "terminal" && <TradingOverview account={account} accountMode={accountMode} onAccountMode={setAccountMode} onSymbol={ticker=>ticker.endsWith("USDT")?focusSymbol(ticker.slice(0,-4),true):notify("Only USDT account instruments can be focused on this chart.")} symbol={symbol} timeframe={timeframe} chart={<><div className="ot-section-heading"><div><div className="penguin-market-picker"><select aria-label="Chart symbol" value={symbol} onChange={e=>switchContext(()=>setSymbol(e.target.value))}>{[...new Set([symbol,...watchlist])].map(s=><option key={s}>{s}</option>)}</select><select aria-label="Chart timeframe" value={timeframe} onChange={e=>switchContext(()=>setTimeframe(e.target.value))}>{["5m","15m","1h","4h"].map(t=><option key={t}>{t}</option>)}</select></div><span>{source==="demo"?"Sample chart":"Exchange candles"}</span></div><details className="penguin-chart-options"><summary>Chart options</summary><div className="ot-controls"><label className="ot-select"><span className="sr-only">Exchange</span><select aria-label="Exchange" value={exchange} onChange={e => switchContext(() => { setExchange(e.target.value); if (e.target.value === "kraken") setMarket("spot"); })}><option value="binance">Binance</option><option value="bybit">Bybit</option><option value="kraken">Kraken</option></select></label><label className="ot-select"><span className="sr-only">Market type</span><select aria-label="Market type" value={market} onChange={e => switchContext(() => setMarket(e.target.value))}><option value="spot">Spot</option>{exchange !== "kraken" && <option value="perpetual">Perpetual</option>}</select></label><label className="ot-select"><span className="sr-only">Data source</span><select aria-label="Data source" value={source} onChange={e => switchContext(() => setSource(e.target.value as "demo" | "exchange"))}><option value="demo">Sample data</option><option value="exchange">Exchange data</option></select></label><button className="ot-icon-button" aria-label="Edit watchlist" onClick={() => setModal(true)}><Icon name="plus" /></button></div></details></div>{chartPanel(symbol,false)}</>} onTeam={()=>setView("team")} onExecution={()=>setView("demo")} onHelp={()=>setHelpOpen(true)} liveStatus={{mode:source==='demo'?'sample':liveReady?(live.data?.mode==='websocket'?'websocket':'snapshot'):live.error?'unavailable':'connecting',price:liveReady?live.data?.price:undefined,at:live.data?.receivedAt||0,error:live.error}}/> }
        {view === "markets" && <>
          <div className="ot-section-heading"><div><h2>Market overview</h2><span>{watchlist.length} markets · closed-bar POC context</span></div><div className="ot-controls"><label className="ot-select"><span className="sr-only">Exchange</span><select aria-label="Exchange" value={exchange} onChange={e => switchContext(() => { setExchange(e.target.value); if (e.target.value === "kraken") setMarket("spot"); })}><option value="binance">Binance</option><option value="bybit">Bybit</option><option value="kraken">Kraken</option></select></label><label className="ot-select"><span className="sr-only">Market type</span><select aria-label="Market type" value={market} onChange={e => switchContext(() => setMarket(e.target.value))}><option value="spot">Spot</option>{exchange !== "kraken" && <option value="perpetual">Perpetual</option>}</select></label><label className="ot-select"><span className="sr-only">Data source</span><select aria-label="Data source" value={source} onChange={e => switchContext(() => setSource(e.target.value as "demo" | "exchange"))}><option value="demo">Sample data</option><option value="exchange">Exchange data</option></select></label><button className="ot-icon-button" aria-label="Edit watchlist" onClick={() => setModal(true)}><Icon name="plus" /></button></div></div>
          <div className="ot-market-tabs">{watchlist.map(t => <button key={t} className={symbol === t ? "active" : ""} onClick={() => focusSymbol(t)}>{t}<small>{exchange === "kraken" ? "USD" : "USDT"}</small>{symbol === t && <i className="ot-dot gold" />}</button>)}<div className="ot-timeframes">{["5m", "15m", "1h", "4h"].map(t => <button key={t} className={timeframe === t ? "active" : ""} onClick={() => switchContext(() => setTimeframe(t))}>{t}</button>)}</div></div>
          {feedError && <div className="ot-feed-error" role="alert">{feedError}. Sample mode remains available.</div>}
          <div className="ot-chart-grid">{watchlist.map(t => chartPanel(t, true))}</div>
        </>}
        {view === "research" && <div className="ot-research-layout"><section className="ot-panel ot-research-main"><div className="ot-panel-title"><h3>Directional Fibonacci <span className="ot-pill gold">CANONICAL MODEL</span></h3><span className="ot-muted">{symbol} · {exchange} · {source}</span></div><div className="ot-research-intro"><span className="ot-feature-icon"><Icon name="brain" size={26} /></span><div><h2>Let evidence lead the next iteration.</h2><p>Reuses the bundled directional anchor model and checked 0.618 level. This new long-only paper harness compares three bounded tolerances; it does not replace the production strategy adapter.</p></div></div><div className="ot-research-steps">{["01 / Closed candles", "02 / Train on 70%", "03 / Validate on 30%", "04 / Review candidate"].map(s => <span key={s}>{s}</span>)}</div><div className="ot-research-actions"><button className="ot-primary" disabled={researchBusy || !feed} onClick={runResearch}><Icon name="play" size={14} />{researchBusy ? "Evaluating hypotheses…" : "Run bounded research"}</button><span className="ot-muted">{feed?.candles.length || 0} candles · active tolerance {tolerance}%</span></div>{matchingResearch ? <><div className="ot-result-banner"><Icon name="shield" /><div><strong>{matchingResearch.candidate ? "Paper candidate available" : "Keep the baseline"}</strong><p>{matchingResearch.candidate ? "Training selected a candidate and the holdout passed the paper review gates." : "No alternative has passed all trade-count, net-return, and drawdown gates. More evidence is needed."}</p></div></div><div className="ot-table-wrap"><table><thead><tr><th>Tolerance</th><th>Train trades</th><th>Train net R</th><th>Holdout trades</th><th>Holdout net R</th><th>Drawdown R</th></tr></thead><tbody>{matchingResearch.studies.map(s => <tr key={s.tolerance}><td>{s.tolerance}% {s.tolerance === .08 && <span className="ot-pill">BASE</span>}</td><td>{s.train.trades}</td><td>{s.train.net_r}</td><td>{s.validation.trades}</td><td className={s.validation.net_r >= 0 ? "ot-positive" : "ot-negative"}>{s.validation.net_r}</td><td>{s.validation.drawdown_r}</td></tr>)}</tbody></table></div><p className="ot-methodology">{matchingResearch.methodology}</p><div className="ot-research-actions"><button className="ot-secondary" onClick={exportNote}><Icon name="download" size={14} />Export to Obsidian</button><button className="ot-secondary" onClick={analyzeResearch} disabled={aiBusy}><Icon name="brain" size={14} />{aiBusy ? "Analyzing evidence…" : "Ask research council"}</button></div>{aiNote && aiKey === feedKey && <div className="ot-ai-note"><span className="ot-eyebrow">AI RESEARCH NOTE · ADVISORY ONLY</span><p>{aiNote}</p></div>}</> : <div className="ot-empty"><Icon name="brain" size={28} /><strong>Your next hypothesis is waiting.</strong><p>Run research to see trade counts, costs, returns, and holdout results.</p></div>}</section><aside className="ot-panel ot-research-aside"><span className="ot-eyebrow">DEMO EXECUTION</span><h2>Research, then execute.</h2><p>Paper automation is retired. The demo cockpit manages exchange demo orders and their protection. Research comparisons remain advisory.</p><button className="ot-primary" onClick={()=>setView("terminal")}>Open demo cockpit</button><button className="ot-secondary" onClick={()=>setView("vault")}>Open Obsidian memory</button></aside></div>}
        {view === "research" && bots.length > 0 && <section className="ot-panel ot-journal"><div className="ot-panel-title"><h3>Configured markets <span>{bots.length}</span></h3><span className="ot-muted">PERSISTENT SERVER STATE</span></div><div className="ot-table-wrap"><table><thead><tr><th>Market</th><th>Exchange</th><th>Engine / learning</th><th>Last cycle</th><th>Controls</th></tr></thead><tbody>{bots.map(bot => <tr key={bot.key}><td>{bot.symbol} · {bot.market} · {bot.timeframe}</td><td>{bot.exchange} / {bot.source}</td><td>{bot.enabled ? "Watching" : "Paused"} / {bot.learning ? "Learning" : "Off"}</td><td>{bot.error || (bot.updatedAt ? new Date(bot.updatedAt).toLocaleTimeString() : "Waiting")}</td><td><button className="ot-close-position" onClick={() => switchContext(() => { setExchange(bot.exchange); setMarket(bot.market); setSymbol(bot.symbol); setTimeframe(bot.timeframe); setSource(bot.source); })}>Inspect</button> <button className="ot-close-position" onClick={() => void workspaceAction({ action: "pause-bot", context: bot }).catch(error => notify(error.message))}>Pause bot</button> <button className="ot-close-position" onClick={() => void workspaceAction({ action: "remove-bot", context: bot }).catch(error => notify(error.message))}>Remove bot</button></td></tr>)}</tbody></table></div></section>}
        {view === "vault" && <><VaultBrowser /><div className="ot-vault-hero ot-panel"><div><p className="ot-eyebrow">KNOWLEDGE THAT COMPOUNDS</p><h2>Every decision.<br />Part of a bigger picture.</h2><p>Keep your research close to your reasoning. Export linked Markdown notes that fit directly into an Obsidian vault, and give Codex a reproducible research brief.</p><button className="ot-primary" onClick={exportNote}><Icon name="download" size={16} />Export current research note</button></div><div className="ot-vault-graph"><svg viewBox="0 0 400 280" aria-hidden="true"><g stroke="#d3ad6538"><path d="M200 140L70 60 100 230 330 210 200 140 320 50 70 60 M100 230L200 140 330 210 320 50 M200 140L45 140 M200 140L230 260" /></g>{[[200,140,25],[70,60,12],[100,230,15],[330,210,13],[320,50,17],[45,140,7],[230,260,8]].map(([x,y,r],i) => <circle key={i} cx={x} cy={y} r={r} fill={i===0 ? "#d3ad65" : "#252b2d"} stroke="#d3ad65" />)}<g fill="#8e979b" fontSize="11"><text x="178" y="185">Strategy</text><text x="45" y="35">Research</text><text x="280" y="24">Codex</text><text x="285" y="244">Trade journal</text></g></svg></div></div><div className="ot-vault-cards">{[{ icon: "vault", title: "01. Build your vault", text: "Open the Obsidian vault starter in the repository’s obsidian-vault directory. It includes a strategy index, research protocol, and paper journal." }, { icon: "download", title: "02. Capture the evidence", text: "Research cycles save linked Markdown notes into the standalone vault. You can also download a note; its source labels, costs, trade counts, and validation results travel with it." }, { icon: "brain", title: "03. Work with Codex", text: "Ask Codex to read the protocol and report, propose one bounded change, and validate it before applying it to the strategy." }].map(c => <section className="ot-panel" key={c.title}><Icon name={c.icon} size={24} /><h3>{c.title}</h3><p>{c.text}</p></section>)}</div><section className="ot-panel ot-journal"><div className="ot-panel-title"><h3>Historical paper archive</h3><button className="ot-text-button" onClick={exportNote}>Export Markdown <Icon name="download" size={14} /></button></div>{portfolio.fills.length ? <div className="ot-table-wrap"><table><thead><tr><th>Market</th><th>Exchange / source</th><th>Net P&L</th><th>Exit reason</th><th>Closed</th></tr></thead><tbody>{portfolio.fills.map(f => <tr key={f.id}><td>{f.symbol} {f.side}</td><td>{f.exchange} / {f.source}</td><td className={f.pnl >= 0 ? "ot-positive" : "ot-negative"}>{usd(f.pnl)}</td><td>{f.reason}</td><td>{new Date(f.time).toLocaleTimeString()}</td></tr>)}</tbody></table></div> : <div className="ot-empty"><strong>No historical paper closures.</strong><p>New testing uses the Binance demo cockpit.</p></div>}</section></>}
        {view === "integrations" && <><IntegrationSettings onNotice={notify} onDiscordConfigured={setDiscord}/><AlertsSettings/></>}
        {view === "demo" && <DemoDesk baseSymbol={symbol} timeframe={timeframe} />}
        {view === "explorer" && <StrategyExplorer feed={feed} />}
        {view === "team" && <AgentTeamPanel contextKey={feedKey} />}
        {workerStatus.error && <div className="ot-feed-error">Server worker: {workerStatus.error}</div>}<footer className="ot-footer"><span><i className="ot-dot" /> {busy ? "Refreshing market data" : "Workspace online"}</span><span>PENGUIN / RESEARCH BEFORE EXECUTION</span><span>{workerStatus.at ? "WORKER CYCLE RECORDED" : "SERVER WORKER STARTING"} <span className="ot-footer-line">|</span> {source === "demo" ? "SAMPLE DATA" : "EXCHANGE CANDLES"}</span></footer>
      </main>
    </div>
    <nav className="penguin-mobile-dock" aria-label="Mobile workspace navigation">{NAV.filter(n => ["terminal", "markets", "team", "vault"].includes(n.view)).map(n => <button key={n.view} aria-label={n.label} className={view === n.view ? "active" : ""} onClick={() => setView(n.view)}><Icon name={n.icon} /><span>{n.view === "terminal" ? "Home" : n.view === "markets" ? "Markets" : n.view === "vault" ? "Knowledge" : "Research"}</span></button>)}<button aria-label="More workspace views" aria-expanded={mobileMenu} onClick={() => setMobileMenu(true)}><Icon name="grid" /><span>More</span></button></nav>
    {mobileMenu && <div ref={menuRef} className="penguin-mobile-menu" role="dialog" aria-modal="true" aria-label="All workspace views"><div className="ot-panel-title"><h2>Your workspace</h2><button autoFocus aria-label="Close workspace menu" onClick={() => setMobileMenu(false)}>×</button></div>{NAV.map(n => <button key={n.view} onClick={() => { setView(n.view); setMobileMenu(false); }}><Icon name={n.icon} /><span>{n.label}</span><Icon name="arrow" /></button>)}<Link href="/account" className="penguin-mobile-account">Account · profile & security <Icon name="arrow"/></Link></div>}
    {helpOpen&&<AppHelper onClose={closeHelp}/> }
    {notice && <div className="ot-toast" role="status" aria-live="polite"><Icon name="check" size={15} /><span>{notice}</span></div>}
    {modal && <div className="ot-modal-backdrop" onClick={() => setModal(false)}><section ref={modalRef} className="ot-modal" role="dialog" aria-modal="true" aria-label="Edit market watchlist" onClick={e => e.stopPropagation()}><div className="ot-panel-title"><h2>Your watchlist</h2><button autoFocus className="ot-icon-button" onClick={() => setModal(false)} aria-label="Close watchlist editor"><Icon name="close" /></button></div><p>Add up to eight base symbols. Quote currency follows the selected exchange: USDT for Binance/Bybit, USD for Kraken. Availability is checked by the exchange.</p><div className="ot-watchlist-edit">{watchlist.map(s => <div key={s}><span>{s}</span><button aria-label={`Remove ${s}`} disabled={watchlist.length === 1} onClick={() => { const next = watchlist.filter(t => t !== s); void saveWatchlist(next); }}><Icon name="close" size={14} /></button></div>)}</div><form onSubmit={e => { e.preventDefault(); const s = newSymbol.trim().toUpperCase().replace(/\/(USDT|USD)$/, ""); if (!/^[A-Z0-9]{2,12}$/.test(s)) return notify("Enter a base symbol such as BTC, DOGE, or AVAX."); if (watchlist.length >= 8) return notify("Maximum eight markets per workspace."); if (watchlist.includes(s)) return notify("That market is already in your watchlist."); void saveWatchlist([...watchlist, s]); setNewSymbol(""); }}><label htmlFor="new-symbol">Base market symbol</label><div><input id="new-symbol" placeholder="e.g. AVAX" value={newSymbol} onChange={e => setNewSymbol(e.target.value)} /><button className="ot-primary" type="submit"><Icon name="plus" size={15} />Add market</button></div></form><button className="ot-secondary" onClick={() => setModal(false)}>Done <Icon name="check" size={14} /></button></section></div>}
  </div>;
}
