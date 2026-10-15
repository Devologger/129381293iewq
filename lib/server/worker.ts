import {runAllAccounts} from "./accounts.ts";
import {notify as notifyDiscord} from './alerts.ts';
import { demoCandles, openPaper, closePaper, matchesFeed, type Feed, type Research } from "../terminal-engine.ts";
import { marketResponse } from "./market.ts";
import { runResearch } from "./research.ts";
import { saveVaultNote } from "./vault.ts";
import { contextKey, readWorkspace, updateWorkspace, workspaceIds, type Context } from "./store.ts";
import { runScheduledTeams } from "./agent-team.ts";
import { runDemoCycle } from "./demo-bots.ts";

export function validateContext(value: unknown): asserts value is Context {
  const c = value as Context;
  if (!c || !["binance", "bybit", "kraken"].includes(c.exchange) || !["spot", "perpetual"].includes(c.market) || (c.exchange === "kraken" && c.market !== "spot") || !/^[A-Z0-9]{2,12}$/.test(c.symbol) || !["5m", "15m", "1h", "4h"].includes(c.timeframe) || !["demo", "exchange"].includes(c.source)) throw new Error("Unsupported market context");
}
export async function getFeed(context: Context): Promise<Feed> {
  validateContext(context);
  if (context.source === "demo") return { ...context, candles: demoCandles(context.symbol, context.timeframe), fetchedAt: Date.now() };
  const query = new URLSearchParams({ exchange: context.exchange, symbol: context.symbol, timeframe: context.timeframe, market: context.market });
  const response = await marketResponse(new Request(`http://internal/api/terminal/market?${query}`));
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Market feed unavailable");
  return { ...context, candles: body.candles, fetchedAt: Date.now() };
}
export async function tickWorkspace(id: string, feedProvider = getFeed, researcher = runResearch) {
  const initial = readWorkspace(id); const feeds = new Map<string, Feed>(); const errors: string[] = [];
  const load = async (context: Context) => { const key = contextKey(context); if (!feeds.has(key)) feeds.set(key, await feedProvider(context)); return feeds.get(key)!; };
  for (const p of initial.portfolio.positions) {
    try {
      const f = await load({ exchange: p.exchange, market: p.market, symbol: p.symbol, source: p.source as Context["source"], timeframe: p.timeframe || "15m" });
      const mark = f.candles.at(-1)!.close;
      if ((p.side === "long" && (mark <= p.stop || mark >= p.target)) || (p.side === "short" && (mark >= p.stop || mark <= p.target))) updateWorkspace(id, ws => ws.portfolio.positions.some(position => position.id === p.id) ? { ...ws, portfolio: closePaper(ws.portfolio, p.id, f, "Server paper bar-close protection") } : ws);
    } catch (error) { errors.push(error instanceof Error ? error.message : "Position feed failed"); }
  }
  for (const bot of initial.bots) {
    if ((initial.portfolio.paused || (!bot.enabled && !bot.learning)) && !bot.scanning) continue;
    try {
      const f = await load(bot); const bar = f.candles.at(-1)!;
      if (bot.lastBar >= bar.time && bot.research) continue;
      const report: Research = bot.scanning || bot.learning || !bot.research ? await researcher(f.candles, bot.tolerance, bot.learning && !initial.portfolio.paused) : bot.research;
      const updatedWorkspace = updateWorkspace(id, ws => {
        const current = ws.bots.find(b => b.key === bot.key);
        if (!current || ((ws.portfolio.paused || (!current.enabled && !current.learning)) && !current.scanning) || (current.lastBar >= bar.time && current.research)) return ws;
        const level = report.snapshot.display_levels.at(-1)?.price;
        let portfolio = ws.portfolio;
        if (!ws.portfolio.paused && current.enabled && current.lastBar > 0 && bar.time > current.lastBar && level && f.candles.at(-2)!.close < level && bar.close >= level && !portfolio.positions.some(p => matchesFeed(p, f)) && portfolio.cash >= 100) {
          try { portfolio = openPaper(portfolio, f, "long", Math.min(500, portfolio.cash * .1)); }
          catch (error) { errors.push(error instanceof Error ? error.message : "Paper risk limit vetoed entry"); }
        }
        return { ...ws, portfolio, bots: ws.bots.map(b => b.key === bot.key ? { ...b, lastBar: bar.time, research: report, tolerance: current.learning && !ws.portfolio.paused ? report.active_tolerance : current.tolerance, error: null, updatedAt: new Date().toISOString() } : b) };
      });
      if (updatedWorkspace.bots.find(b => b.key === bot.key)?.lastBar === bar.time) saveVaultNote(id, f, report, updatedWorkspace.portfolio);
    } catch (error) { const message = error instanceof Error ? error.message : "Paper bot failed"; errors.push(message); updateWorkspace(id, ws => ({ ...ws, bots: ws.bots.map(b => b.key === bot.key ? { ...b, error: message } : b) })); }
  }
  const finalState = readWorkspace(id);
  for (const fill of finalState.portfolio.fills.filter(f=>f.pnl<0&&!initial.portfolio.fills.some(old=>old.id===f.id))) await notifyDiscord(id,"loss:"+fill.id,`Penguin paper risk alert: a paper position closed at a loss of $${Math.abs(fill.pnl).toFixed(2)} after recorded costs. Review the trading desk.`);
  if(errors.length) await notifyDiscord(id,"worker:"+Math.floor(Date.now()/3600000),"Penguin execution monitor: a paper worker/feed failed. Check the dashboard. Existing protection depends on server/feed availability.");
  updateWorkspace(id, ws => ({ ...ws, lastWorkerAt: new Date().toISOString(), workerError: errors.length ? errors.join(" · ") : null }));
}
const worker = globalThis as unknown as { obsidianPaperTimer?: NodeJS.Timeout; obsidianPaperBusy?: boolean; obsidianScanRoundBusy?:boolean };
export async function runPaperCycle() { if (worker.obsidianPaperBusy) return; worker.obsidianPaperBusy = true; try { for (const id of workspaceIds()) await tickWorkspace(id); } finally { worker.obsidianPaperBusy = false; } }
export function startPaperWorker() {
  if (process.env.TERMINAL_WORKER_DISABLED === "1" || worker.obsidianPaperTimer) return;
  worker.obsidianPaperTimer = setInterval(() => { if(worker.obsidianScanRoundBusy)return;worker.obsidianScanRoundBusy=true;void runAllAccounts(runPaperCycle).catch(() => {}).finally(()=>{worker.obsidianScanRoundBusy=false;}); }, 30000); worker.obsidianPaperTimer.unref();
  const demoWorker = globalThis as unknown as { obsidianDemoTimer?: NodeJS.Timeout; obsidianDemoBusy?: boolean };
  if (!demoWorker.obsidianDemoTimer) {
    demoWorker.obsidianDemoTimer = setInterval(() => {
      if (demoWorker.obsidianDemoBusy) return; demoWorker.obsidianDemoBusy = true;
      void runAllAccounts(runDemoCycle).catch(() => {}).finally(() => { demoWorker.obsidianDemoBusy = false; });
    }, 30000); demoWorker.obsidianDemoTimer.unref();
  }
  const teamWorker = globalThis as unknown as { obsidianTeamTimer?: NodeJS.Timeout; obsidianTeamBusy?: boolean };
  if (!teamWorker.obsidianTeamTimer) {
    teamWorker.obsidianTeamTimer = setInterval(() => {
      if (teamWorker.obsidianTeamBusy) return;
      teamWorker.obsidianTeamBusy = true;
      void runAllAccounts(runScheduledTeams).catch(() => {}).finally(() => { teamWorker.obsidianTeamBusy = false; });
    }, 60000);
    teamWorker.obsidianTeamTimer.unref();
  }
}
