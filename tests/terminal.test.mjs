import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { INITIAL_PORTFOLIO, FEE, demoCandles, openPaper, closePaper, validatePortfolio } from "../lib/terminal-engine.ts";
import { GET as market } from "../app/api/terminal/market/route.ts";
import { POST as discord } from "../app/api/terminal/discord/route.ts";

const feed = () => ({ candles: demoCandles("BTC", "15m"), exchange: "binance", market: "spot", symbol: "BTC", timeframe: "15m", source: "demo", fetchedAt: Date.now() });

test("paper long round trip conserves collateral and deducts both side costs", () => {
  const f = feed();
  const entered = openPaper({ ...INITIAL_PORTFOLIO, paused: false }, f, "long", 500);
  assert.equal(entered.positions.length, 1);
  assert.equal(entered.cash, 10000 - 500 * (1 + FEE));
  const exited = closePaper(entered, entered.positions[0].id, f);
  assert.equal(exited.positions.length, 0);
  assert.ok(Math.abs(exited.cash - (10000 - 1000 * FEE)) < .000001);
  assert.ok(Math.abs(exited.fills[0].pnl + 1000 * FEE) < .000001);
  assert.ok(validatePortfolio(exited));
});

test("paper risk controls reject paused, oversize, stale and spot short orders", () => {
  const f = feed(); const p = { ...INITIAL_PORTFOLIO, paused: false };
  assert.throws(() => openPaper(INITIAL_PORTFOLIO, f, "long", 100), /Enable/);
  assert.throws(() => openPaper(p, f, "long", 10000), /buying power/);
  assert.throws(() => openPaper(p, { ...f, fetchedAt: 0 }, "long", 100), /Refresh/);
  assert.throws(() => openPaper(p, f, "short", 100), /perpetual/);
  let six = p;
  for (let i = 0; i < 6; i++) six = openPaper(six, f, "long", 100);
  assert.throws(() => openPaper(six, f, "long", 100), /six/);
});

test("closing rejects a different exchange or data source", () => {
  const f = feed(); const p = openPaper({ ...INITIAL_PORTFOLIO, paused: false }, f, "long", 100);
  assert.throws(() => closePaper(p, p.positions[0].id, { ...f, exchange: "bybit" }), /matching/);
  assert.throws(() => closePaper(p, p.positions[0].id, { ...f, source: "exchange" }), /matching/);
});

test("perpetual paper short gains when price falls", () => {
  const f = { ...feed(), market: "perpetual" };
  const p = openPaper({ ...INITIAL_PORTFOLIO, paused: false }, f, "short", 1000);
  const lower = { ...f, candles: f.candles.map((c, i) => i === f.candles.length - 1 ? { ...c, close: c.close * .95 } : c) };
  const result = closePaper(p, p.positions[0].id, lower);
  assert.ok(result.fills[0].pnl > 47);
});

test("market provider validates destinations and handles exchange outages", async () => {
  assert.equal((await market(new Request("http://localhost/api/terminal/market?exchange=evil"))).status, 400);
  assert.equal((await market(new Request("http://localhost/api/terminal/market?symbol=BTC%26redirect=evil"))).status, 400);
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Network unavailable"); };
  try { assert.equal((await market(new Request("http://localhost/api/terminal/market?exchange=bybit&symbol=DOGE"))).status, 502); }
  finally { globalThis.fetch = original; }
});

test("market provider normalizes all three schemas and drops open candles", async () => {
  const original = globalThis.fetch;
  const rows = Array.from({ length: 130 }, (_, i) => [String((Math.floor(Date.now()/900000)-130+i)*900000), "100", "105", "95", "102", "8"]);
  try {
    for (const exchange of ["binance", "bybit", "kraken"]) {
      globalThis.fetch = async () => Response.json(exchange === "binance" ? rows : exchange === "bybit" ? { retCode: 0, result: { list: rows.toReversed() } } : { error: [], result: { XXBTZUSD: rows.map(r => [String(Number(r[0])/1000), ...r.slice(1,5), "101", "8", "3"]), last: "0" } });
      const response = await market(new Request(`http://localhost/api/terminal/market?exchange=${exchange}&symbol=BTC&timeframe=15m`));
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.source, "exchange");
      assert.equal(data.candles.length, 130);
      assert.equal(data.candles[0].volume, 8);
      assert.ok(data.candles.every((c,i) => !i || c.time > data.candles[i-1].time));
    }
  } finally { globalThis.fetch = original; }
});

test("Discord accepts signed PING and rejects tampering and replay", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const old = process.env.DISCORD_PUBLIC_KEY;
  process.env.DISCORD_PUBLIC_KEY = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
  try {
    const timestamp = String(Math.floor(Date.now()/1000));
    const body = JSON.stringify({ type: 1 });
    const signature = sign(null, Buffer.from(timestamp + body), privateKey).toString("hex");
    const req = (text, time=timestamp) => new Request("http://localhost/api/terminal/discord", { method: "POST", body: text, headers: { "x-signature-ed25519": signature, "x-signature-timestamp": time } });
    const response = await discord(req(body));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { type: 1 });
    assert.equal((await discord(req(body + " "))).status, 401);
    assert.equal((await discord(req(body, "1000000000"))).status, 401);
  } finally { if (old) process.env.DISCORD_PUBLIC_KEY = old; else delete process.env.DISCORD_PUBLIC_KEY; }
});
