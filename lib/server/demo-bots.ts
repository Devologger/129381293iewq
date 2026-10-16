import {currentAccount} from './account-context.ts';
import {requireTradingPlan} from './billing.ts';
import {demoProtections,protectionReady,hasOutstandingProtection} from './demo-protection.ts';
import {notify as notifyDiscord} from './alerts.ts';
import { db } from "./store.ts";
import { demoAccount, demoClosedCandles, previewDemo, reconcileDemo, submitDemo, maintainDemoProtection } from "./demo-execution.ts";
import { runResearch } from "./research.ts";
import type { Research } from "../terminal-engine.ts";
import { saveStrategyEvidence } from "./strategy-memory.ts";
type DemoBot = { symbol: string; timeframe: string; enabled: boolean; notional: number; lastBar: number; lastOrder: string | null; research: Research | null; updatedAt: string | null; error: string | null; tolerance: number };
export function demoBots(workspaceId: string): DemoBot[] { return (db().prepare("SELECT state FROM demo_bots WHERE workspace_id=?").all(workspaceId) as { state: string }[]).map(r => JSON.parse(r.state)); }
function save(workspaceId: string, bot: DemoBot) { db().prepare("INSERT INTO demo_bots VALUES (?,?,?) ON CONFLICT(symbol) DO UPDATE SET state=excluded.state WHERE demo_bots.workspace_id=excluded.workspace_id").run(bot.symbol, workspaceId, JSON.stringify(bot)); return bot; }
export async function configureDemoBot(workspaceId: string, value: { symbol: string; timeframe: string; enabled: boolean; notional: number }, fetcher: typeof fetch = fetch) {
  if (!/^[A-Z0-9]{2,12}USDT$/.test(value.symbol) || !["5m", "15m", "1h", "4h"].includes(value.timeframe) || typeof value.enabled !== "boolean" || !Number.isFinite(value.notional) || value.notional < 5 || value.notional > 500) throw new Error("Use a USDT demo contract, supported timeframe, and 5–500 USDT bot size");
  const row = db().prepare("SELECT workspace_id,state FROM demo_bots WHERE symbol=?").get(value.symbol) as { workspace_id: string; state: string } | undefined;
  if (row && row.workspace_id !== workspaceId) throw new Error("This demo contract is managed by another workspace; each contract has one bot owner");
  const previous = row ? JSON.parse(row.state) as DemoBot : undefined;
  if (value.enabled) {
    await requireTradingPlan(currentAccount()?.id||'');
    const account = await demoAccount(workspaceId, fetcher);
    if (!previous && account.positions.some(p => p.symbol === value.symbol)) throw new Error("Close the existing demo position before assigning a new bot to this contract");
    if (value.notional > account.limits.maxOrderUsdt) throw new Error("Bot size exceeds the configured demo order cap");
    if (!previous && (db().prepare("SELECT COUNT(*) AS n FROM demo_bots").get() as { n: number }).n >= 8) throw new Error("Maximum eight demo bot contracts");
  }
  if(value.enabled){
    const row=db().prepare("SELECT state FROM team_settings WHERE workspace_id=?").get(workspaceId) as {state:string}|undefined;
    const previous=row?JSON.parse(row.state):{};
    const setting={...previous,enabled:true,intervalMinutes:previous.intervalMinutes||480,contextKey:`binance-demo:perpetual:${value.symbol}:${value.timeframe}`,nextAt:Date.now(),allowEscalation:false,state:"scheduled",message:"Waiting for the demo worker's first research report"};
    db().prepare("INSERT INTO team_settings VALUES (?,?) ON CONFLICT(workspace_id) DO UPDATE SET state=excluded.state").run(workspaceId,JSON.stringify(setting));
  }
  return save(workspaceId, { symbol: value.symbol, timeframe: value.timeframe, enabled: value.enabled, notional: value.notional, lastBar: value.enabled ? 0 : previous?.lastBar || 0, lastOrder: previous?.lastOrder || null, research: value.enabled ? null : previous?.research || null, tolerance: previous?.tolerance || .08, updatedAt: previous?.updatedAt || null, error: null });
}
// Dependency injection supports order/closed-bar integration tests without external keys.
export async function tickDemoBot(workspaceId: string, bot: DemoBot, fetcher: typeof fetch = fetch, researcher = runResearch) {
  const initial = demoBots(workspaceId).find(b => b.symbol === bot.symbol); if (!initial) return;
  let current: DemoBot = initial;
  let alertContent: string | null = null; let alertFailure=false;
  const now = Date.now();
  const lease = db().prepare("INSERT INTO demo_bot_locks VALUES (?,?) ON CONFLICT(symbol) DO UPDATE SET expires=excluded.expires WHERE demo_bot_locks.expires < ?").run(bot.symbol, now + 300000, now);
  if (!lease.changes) return;
  try {
    const account = await demoAccount(workspaceId, fetcher);
    await maintainDemoProtection(workspaceId, account.positions, fetcher);
    if (current.lastOrder) {
      const latest = await reconcileDemo(workspaceId, current.lastOrder, fetcher);
      const protection=demoProtections(workspaceId).find(p=>p.orderId===latest.id);
      if(protection&&hasOutstandingProtection(current.symbol,workspaceId)&&protection.legs.some(l=>["DRAFT","UNKNOWN","SUBMITTING","REJECTED"].includes(l.status)))throw new Error("Demo protection unconfirmed. Entries halted; inspect the exchange SL/TP journal.");
      if (["UNKNOWN", "SUBMITTING", "NEW", "PARTIALLY_FILLED"].includes(latest.status)) throw new Error("Bot awaiting reconciliation/fill of its previous demo order");
    }
    const position = account.positions.find(p => p.symbol === current.symbol);
    if (position) {
      if(Number(position.unRealizedProfit)<0) alertContent=`Penguin Binance demo risk alert: ${current.symbol} has unrealized P&L of $${Number(position.unRealizedProfit).toFixed(2)} at the sampled exchange mark. This is demo, not real money.`;
      const protection=demoProtections(workspaceId).find(p=>p.orderId===current.lastOrder);
      if(protection&&!protection.legs.some(l=>l.kind==="SL"&&["NEW","ACCEPTED"].includes(l.status)))throw new Error("Demo stop not verified active. Entries halted; inspect or close this position in Binance demo.");
      const entry = Number(position.entryPrice), mark = Number(position.markPrice), amount = Number(position.positionAmt);
      if (!Number.isFinite(entry) || entry <= 0) throw new Error("Invalid exchange entry price");
      const pnl = (mark / entry - 1) * (amount > 0 ? 1 : -1);
      // Protection remains active while entries are paused; this is sampled, server-side monitoring.
      if (!protection && (pnl <= -.02 || pnl >= .04)) {
        const draft = await previewDemo(workspaceId, { symbol: current.symbol, side: amount > 0 ? "SELL" : "BUY", type: "MARKET", notional: 0, reduceOnly: true }, fetcher);
        const order = await submitDemo(workspaceId, draft.id, fetcher); current = { ...current, lastOrder: order.id };
      }
    }
    if (current.enabled) {
      const candles = await demoClosedCandles(current.symbol, current.timeframe, fetcher), bar = candles.at(-1)!;
      if (bar.time > current.lastBar) {
        const report = await researcher(candles, current.tolerance, false), level = report.snapshot.display_levels.at(-1)?.price;
        if (report.strategy_lab) saveStrategyEvidence(workspaceId, `binance-demo:perpetual:${current.symbol}:${current.timeframe}`, report.strategy_lab, "binance-demo");
        const latest = demoBots(workspaceId).find(b => b.symbol === current!.symbol);
        if (latest?.enabled && latest.timeframe === current.timeframe && latest.notional === current.notional && current.lastBar > 0 && !position && level && candles.at(-2)!.close < level && bar.close >= level) {
          // Claim this bar before exchange I/O. Crash recovery cannot repeat the signal.
          const claim = db().prepare("UPDATE demo_bots SET state=? WHERE symbol=? AND workspace_id=? AND json_extract(state,'$.lastBar')=? AND json_extract(state,'$.enabled')=1").run(JSON.stringify({ ...current, lastBar: bar.time, research: report }), current.symbol, workspaceId, current.lastBar);
          if (!claim.changes) return;
          const draft = await previewDemo(workspaceId, { symbol: current.symbol, side: "BUY", type: "MARKET", notional: current.notional }, fetcher);
          current={...current,lastBar:bar.time,research:report,lastOrder:draft.id};save(workspaceId,current);
          const order = await submitDemo(workspaceId, draft.id, fetcher); current = { ...current, lastOrder: order.id };
          if(order.status!=="FILLED"||!protectionReady(demoProtections(workspaceId).find(p=>p.orderId===order.id))){
            if(order.status==="FILLED"){
              const after=await demoAccount(workspaceId,fetcher),exposed=after.positions.find(p=>p.symbol===current.symbol);
              await maintainDemoProtection(workspaceId,after.positions,fetcher);
              if(exposed){const closeDraft=await previewDemo(workspaceId,{symbol:current.symbol,side:Number(exposed.positionAmt)>0?"SELL":"BUY",type:"MARKET",notional:0,reduceOnly:true},fetcher);current={...current,lastOrder:closeDraft.id,enabled:false};save(workspaceId,current);const close=await submitDemo(workspaceId,closeDraft.id,fetcher);current={...current,lastOrder:close.id};}
            }
            save(workspaceId,{...current,enabled:false,lastBar:bar.time,research:report,error:"Demo entry/protection unconfirmed. Entries paused; inspect the order and SL/TP.",updatedAt:new Date().toISOString()});throw new Error("Demo entry/protection unconfirmed. Entries paused; reconcile exchange state.");}
        }
        current = { ...current, lastBar: bar.time, research: report, tolerance: report.active_tolerance };
      }
    }
    const latest = demoBots(workspaceId).find(b => b.symbol === current!.symbol);
    // Preserve a concurrent owner's pause/configuration.
    if (latest) save(workspaceId, { ...current, enabled: latest.enabled, timeframe: latest.timeframe, notional: latest.notional, error: null, updatedAt: new Date().toISOString() });
  } catch (error) {
    alertFailure=true; alertContent="Penguin Binance demo execution monitor stopped on an error. Check reconciliation and the dashboard; do not assume position protection is active.";
    const latest = demoBots(workspaceId).find(b => b.symbol === current!.symbol);
    if (latest) save(workspaceId, { ...latest, enabled:false, error: error instanceof Error ? error.message : "Demo bot failed", updatedAt: new Date().toISOString() });
  } finally { db().prepare("DELETE FROM demo_bot_locks WHERE symbol=?").run(bot.symbol); }
  if(alertContent) await notifyDiscord(workspaceId,(alertFailure?"demo-failure:":"demo-loss:")+bot.symbol+":"+Math.floor(Date.now()/3600000),alertContent);
}
export async function runDemoCycle() {
  const rows = db().prepare("SELECT workspace_id, state FROM demo_bots").all() as { workspace_id: string; state: string }[];
  for (const row of rows) await tickDemoBot(row.workspace_id, JSON.parse(row.state));
}
