"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/terminal-engine";

export function MarketChart({ candles, levels = [], compact = false }: { candles: Candle[]; levels?: { price: number; label: string }[]; compact?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true, height: compact ? 190 : 360,
      layout: { background: { type: ColorType.Solid, color: "#111416" }, textColor: "#758087", fontSize: 10, attributionLogo: true },
      grid: { vertLines: { color: "#ffffff04" }, horzLines: { color: "#ffffff07" } },
      crosshair: { vertLine: { color: "#78828b" }, horzLine: { color: "#78828b" } },
      rightPriceScale: { borderColor: "#ffffff09", scaleMargins: { top: .13, bottom: .22 } },
      timeScale: { borderColor: "#ffffff09", timeVisible: true, secondsVisible: false },
      handleScroll: true, handleScale: true,
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#80bda7", downColor: "#c97b79", borderVisible: false, wickUpColor: "#80bda7", wickDownColor: "#c97b79", priceFormat: { type: "price", precision: candles.at(-1)!.close < 1 ? 4 : 2, minMove: candles.at(-1)!.close < 1 ? .0001 : .01 } });
    series.setData(candles.map(c => ({ ...c, time: c.time as UTCTimestamp })));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ visible: false, scaleMargins: { top: .85, bottom: 0 } });
    volume.setData(candles.map(c => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? "#80bda728" : "#c97b7928" })));
    levels.slice(-3).forEach(l => series.createPriceLine({ price: l.price, color: "#d3ad65", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.label }));
    chart.timeScale().setVisibleLogicalRange({ from: candles.length - (compact ? 45 : 100), to: candles.length + 3 });
    return () => chart.remove();
  }, [candles, levels, compact]);
  return <div ref={container} className="ot-chart-canvas" style={{ height: compact ? 190 : 360 }} role="img" aria-label="Interactive candlestick and volume chart. Drag to pan; scroll to zoom." />;
}
