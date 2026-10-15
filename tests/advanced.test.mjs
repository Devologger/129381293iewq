import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createWorkspace, db, saveCredential, updateWorkspace } from "../lib/server/store.ts";
import { previewDemo, submitDemo, cancelDemo, reconcileDemo, demoJournal } from "../lib/server/demo-execution.ts";
import { configureDemoBot, demoBots, tickDemoBot } from "../lib/server/demo-bots.ts";
import { runTeam, budgetStatus, saveTeamSettings, runScheduledTeams } from "../lib/server/agent-team.ts";
process.env.TEAM_AI_PROVIDER = "openai";
const folder = mkdtempSync(join(tmpdir(), "obsidian-advanced-"));
process.env.TERMINAL_DATA_DIR = folder; process.env.TERMINAL_VAULT_DIR = join(folder, "vault");
after(() => { db().close(); rmSync(folder, { recursive: true, force: true }); });
saveCredential("BINANCE_DEMO_API_KEY", "test-demo-key"); saveCredential("BINANCE_DEMO_API_SECRET", "test-demo-secret"); saveCredential("TRADE_AI_KEY", "test-ai-key");
function workspace() { const id = randomBytes(24).toString("hex"); createWorkspace(id); return id; }
function demoProvider({ timeout = false, neverFound = false, hedge = false, mark = 100, position = 0, positionAfterFill=false, rejectProtection=false } = {}) {
  let writes = 0, canceled = false; const orders = new Map();
  const fetcher = async (url, options) => {
    const u = new URL(url); assert.equal(u.hostname, "demo-fapi.binance.com");
    if (u.pathname.endsWith("/time")) return Response.json({ serverTime: Date.now() });
    if (u.pathname.endsWith("/exchangeInfo")) return Response.json({ symbols: [{ symbol: "BTCUSDT", status: "TRADING", contractType: "PERPETUAL", quoteAsset: "USDT", filters: [{ filterType: "LOT_SIZE", minQty: ".001", maxQty: "1000", stepSize: ".001" }, { filterType: "MARKET_LOT_SIZE", minQty: ".001", maxQty: "1000", stepSize: ".001" }, { filterType: "PRICE_FILTER", minPrice: ".01", maxPrice: "1000000", tickSize: ".01" }, { filterType: "MIN_NOTIONAL", notional: "5" }] }] });
    if (u.pathname.endsWith("/klines")) { const end = Math.floor(Date.now()/900000)*900000-900000; return Response.json(Array.from({length:120},(_,i)=>[end-(119-i)*900000,"99","102","98",i===119?"101":"99","2",end-(119-i)*900000+899999])); }
    if (u.pathname.endsWith("/premiumIndex")) return Response.json({ markPrice: String(mark), time: Date.now() });
    assert.match(u.searchParams.get("signature"), /^[a-f0-9]{64}$/); assert.equal(options.headers["X-MBX-APIKEY"], "test-demo-key");
    if (u.pathname.endsWith("/dual")) return Response.json({ dualSidePosition: hedge });
    if (u.pathname.endsWith("/positionRisk")) return Response.json(position ? [{ symbol: "BTCUSDT", positionAmt: String(position), markPrice: String(mark), positionSide: "BOTH", entryPrice: "100", unRealizedProfit: "0" }] : []);
    if (u.pathname.endsWith("/openOrders")) return Response.json([]);
    if(u.pathname.endsWith('/algoOrder')){
      const aid=u.searchParams.get('clientAlgoId');
      if(options.method==='POST'){if(rejectProtection)return Response.json({code:-2021},{status:400});const row={clientAlgoId:aid,symbol:'BTCUSDT',side:u.searchParams.get('side'),workingType:u.searchParams.get('workingType'),positionSide:u.searchParams.get('positionSide'),algoStatus:'NEW',orderType:u.searchParams.get('type'),triggerPrice:u.searchParams.get('triggerPrice'),closePosition:u.searchParams.get('closePosition')==='true',reduceOnly:u.searchParams.get('reduceOnly')==='true',quantity:u.searchParams.get('quantity')};orders.set(aid,row);return Response.json(row);}
      const row=orders.get(aid);if(!row)return Response.json({code:-2013},{status:400});if(options.method==='DELETE')row.algoStatus='CANCELED';return Response.json(row);
    }

    assert.equal(u.pathname, "/fapi/v1/order");
    const id = u.searchParams.get("newClientOrderId") || u.searchParams.get("origClientOrderId");
    if (options.method === "POST") { writes++;if(positionAfterFill)position=u.searchParams.get("reduceOnly")==="true"?0:Number(u.searchParams.get("quantity")); const row = { clientOrderId: id, symbol: "BTCUSDT", status: u.searchParams.get("type") === "LIMIT" ? "NEW" : "FILLED", orderId: 123, executedQty: u.searchParams.get("quantity") }; orders.set(id, row); if (timeout) throw new Error("connection lost after exchange accepted"); return Response.json(row); }
    if (options.method === "DELETE") {canceled = true;if(!orders.has(id))orders.set(id,{clientOrderId:id,symbol:"BTCUSDT",status:"NEW"});}
    if (neverFound) return Response.json({ code: -2013 }, { status: 400 });
    const row = orders.get(id); return row ? Response.json({ ...row, status: canceled ? "CANCELED" : row.status }) : Response.json({ code: -2013 }, { status: 400 });
  };
  return { fetcher, writes: () => writes };
}
const entry = { symbol: "BTCUSDT", side: "BUY", type: "MARKET", notional: 100 };
test("demo market submission is exchange-backed, persistent and idempotent", async () => {
  const id = workspace(), provider = demoProvider(); const draft = await previewDemo(id, entry, provider.fetcher);
  assert.equal(draft.quantity, "1.000"); assert.equal(provider.writes(), 0);
  const order = await submitDemo(id, draft.id, provider.fetcher); assert.equal(order.status, "FILLED");
  await submitDemo(id, draft.id, provider.fetcher); assert.equal(provider.writes(), 1);
  assert.equal(demoJournal(id).find(r => r.id === draft.id).exchange.orderId, 123);
  assert.match(readFileSync(join(folder,"vault","Research",id,"Binance Demo Order Journal.md"),"utf8"),/FILLED/);
  await assert.rejects(submitDemo(workspace(), draft.id, provider.fetcher), /workspace/);
});
test("demo uncertainty reconciles by client ID without duplicating writes", async () => {
  const id = workspace(), provider = demoProvider({ timeout: true }); const draft = await previewDemo(id, entry, provider.fetcher);
  const order = await submitDemo(id, draft.id, provider.fetcher); assert.equal(order.status, "FILLED"); assert.equal(provider.writes(), 1);
});
test("demo filters, exposure, hedge mode and preview expiry veto writes", async () => {
  const id = workspace(), provider = demoProvider();
  await assert.rejects(previewDemo(id, { ...entry, notional: 501 }, provider.fetcher), /cap/);
  await assert.rejects(previewDemo(id, { ...entry, notional: 1 }, provider.fetcher), /minimum/);
  await assert.rejects(previewDemo(id, entry, demoProvider({ hedge: true }).fetcher), /one-way/);
  await assert.rejects(previewDemo(id, entry, demoProvider({ position: 21 }).fetcher), /contract|exposure/);
  const draft = await previewDemo(id, entry, provider.fetcher);
  db().prepare("UPDATE demo_orders SET state=? WHERE id=?").run(JSON.stringify({ ...draft, expires: 1 }), draft.id);
  await assert.rejects(submitDemo(id, draft.id, provider.fetcher), /expired/); assert.equal(provider.writes(), 0);
});
test("demo limit cancellation and reduce-only close use authoritative orders", async () => {
  const id=workspace(),provider=demoProvider();
  await assert.rejects(previewDemo(id,{...entry,type:'LIMIT',price:99},provider.fetcher),/MARKET.*SL/);
  const draft=await previewDemo(id,entry,provider.fetcher);
  db().prepare('UPDATE demo_orders SET state=? WHERE id=?').run(JSON.stringify({...draft,type:'LIMIT',price:'99.99',status:'NEW',protection:undefined}),draft.id);
  assert.equal((await cancelDemo(id,draft.id,provider.fetcher)).status,'CANCELED');
  const reducing = demoProvider({ position: 2 });
  await assert.rejects(previewDemo(id, { ...entry, reduceOnly: true }, reducing.fetcher), /close/);
  const close = await previewDemo(id, { ...entry, side: "SELL", reduceOnly: true, notional: 0 }, reducing.fetcher);
  assert.equal(close.quantity, "2.000"); assert.equal(close.reduceOnly, true);
});
test("unresolved demo write blocks other submissions across workspaces", async () => {
  const id = workspace(), provider = demoProvider({ timeout: true, neverFound: true }); const draft = await previewDemo(id, entry, provider.fetcher);
  assert.equal((await submitDemo(id, draft.id, provider.fetcher)).status, "UNKNOWN");
  const another = workspace(), otherDraft = await previewDemo(another, entry, provider.fetcher);
  await assert.rejects(submitDemo(another, otherDraft.id, provider.fetcher), /unresolved/);
  assert.equal(provider.writes(), 1);
  // Clear fixture uncertainty by querying the same client ID with its authoritative acknowledgement.
  await reconcileDemo(id, draft.id, async (url, options) => new URL(url).pathname.endsWith("/order") ? Response.json({ clientOrderId: draft.id, symbol: "BTCUSDT", status: "FILLED" }) : provider.fetcher(url, options));
});
const contextKey = "binance:spot:BTC:15m:exchange";
function researchedWorkspace() { const id = workspace(); updateWorkspace(id, ws => ({ ...ws, bots: [{ key: contextKey, exchange: "binance", market: "spot", symbol: "BTC", timeframe: "15m", source: "exchange", tolerance: .08, enabled: false, learning: false, lastBar: 123, research: { as_of: 123, decision: "keep_baseline", studies: [], model: "test evidence" } }] })); return id; }
function aiProvider({ rejectOnce = false, timeout = false, incomplete = false } = {}) {
  let count = 0;
  return { calls: () => count, fetcher: async (url, options) => {
    count++; assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.tools, undefined); assert.equal(body.max_output_tokens, 1000); assert.ok(!body.input.includes("test-demo-secret"));
    if (timeout) throw new Error("provider timeout");
    if (rejectOnce && count === 1) return Response.json({}, { status: 429, headers: { "retry-after": "1" } });
    return Response.json({ status: incomplete ? "incomplete" : "completed", usage: { input_tokens: 200, output_tokens: 100, input_tokens_details: { cached_tokens: 50 } }, output: [{ type: "message", content: [{ type: "output_text", text: "Reviewed evidence. [[Strategy Index]]: obtain more forward observations before changing execution." }] }] });
  } };
}
test("research council makes three real provider calls, accounts usage, caches and writes vault notes", async () => {
  const id = researchedWorkspace(), provider = aiProvider(); const run = await runTeam(id, contextKey, "Review evidence", false, provider.fetcher);
  assert.equal(run.status, "COMPLETE"); assert.equal(run.messages.length, 3); assert.equal(provider.calls(), 3);
  assert.deepEqual(run.messages.map(m => m.role), ["researcher", "risk", "curator"]);
  assert.ok(Math.abs(run.costUsd - .0021) < 1e-10);
  const note = readFileSync(join(folder, "vault", "Research", id, run.note), "utf8"); assert.match(note, /Risk reviewer/); assert.match(note, /advisory|Advisory/);
  const cached = await runTeam(id, contextKey, "Review evidence", false, provider.fetcher); assert.equal(cached.cacheHit, true); assert.equal(provider.calls(), 3);
  const budget = budgetStatus(); assert.equal(budget.inputTokens, 600); assert.equal(budget.outputTokens, 300); assert.equal(budget.cachedTokens, 150);
});
test("daily budget applies globally and vetoes provider calls before spending", async () => {
  process.env.TEAM_DAILY_BUDGET_USD = "0.001";
  try { const provider = aiProvider(); const run = await runTeam(researchedWorkspace(), contextKey, "Budget must veto", false, provider.fetcher); assert.equal(run.status, "FAILED"); assert.match(run.error, /limit/); assert.equal(provider.calls(), 0); }
  finally { delete process.env.TEAM_DAILY_BUDGET_USD; }
});
test("rate-limit rejection permits one bounded retry; unknown calls retain reservation", async () => {
  const provider = aiProvider({ rejectOnce: true }); const run = await runTeam(researchedWorkspace(), contextKey, "Retry rejected call", false, provider.fetcher);
  assert.equal(run.status, "COMPLETE"); assert.equal(provider.calls(), 4);
  const before = budgetStatus(), timeout = aiProvider({ timeout: true });
  const failed = await runTeam(researchedWorkspace(), contextKey, "Timeout must not retry", false, timeout.fetcher);
  assert.equal(failed.status, "FAILED"); assert.equal(timeout.calls(), 1); assert.ok(budgetStatus().reservedUsd > before.reservedUsd);
});
test("incomplete model output is charged and escalation requires explicit settings", async () => {
  const id = researchedWorkspace(), provider = aiProvider({ incomplete: true }); const run = await runTeam(id, contextKey, "Account incomplete usage", false, provider.fetcher);
  assert.equal(run.status, "FAILED"); assert.ok(run.costUsd > 0); assert.equal(provider.calls(), 1);
  await assert.rejects(runTeam(id, contextKey, "Premium review", true, provider.fetcher), /Enable/);
  assert.throws(() => saveTeamSettings(id, { enabled: true, intervalMinutes: 1, contextKey, allowEscalation: false }), /interval/);
});
test("same workspace team lease prevents overlapping runs", async () => {
  const id = researchedWorkspace(), provider = aiProvider();
  db().prepare("INSERT INTO team_locks VALUES (?,?)").run(id, Date.now() + 10000);
  await assert.rejects(runTeam(id, contextKey, "Concurrent review", false, provider.fetcher), /already/); assert.equal(provider.calls(), 0);
});
test("scheduled team claims persistent next deadline and reuses evidence cache", async () => {
  const id = researchedWorkspace(), provider = aiProvider();
  await runTeam(id, contextKey, undefined, false, provider.fetcher);
  const settings = saveTeamSettings(id, { enabled: true, intervalMinutes: 60, contextKey, allowEscalation: false });
  db().prepare("UPDATE team_settings SET state=? WHERE workspace_id=?").run(JSON.stringify({ ...settings, nextAt: 1 }), id);
  await runScheduledTeams();
  assert.equal(provider.calls(), 3); assert.ok(JSON.parse(db().prepare("SELECT state FROM team_settings WHERE workspace_id=?").get(id).state).nextAt > Date.now());
});


test("demo bot baselines before entry, claims new bars once and monitors paused positions", async () => {
  const id = workspace(), provider = demoProvider();
  const configured = await configureDemoBot(id, {symbol:"BTCUSDT",timeframe:"15m",enabled:true,notional:100},provider.fetcher);
  const report = {as_of:123,active_tolerance:.08,snapshot:{display_levels:[{price:100}]},studies:[]};
  await tickDemoBot(id,configured,provider.fetcher,async()=>report);
  assert.equal(provider.writes(),0); let bot=demoBots(id)[0]; assert.ok(bot.lastBar>0);
  db().prepare("UPDATE demo_bots SET state=? WHERE symbol=?").run(JSON.stringify({...bot,lastBar:bot.lastBar-900}),"BTCUSDT");
  await tickDemoBot(id,demoBots(id)[0],provider.fetcher,async()=>report);
  assert.equal(provider.writes(),1);assert.ok(demoBots(id)[0].lastOrder);
  await tickDemoBot(id,demoBots(id)[0],provider.fetcher,async()=>report);assert.equal(provider.writes(),1);
  await assert.rejects(configureDemoBot(workspace(),{symbol:"BTCUSDT",timeframe:"15m",enabled:true,notional:100},provider.fetcher),/another workspace/);
  await configureDemoBot(id,{symbol:"BTCUSDT",timeframe:"15m",enabled:false,notional:100},provider.fetcher);
  const protecting=demoProvider({position:2,mark:106});
  db().prepare("DELETE FROM demo_protections WHERE workspace_id=?").run(id);
  const prior=demoJournal(id).find(o=>o.id===demoBots(id)[0].lastOrder);db().prepare("UPDATE demo_orders SET state=? WHERE id=?").run(JSON.stringify({...prior,protection:undefined}),prior.id);
  // Reconcile earlier fixture order against the same provider's authoritative ID.
  const original=demoBots(id)[0].lastOrder;
  const fetcher=async(url,options)=>new URL(url).pathname.endsWith("/order") && options.method==="GET" && new URL(url).searchParams.get("origClientOrderId")===original ? Response.json({clientOrderId:original,symbol:"BTCUSDT",status:"FILLED"}) : protecting.fetcher(url,options);
  await tickDemoBot(id,demoBots(id)[0],fetcher,async()=>report);
  assert.equal(protecting.writes(),1); assert.equal(demoBots(id)[0].enabled,false);
  assert.equal(demoJournal(id).find(r=>r.id===demoBots(id)[0].lastOrder).reduceOnly,true);
});

test('demo Start arms automatic council only after closed-bar evidence, and a provider failure persists a waiting deadline',async()=>{
  const id=workspace(),provider=demoProvider();await configureDemoBot(id,{symbol:'ETHUSDT',timeframe:'15m',enabled:true,notional:100},provider.fetcher);
  const {teamSettings}=await import('../lib/server/agent-team.ts');assert.equal(teamSettings(id).enabled,true);assert.equal(teamSettings(id).contextKey,'binance-demo:perpetual:ETHUSDT:15m');
  // Other test workspaces already have scheduled state; move their deadlines to keep this observation isolated.
  const settingsRows=db().prepare('SELECT workspace_id,state FROM team_settings').all();for(const row of settingsRows)if(row.workspace_id!==id)db().prepare('UPDATE team_settings SET state=? WHERE workspace_id=?').run(JSON.stringify({...JSON.parse(row.state),nextAt:Date.now()+86400000}),row.workspace_id);
  let calls=0;const unavailable=async()=>{calls++;return Response.json({},{status:503});};await runScheduledTeams(unavailable);assert.equal(calls,0);assert.match(teamSettings(id).message,/first research/);
  const bot=demoBots(id)[0];db().prepare('UPDATE demo_bots SET state=? WHERE symbol=?').run(JSON.stringify({...bot,research:{as_of:123,studies:[],active_tolerance:.08,decision:'keep_baseline'}}),'ETHUSDT');
  await runScheduledTeams(unavailable);assert.equal(calls,1);assert.equal(teamSettings(id).state,'waiting');assert.ok(teamSettings(id).nextAt>Date.now()+3600000);await runScheduledTeams(unavailable);assert.equal(calls,1);
});

test('a confirmed demo fill with rejected protection halts entries and records a reducing emergency close',async()=>{
 db().prepare('DELETE FROM demo_bots WHERE symbol=?').run('BTCUSDT');
 const id=workspace(),provider=demoProvider({positionAfterFill:true,rejectProtection:true}),report={as_of:123,active_tolerance:.08,snapshot:{display_levels:[{price:100}]},studies:[]};
 const configured=await configureDemoBot(id,{symbol:'BTCUSDT',timeframe:'15m',enabled:true,notional:100},provider.fetcher);await tickDemoBot(id,configured,provider.fetcher,async()=>report);
 let bot=demoBots(id)[0];db().prepare('UPDATE demo_bots SET state=? WHERE symbol=?').run(JSON.stringify({...bot,lastBar:bot.lastBar-900}),'BTCUSDT');await tickDemoBot(id,demoBots(id)[0],provider.fetcher,async()=>report);
 bot=demoBots(id)[0];assert.equal(bot.enabled,false);assert.match(bot.error,/unconfirmed/);assert.equal(provider.writes(),2);const close=demoJournal(id).find(o=>o.id===bot.lastOrder);assert.equal(close.reduceOnly,true);assert.equal(close.status,'FILLED');
 await tickDemoBot(id,bot,provider.fetcher,async()=>report);assert.equal(provider.writes(),2);const {hasOutstandingProtection}=await import('../lib/server/demo-protection.ts');assert.equal(hasOutstandingProtection('BTCUSDT',id),false);
});
