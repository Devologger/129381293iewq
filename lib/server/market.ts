type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
const cache = new Map<string, { expires: number; candles: Candle[] }>();
const intervals: Record<string, number> = { "5m": 5, "15m": 15, "1h": 60, "4h": 240 };

export async function marketResponse(request: Request) {
  const params = new URL(request.url).searchParams;
  const exchange = params.get("exchange") || "kraken";
  const symbol = params.get("symbol") || "BTC";
  const timeframe = params.get("timeframe") || "15m";
  const market = params.get("market") || "spot";
  if (!["binance", "bybit", "kraken"].includes(exchange) || !/^[A-Z0-9]{2,12}$/.test(symbol) || !intervals[timeframe] || !["spot", "perpetual"].includes(market) || (exchange === "kraken" && market !== "spot")) {
    return Response.json({ error: "Unsupported exchange, market, symbol, or interval" }, { status: 400 });
  }
  const key = `${exchange}:${symbol}:${timeframe}:${market}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Response.json({ candles: hit.candles, source: "exchange", exchange, market });
  try {
    let url: string;
    if (exchange === "binance") url = `https://${market === "spot" ? "api.binance.com/api/v3" : "fapi.binance.com/fapi/v1"}/klines?symbol=${symbol}USDT&interval=${timeframe}&limit=400`;
    else if (exchange === "bybit") url = `https://api.bybit.com/v5/market/kline?category=${market === "spot" ? "spot" : "linear"}&symbol=${symbol}USDT&interval=${intervals[timeframe]}&limit=400`;
    else url = `https://api.kraken.com/0/public/OHLC?pair=${symbol === "BTC" ? "XBT" : symbol}USD&interval=${intervals[timeframe]}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) throw new Error(`Exchange returned HTTP ${response.status}`);
    const data = await response.json();
    let candles: Candle[];
    if (exchange === "kraken") {
      if (data.error?.length) throw new Error("Exchange rejected market request");
      const pair = Object.keys(data.result).find(k => k !== "last")!;
      candles = data.result[pair].map((r: string[]) => ({ time: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[6]) }));
    } else {
      if (exchange === "bybit" && data.retCode !== 0) throw new Error("Exchange rejected market request");
      const rows = exchange === "bybit" ? data.result.list.toReversed() : data;
      candles = rows.map((r: string[]) => ({ time: Math.floor(Number(r[0]) / 1000), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) }));
    }
    // Exclude the open candle so research and paper signals never use partial bars.
    candles = candles.filter(c => c.time + intervals[timeframe] * 60 <= Date.now() / 1000).slice(-400);
    if (candles.length < 120 || candles.some(c => !Object.values(c).every(Number.isFinite))) throw new Error("Exchange returned insufficient candle data");
    if (candles.some((c, i) => c.low <= 0 || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || (i > 0 && c.time <= candles[i - 1].time))) throw new Error("Exchange returned inconsistent candles");
    if (candles.at(-1)!.time + intervals[timeframe] * 60 < Date.now() / 1000 - intervals[timeframe] * 120) throw new Error("Exchange returned stale market data");
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { candles, expires: Date.now() + 15000 });
    return Response.json({ candles, source: "exchange", exchange, market });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Market feed unavailable" }, { status: 502 });
  }
}
