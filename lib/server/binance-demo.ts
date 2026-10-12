import { createHmac } from "node:crypto";
import { credential } from "./store.ts";

export async function verifyBinanceDemo(fetcher: typeof fetch = fetch) {
  const apiKey = credential("BINANCE_DEMO_API_KEY"); const secret = credential("BINANCE_DEMO_API_SECRET");
  if (!apiKey || !secret) throw new Error("Binance demo keys can be added later in Connections");
  const base = "https://demo-fapi.binance.com";
  const clock = await fetcher(`${base}/fapi/v1/time`, { signal: AbortSignal.timeout(8000) });
  if (!clock.ok) throw new Error(`Binance demo time endpoint returned HTTP ${clock.status}`);
  const timestamp = (await clock.json()).serverTime;
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error("Binance demo returned an invalid server timestamp");
  const query = new URLSearchParams({ timestamp: String(timestamp), recvWindow: "5000" }).toString();
  const signature = createHmac("sha256", secret).update(query).digest("hex");
  const response = await fetcher(`${base}/fapi/v2/balance?${query}&signature=${signature}`, { headers: { "X-MBX-APIKEY": apiKey }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok) throw new Error(`Binance demo authentication returned HTTP ${response.status}. Verify these are USD-M demo keys.`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Binance demo returned an invalid balance response");
  const usdt = data.find(row => row.asset === "USDT");
  const availableUsdt = Number(usdt?.availableBalance || 0);
  if (!Number.isFinite(availableUsdt)) throw new Error("Invalid demo balance");
  return { verified: true, environment: "binance-usdm-demo", availableUsdt, ordersPlaced: 0 };
}
