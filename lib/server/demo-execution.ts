import {currentAccount} from './account-context.ts';
import {requireTradingPlan} from './billing.ts';
import {demoProtections,hasUnresolvedProtection,hasOutstandingProtection,protectionPlan,protectDemo,reconcileProtections,type ProtectionPlan,protectionReady} from './demo-protection.ts';
import {vaultDirectory} from "./account-context.ts";
import { randomUUID } from "node:crypto";
import { createHmac } from "node:crypto";
import { credential, db } from "./store.ts";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// This constant is deliberately not configurable. No production order destination exists.
const BASE = "https://demo-fapi.binance.com";
const ORDER_STATUSES = ["NEW", "PARTIALLY_FILLED", "FILLED", "CANCELED", "REJECTED", "EXPIRED", "EXPIRED_IN_MATCH"];
type Params = Record<string, string>;
type Position = { symbol: string; positionAmt: string; markPrice: string; entryPrice: string; unRealizedProfit: string; positionSide: string };
type ExchangeOrder = { orderId: number; clientOrderId: string; symbol: string; status: string; executedQty: string; avgPrice: string; side: string; origQty: string; type: string };
export type DemoOrder = { id: string; workspaceId: string; symbol: string; side: "BUY" | "SELL"; type: "MARKET" | "LIMIT"; quantity: string; price?: string; reduceOnly: boolean; notional: number; requestedNotional: number; created: number; expires: number; status: string; exchange?: ExchangeOrder; message?: string; protection?:ProtectionPlan };
type Filter = { filterType: string; minQty?: string; maxQty?: string; stepSize?: string; tickSize?: string; minPrice?: string; maxPrice?: string; notional?: string };
type SymbolInfo = { symbol: string; status: string; contractType: string; quoteAsset: string; filters: Filter[] };
class DemoRejection extends Error { status: number; code: number; constructor(status: number, code: number) { super(`Binance demo request failed (HTTP ${status}, code ${code || "unknown"})`); this.status = status; this.code = code; } }

async function publicRequest(path: string, params: Params, fetcher: typeof fetch) {
  const response = await fetcher(`${BASE}${path}?${new URLSearchParams(params)}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Binance demo unavailable (HTTP ${response.status})`);
  return response.json();
}
async function signedRequest(path: string, method: string, params: Params, fetcher: typeof fetch) {
  const key = credential("BINANCE_DEMO_API_KEY"), secret = credential("BINANCE_DEMO_API_SECRET");
  if (!key || !secret) throw new Error("Add USD-M demo keys privately in Connections first");
  const clock = await publicRequest("/fapi/v1/time", {}, fetcher);
  if (!Number.isSafeInteger(clock.serverTime)) throw new Error("Invalid demo server clock");
  const query = new URLSearchParams({ ...params, timestamp: String(clock.serverTime), recvWindow: "5000" }).toString();
  const signature = createHmac("sha256", secret).update(query).digest("hex");
  const response = await fetcher(`${BASE}${path}?${query}&signature=${signature}`, { method, headers: { "X-MBX-APIKEY": key }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  if (!response.ok) {
    // A write-side failure can be ambiguous. The caller reconciles by client ID.
    const error = new DemoRejection(response.status, Number(body.code));
    throw error;
  }
  return body;
}
function save(order: DemoOrder) {
  db().prepare("INSERT INTO demo_orders VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state=excluded.state, updated=excluded.updated").run(order.id, order.workspaceId, JSON.stringify(order), Date.now());
  if (!["DRAFT", "SUBMITTING", "EXPIRED"].includes(order.status)) {
    try {
      if (!/^[a-f\d]{48}$/.test(order.workspaceId)) throw new Error("Invalid workspace ID");
      const directory = join(vaultDirectory(), "Research", order.workspaceId); mkdirSync(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, "Binance Demo Order Journal.md");
      const rows = demoJournal(order.workspaceId).filter(o => !["DRAFT", "EXPIRED"].includes(o.status));
      const note = `# Binance USD-M Demo Order Journal\n\n[[Strategy Index]] · [[Paper Trade Journal]] · [[Codex Research Protocol]]\n\nExchange demo funds, separate from the paper ledger. Status is the last reconciled acknowledgement, not a continuously streamed balance. Unknown outcomes require reconciliation.\n\n| Time (UTC) | Contract | Side | Type | Quantity | Status | Executed quantity | Average price | Reduce only |\n|---|---|---|---|---|---|---|---|---|\n${rows.map(o => `| ${new Date(o.created).toISOString()} | ${o.symbol} | ${o.side} | ${o.type} | ${o.quantity} | ${o.status} | ${o.exchange?.executedQty || "—"} | ${o.exchange?.avgPrice || "—"} | ${o.reduceOnly} |`).join("\n")}\n`;
      writeFileSync(path + ".tmp", note, { mode: 0o600 }); renameSync(path + ".tmp", path);
    } catch { order.message = `${order.message || ""} Demo status persisted; vault journal write failed.`.trim(); db().prepare("UPDATE demo_orders SET state=? WHERE id=?").run(JSON.stringify(order), order.id); }
  }
  return order;
}
function owned(workspaceId: string, id: string): DemoOrder {
  const row = db().prepare("SELECT state FROM demo_orders WHERE id=? AND workspace_id=?").get(id, workspaceId) as { state: string } | undefined;
  if (!row) throw new Error("Demo order not found in this workspace"); return JSON.parse(row.state);
}
export function demoJournal(workspaceId: string): DemoOrder[] { return (db().prepare("SELECT state FROM demo_orders WHERE workspace_id=? ORDER BY updated DESC LIMIT 40").all(workspaceId) as { state: string }[]).map(r => JSON.parse(r.state)); }
function positive(value: unknown, label: string) { const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${label}`); return n; }
function quantize(value: number, step: string) {
  const size = positive(step, "exchange increment"); const places = (step.replace(/0+$/, "").split(".")[1] || "").length;
  return (Math.floor((value + size * 1e-8) / size) * size).toFixed(places);
}
function maxOrder() { const configured = Number(process.env.BINANCE_DEMO_MAX_ORDER_USDT || 500); return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 5000) : 500; }
function maxExposure() { const configured = Number(process.env.BINANCE_DEMO_MAX_EXPOSURE_USDT || 2000); return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 20000) : 2000; }
async function account(fetcher: typeof fetch) {
  const mode = await signedRequest("/fapi/v1/positionSide/dual", "GET", {}, fetcher);
  if (mode.dualSidePosition !== false) throw new Error("Demo execution requires Binance one-way position mode; hedge mode is unsupported");
  const positions: Position[] = await signedRequest("/fapi/v3/positionRisk", "GET", {}, fetcher);
  const orders: ExchangeOrder[] = await signedRequest("/fapi/v1/openOrders", "GET", {}, fetcher);
  if (!Array.isArray(positions) || !Array.isArray(orders)) throw new Error("Invalid demo account response");
  for (const p of positions) if (!Number.isFinite(Number(p.positionAmt)) || !Number.isFinite(Number(p.markPrice)) || (Number(p.positionAmt) !== 0 && Number(p.markPrice) <= 0)) throw new Error("Invalid demo position response");
  for (const order of orders) if (!/^[A-Z0-9]{2,12}USDT$/.test(order.symbol) || !Number.isFinite(Number(order.origQty)) || Number(order.origQty) < 0 || !Number.isFinite(Number(order.executedQty)) || Number(order.executedQty) < 0) throw new Error("Invalid demo pending order response");
  return { positions: positions.filter(p => Number(p.positionAmt) !== 0), openOrders: orders };
}
export async function demoAccount(workspaceId: string, fetcher: typeof fetch = fetch) {
  const current=await account(fetcher);
  return {environment:"BINANCE USD-M DEMO",...current,protections:demoProtections(workspaceId),journal:demoJournal(workspaceId),limits:{maxOrderUsdt:maxOrder(),maxExposureUsdt:maxExposure()}};
}
export async function demoClosedCandles(symbol: string, timeframe: string, fetcher: typeof fetch = fetch) {
  if (!/^[A-Z0-9]{2,12}USDT$/.test(symbol) || !["5m", "15m", "1h", "4h"].includes(timeframe)) throw new Error("Invalid demo candle context");
  const rows = await publicRequest("/fapi/v1/klines", { symbol, interval: timeframe, limit: "500" }, fetcher);
  if (!Array.isArray(rows)) throw new Error("Invalid demo candle response");
  const duration = ({ "5m": 300, "15m": 900, "1h": 3600, "4h": 14400 } as Record<string, number>)[timeframe];
  const candles = rows.filter(r => Number(r[6]) < Date.now()).map(r => ({ time: Number(r[0]) / 1000, open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) }));
  if (candles.length < 120 || candles.some((c, i) => !Object.values(c).every(Number.isFinite) || c.close <= 0 || c.open <= 0 || c.volume < 0 || c.low > Math.min(c.open, c.close) || c.high < Math.max(c.open, c.close) || (i > 0 && c.time <= candles[i - 1].time)) || Date.now() / 1000 - candles.at(-1)!.time > duration * 2) throw new Error("Invalid, insufficient or stale demo closed candles");
  return candles;
}
export async function previewDemo(workspaceId: string, input: { symbol: string; side: string; type: string; notional: number; price?: number; reduceOnly?: boolean }, fetcher: typeof fetch = fetch) {
  if (!/^[A-Z0-9]{2,12}USDT$/.test(input.symbol) || !["BUY", "SELL"].includes(input.side) || !["MARKET", "LIMIT"].includes(input.type)) throw new Error("Use a USDT perpetual symbol, BUY/SELL and MARKET/LIMIT");
  if (input.reduceOnly !== undefined && typeof input.reduceOnly !== "boolean") throw new Error("Invalid reduce-only flag");
  const info = await publicRequest("/fapi/v1/exchangeInfo", {}, fetcher);
  const market = info.symbols?.find((s: SymbolInfo) => s.symbol === input.symbol) as SymbolInfo | undefined;
  if (!market || market.status !== "TRADING" || market.contractType !== "PERPETUAL" || market.quoteAsset !== "USDT") throw new Error("Unsupported demo contract");
  const tick = await publicRequest("/fapi/v1/premiumIndex", { symbol: input.symbol }, fetcher);
  const mark = positive(tick.markPrice, "demo mark price");
  if (!Number.isSafeInteger(tick.time) || Math.abs(Date.now() - tick.time) > 60000) throw new Error("Demo mark price is stale");
  const current = await account(fetcher);
  const lot = market.filters.find(f => f.filterType === (input.type === "MARKET" ? "MARKET_LOT_SIZE" : "LOT_SIZE")) || market.filters.find(f => f.filterType === "LOT_SIZE");
  if (!lot?.stepSize || !lot.minQty || !lot.maxQty) throw new Error("Exchange quantity filters unavailable");
  let price: string | undefined;
  if (input.type === "LIMIT") {
    const filter = market.filters.find(f => f.filterType === "PRICE_FILTER");
    if (!filter?.tickSize || !filter.minPrice || !filter.maxPrice) throw new Error("Exchange price filters unavailable");
    price = quantize(positive(input.price, "limit price"), filter.tickSize);
    if (Number(price) < Number(filter.minPrice) || Number(price) > Number(filter.maxPrice) || Math.abs(Number(price) / mark - 1) > .1) throw new Error("Limit price must satisfy exchange filters and remain within 10% of the demo mark");
  }
  const reducing = input.reduceOnly === true;
  if(!reducing && input.type!=="MARKET")throw new Error("New demo entries require MARKET with an attached SL/TP ladder. Existing limit orders can still be reconciled or canceled.");
  if(!reducing && (current.positions.some(p=>p.symbol===input.symbol)||current.openOrders.some(o=>o.symbol===input.symbol)))throw new Error("Close or reconcile this contract before opening a new protected demo position");
  if(!reducing && (hasUnresolvedProtection()||hasOutstandingProtection(input.symbol,workspaceId)))throw new Error("Reconcile existing demo protection before another entry");
  let rawQuantity: number;
  if (reducing) {
    const position = current.positions.find(p => p.symbol === input.symbol);
    if (!position || (Number(position.positionAmt) > 0 ? "SELL" : "BUY") !== input.side) throw new Error("Reduce-only side must close an existing demo position");
    rawQuantity = Math.abs(Number(position.positionAmt));
  } else rawQuantity = positive(input.notional, "notional") / Math.max(mark, Number(price || mark));
  const quantity = quantize(rawQuantity, lot.stepSize);
  if (Number(quantity) < Number(lot.minQty) || Number(quantity) > Number(lot.maxQty)) throw new Error("Quantity is outside exchange limits");
  const notional = Number(quantity) * Math.max(mark, Number(price || mark));
  const minimum = Number(market.filters.find(f => f.filterType === "MIN_NOTIONAL")?.notional || 0);
  if (!reducing && (notional < minimum || notional > maxOrder() || input.notional > maxOrder())) throw new Error(`Demo order must satisfy exchange minimum and ${maxOrder()} USDT cap`);
  if (!reducing) {
    const exposure = current.positions.reduce((sum, p) => sum + Math.abs(Number(p.positionAmt) * Number(p.markPrice)), 0);
    // Pending order exposure uses a conservative mark for every symbol.
    let pending = 0;
    for (const order of current.openOrders) {
      const px = order.symbol === input.symbol ? mark : positive((await publicRequest("/fapi/v1/premiumIndex", { symbol: order.symbol }, fetcher)).markPrice, "pending order mark");
      pending += Math.max(0, Number(order.origQty) - Number(order.executedQty)) * px;
    }
    if (!Number.isFinite(pending) || exposure + pending + notional > maxExposure()) throw new Error("Demo account exposure limit exceeded");
  }
  const priceFilter=market.filters.find(f=>f.filterType==="PRICE_FILTER");
  if(!reducing&&!priceFilter?.tickSize)throw new Error("Protection price filters unavailable");
  const protection=reducing?undefined:protectionPlan(mark,quantity,lot.stepSize,lot.minQty,priceFilter!.tickSize!,input.side);
  const order: DemoOrder = { id: `obs-${randomUUID().replaceAll("-", "")}`, workspaceId, symbol: input.symbol, side: input.side as DemoOrder["side"], type: input.type as DemoOrder["type"], quantity, price, reduceOnly: reducing, notional, requestedNotional: reducing ? 0 : Number(input.notional), created: Date.now(), expires: Date.now() + 60000, status: "DRAFT", protection };
  return save(order);
}
export async function reconcileDemo(workspaceId: string, id: string, fetcher: typeof fetch = fetch) {
  const order = owned(workspaceId, id);
  if (order.status === "DRAFT" || order.status === "EXPIRED") return order;
  try {
    const exchange = await signedRequest("/fapi/v1/order", "GET", { symbol: order.symbol, origClientOrderId: order.id }, fetcher);
    if (exchange.clientOrderId !== order.id || exchange.symbol !== order.symbol || !ORDER_STATUSES.includes(exchange.status)) throw new Error("Demo reconciliation identity/status mismatch");
    const result=save({ ...order, status: exchange.status, exchange, message: undefined });
    const protection=await protectDemo(result,(path,method,params)=>signedRequest(path,method,params,fetcher));
    return result.protection&&!protectionReady(protection)?save({...result,message:"Entry acknowledged; SL/TP protection is not fully verified. Inspect Binance demo and reconcile. New entries are blocked."}):result;
  } catch { return save({ ...order, message: "Exchange status unavailable. Do not resubmit; reconcile this client ID again." }); }
}
export async function submitDemo(workspaceId: string, id: string, fetcher: typeof fetch = fetch) {
  const order = owned(workspaceId, id);
  if (order.status !== "DRAFT") return reconcileDemo(workspaceId, id, fetcher);
  if (order.expires < Date.now()) { save({ ...order, status: "EXPIRED" }); throw new Error("Demo preview expired. Create a fresh preview."); }
  if(!order.reduceOnly)await requireTradingPlan(currentAccount()?.id||'');
  // Atomically claim globally: unknown submissions block further entries across workspaces.
  const connection = db(); connection.exec("BEGIN IMMEDIATE");
  try {
    const latest = owned(workspaceId, id);
    if (latest.status !== "DRAFT") throw new Error("Demo draft was already claimed; reconcile it");
    const all = connection.prepare("SELECT state FROM demo_orders").all() as { state: string }[];
    if (all.some(r => ["SUBMITTING", "UNKNOWN"].includes(JSON.parse(r.state).status))) throw new Error("Reconcile the unresolved demo submission before placing another order");
    save({ ...order, status: "SUBMITTING" }); connection.exec("COMMIT");
  } catch (error) { connection.exec("ROLLBACK"); throw error; }
  try {
    // Recheck account/filter/exposure just before submitting, using a new validated preview.
    const refreshed = await previewDemo(workspaceId, { symbol: order.symbol, side: order.side, type: order.type, notional: order.requestedNotional, price: order.price ? Number(order.price) : undefined, reduceOnly: order.reduceOnly }, fetcher);
    db().prepare("DELETE FROM demo_orders WHERE id=?").run(refreshed.id);
    if (refreshed.quantity !== order.quantity || refreshed.price !== order.price) { save({ ...order, status: "EXPIRED" }); throw new Error("Demo price/position changed. Review a fresh preview."); }
  } catch (error) { if (owned(workspaceId, id).status === "SUBMITTING") save({ ...order, status: "EXPIRED" }); throw error; }
  if (order.expires < Date.now()) { save({ ...order, status: "EXPIRED" }); throw new Error("Demo preview expired during revalidation; create a fresh preview"); }
  try {
    const params: Params = { symbol: order.symbol, side: order.side, type: order.type, quantity: order.quantity, newClientOrderId: order.id, newOrderRespType: "RESULT", reduceOnly: String(order.reduceOnly) };
    if (order.price) { params.price = order.price; params.timeInForce = "GTC"; }
    const exchange = await signedRequest("/fapi/v1/order", "POST", params, fetcher);
    if (exchange.clientOrderId !== order.id || exchange.symbol !== order.symbol || !ORDER_STATUSES.includes(exchange.status)) throw new Error("Unexpected demo acknowledgement");
    const result=save({ ...order, status: exchange.status, exchange });
    const protection=await protectDemo(result,(path,method,params)=>signedRequest(path,method,params,fetcher));
    return result.protection&&!protectionReady(protection)?save({...result,message:"Entry acknowledged; SL/TP protection is not fully verified. Inspect Binance demo and reconcile. New entries are blocked."}):result;
  } catch (error) {
    if (error instanceof DemoRejection && error.status >= 400 && error.status < 500 && Number.isFinite(error.code) && ![-1001, -1006, -1007].includes(error.code)) return save({ ...order, status: "REJECTED", message: error.message });
    save({ ...order, status: "UNKNOWN", message: "Submission outcome uncertain; reconciling without retrying the order." });
    return reconcileDemo(workspaceId, id, fetcher);
  }
}
export async function cancelDemo(workspaceId: string, id: string, fetcher: typeof fetch = fetch) {
  const order = owned(workspaceId, id);
  if (!["NEW", "PARTIALLY_FILLED"].includes(order.status)) throw new Error("Reconcile first; only an open demo order can be canceled");
  try { await signedRequest("/fapi/v1/order", "DELETE", { symbol: order.symbol, origClientOrderId: order.id }, fetcher); }
  catch { /* Resolve uncertain cancellation through the authoritative order query. */ }
  return reconcileDemo(workspaceId, id, fetcher);
}

export async function maintainDemoProtection(workspaceId:string,positions:Position[],fetcher:typeof fetch=fetch){await reconcileProtections(workspaceId,positions,(path,method,params)=>signedRequest(path,method,params,fetcher));}
