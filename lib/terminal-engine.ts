export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Feed = { candles: Candle[]; source: "demo" | "exchange"; exchange: string; market: string; symbol: string; timeframe: string; fetchedAt: number };
export type Position = { id: string; exchange: string; market: string; source: string; symbol: string; timeframe: string; side: "long" | "short"; quantity: number; entry: number; stop: number; target: number; collateral: number; openedAt: string };
export type Fill = { id: string; symbol: string; exchange: string; source: string; side: string; pnl: number; time: string; reason: string };
export type Portfolio = { cash: number; positions: Position[]; fills: Fill[]; paused: boolean };
export const INITIAL_PORTFOLIO: Portfolio = { cash: 10000, positions: [], fills: [], paused: true };
export const FEE = .0012;

export function demoCandles(symbol: string, timeframe: string): Candle[] {
  const base = ({ BTC: 67480, ETH: 3520, SOL: 148, XRP: .62 } as Record<string, number>)[symbol] || 100;
  const minutes = ({ "5m": 5, "15m": 15, "1h": 60, "4h": 240 } as Record<string, number>)[timeframe] || 15;
  const start = 1760000400;
  let price = base * .975;
  return Array.from({ length: 400 }, (_, i) => {
    const open = price;
    price = base * (.975 + i * .000065 + Math.sin(i * .15) * .011 + Math.sin(i * 1.73) * .0028 + Math.sin(i * .037) * .01);
    return { time: start + i * minutes * 60, open, high: Math.max(open, price) + base * (.0008 + Math.abs(Math.sin(i * 2.1)) * .001), low: Math.min(open, price) - base * (.0008 + Math.abs(Math.cos(i * 1.7)) * .001), close: price, volume: 20 + Math.abs(Math.sin(i)) * 100 };
  });
}

export function openPaper(portfolio: Portfolio, feed: Feed, side: "long" | "short", notional: number): Portfolio {
  if (portfolio.paused) throw new Error("Enable the paper engine before placing orders.");
  if (!Number.isFinite(notional) || notional < 10 || notional > portfolio.cash / (1 + FEE)) throw new Error("Order exceeds available paper buying power.");
  if (portfolio.positions.length >= 6) throw new Error("Paper risk limit: maximum six open positions.");
  if (feed.market === "spot" && side === "short") throw new Error("Shorts are available in the perpetual paper market.");
  if (Date.now() - feed.fetchedAt > 60000) throw new Error("Refresh the market feed before trading.");
  const price = feed.candles.at(-1)?.close;
  if (!price || !Number.isFinite(price) || price <= 0) throw new Error("A valid market price is required.");
  const sign = side === "long" ? 1 : -1;
  const position: Position = { id: crypto.randomUUID(), exchange: feed.exchange, market: feed.market, source: feed.source, symbol: feed.symbol, timeframe: feed.timeframe, side, quantity: notional / price, entry: price, stop: price * (1 - sign * .02), target: price * (1 + sign * .04), collateral: notional, openedAt: new Date().toISOString() };
  return { ...portfolio, cash: portfolio.cash - notional * (1 + FEE), positions: [...portfolio.positions, position] };
}

export function matchesFeed(position: Position, feed: Feed) {
  return position.symbol === feed.symbol && position.exchange === feed.exchange && position.market === feed.market && position.source === feed.source;
}

export function closePaper(portfolio: Portfolio, id: string, feed: Feed, reason = "Manual close"): Portfolio {
  const position = portfolio.positions.find(p => p.id === id);
  if (!position || !matchesFeed(position, feed) || Date.now() - feed.fetchedAt > 60000) throw new Error("Load a fresh matching exchange, market and data source before closing this position.");
  const price = feed.candles.at(-1)!.close;
  const gross = (price - position.entry) * position.quantity * (position.side === "long" ? 1 : -1);
  const exitFee = price * position.quantity * FEE;
  const pnl = gross - exitFee - position.collateral * FEE;
  return { ...portfolio, cash: portfolio.cash + position.collateral + gross - exitFee,
    positions: portfolio.positions.filter(p => p.id !== id),
    fills: [{ id: crypto.randomUUID(), symbol: position.symbol, exchange: position.exchange, source: position.source, side: position.side, pnl, time: new Date().toISOString(), reason }, ...portfolio.fills].slice(0, 200) };
}

export function validatePortfolio(value: unknown): value is Portfolio {
  if (!value || typeof value !== "object") return false;
  const p = value as Portfolio;
  return Number.isFinite(p.cash) && typeof p.paused === "boolean" && Array.isArray(p.positions) && p.positions.length <= 6 && p.positions.every(x => typeof x.id === "string" && typeof x.symbol === "string" && ["long", "short"].includes(x.side) && [x.entry, x.quantity, x.collateral, x.stop, x.target].every(n => Number.isFinite(n) && n > 0)) && Array.isArray(p.fills) && p.fills.every(x => Number.isFinite(x.pnl) && typeof x.symbol === "string");
}

export type Study = { tolerance: number; train: { trades: number; net_r: number; drawdown_r: number; win_rate: number }; validation: { trades: number; net_r: number; drawdown_r: number; win_rate: number } };
export type Research = { studies: Study[]; as_of: number; candidate: number | null; active_tolerance: number; decision: string; model: string; methodology: string; snapshot: { reason: string; display_levels: { price: number; label: string; confirmed: boolean }[] } };

export function vaultReport(feed: Feed, research: Research | null, portfolio: Portfolio) {
  return `---\ntags: [obsidian-trader, strategy, paper]\nexchange: ${feed.exchange}\nmarket: ${feed.market}\nsymbol: ${feed.symbol}\ndata_source: ${feed.source}\ncreated: ${new Date().toISOString()}\n---\n\n# ${feed.symbol} · Fibonacci research\n\n[[Strategy Index]] · [[Paper Trade Journal]] · [[Codex Research Protocol]]\n\n## Market\n${feed.exchange} / ${feed.market} / ${feed.timeframe}. Source: **${feed.source}**. ${feed.candles.length} closed candles.\n\n## Research\n${research ? `${research.model}\nResearch candle as of: ${new Date(research.as_of * 1000).toISOString()}\n\n${research.methodology}\n\nDecision: ${research.decision}\n\n| Tolerance | Training trades | Training R | Holdout trades | Holdout R | Holdout drawdown R |\n|---|---|---|---|---|---|\n${research.studies.map(s => `| ${s.tolerance} | ${s.train.trades} | ${s.train.net_r} | ${s.validation.trades} | ${s.validation.net_r} | ${s.validation.drawdown_r} |`).join("\n")}` : "No research run yet."}\n\n## Paper journal\n${portfolio.fills.map(f => `- ${f.time} ${f.exchange} ${f.symbol} ${f.side}: $${f.pnl.toFixed(2)} (${f.source}; ${f.reason})`).join("\n") || "No closed paper trades."}\n\n## Codex next task\nReview this report against [[Codex Research Protocol]]. Propose a bounded change with rationale and reproducible tests. Keep the canonical Fibonacci ratios and execution gates intact. Do not promote a strategy to live trading from this report.\n`;
}
