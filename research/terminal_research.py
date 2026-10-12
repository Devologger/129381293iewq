"""Bounded paper research using the repository's canonical directional Fib model.

JSON on stdin/stdout. No credentials, network calls, or exchange orders.
This harness evaluates long-only 0.618 reclaims; it is not the live adapter.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from research.directional_fib_anchor_model import build_directional_fib_snapshot


def simulate(candles, tolerance, start, end):
    trades = []
    position = None
    for i in range(max(80, start), end):
        bar = candles[i]
        if position:
            # Stop first when both levels are crossed: conservative bar assumption.
            exit_price = position["stop"] if bar["low"] <= position["stop"] else (
                position["target"] if bar["high"] >= position["target"] else None
            )
            if exit_price is not None or i - position["index"] >= 24 or i == end - 1:
                exit_price = exit_price or bar["close"]
                # Round-trip 10 bps per side plus 2 bps slippage per side.
                net = (exit_price - position["entry"] - (exit_price + position["entry"]) * .0012) / position["risk"]
                trades.append(round(net, 4))
                position = None
            continue
        if i == end - 1:
            continue
        history = candles[max(0, i - 100):i]
        snapshot = build_directional_fib_snapshot(history, side="long", tolerance_pct=tolerance)
        anchors = snapshot.get("anchors", [])
        if not anchors:
            continue
        anchor = max(anchors, key=lambda a: a["end_index"])
        level = anchor["primary_0618"]["price"]
        if history[-2]["close"] < level <= history[-1]["close"]:
            entry = bar["open"]
            stop = anchor["end_price"] * .998
            risk = entry - stop
            if entry * .002 <= risk <= entry * .04:
                position = dict(entry=entry, stop=stop, target=entry + 2 * risk, risk=risk, index=i)
    equity = peak = drawdown = 0.0
    for value in trades:
        equity += value
        peak = max(peak, equity)
        drawdown = max(drawdown, peak - equity)
    return dict(trades=len(trades), net_r=round(equity, 3), drawdown_r=round(drawdown, 3),
                win_rate=round(100 * sum(t > 0 for t in trades) / len(trades), 1) if trades else 0)


def research(candles, tolerance=.08, auto_apply=False):
    split = int(len(candles) * .7)
    studies = [dict(tolerance=t, train=simulate(candles, t, 80, split),
                    validation=simulate(candles, t, split, len(candles))) for t in [.05, .08, .12]]
    baseline = studies[1]
    # Select on training only. The untouched holdout is used only as a veto.
    candidate = max(studies, key=lambda row: row["train"]["net_r"])
    eligible = (candidate["tolerance"] != .08 and candidate["train"]["trades"] >= 5
                and candidate["validation"]["trades"] >= 3 and candidate["validation"]["net_r"] > 0
                and candidate["validation"]["net_r"] > baseline["validation"]["net_r"]
                and candidate["validation"]["drawdown_r"] <= baseline["validation"]["drawdown_r"])
    active_tolerance = candidate["tolerance"] if eligible and auto_apply else tolerance
    return dict(studies=studies, as_of=candles[-1]["time"], candidate=candidate["tolerance"] if eligible else None,
                active_tolerance=active_tolerance,
                decision="review_paper_candidate" if eligible else "keep_baseline",
                split=split, model="directional_fib_anchor_model v179",
                snapshot=build_directional_fib_snapshot(candles, side="long", tolerance_pct=active_tolerance),
                methodology="Long-only 0.618 reclaim; next-bar open; 2R target; 24-bar timeout; 12 bps per side; 70/30 chronological split. Training selects, holdout vetoes. No live promotion.")


def main():
    payload = json.loads(sys.stdin.read(250_001))
    candles = payload["candles"]
    if not 120 <= len(candles) <= 500:
        raise ValueError("Expected 120–500 candles")
    previous = 0
    for c in candles:
        if not all(isinstance(c[k], (int, float)) and math.isfinite(c[k]) and c[k] > 0 for k in ["time", "open", "high", "low", "close"]):
            raise ValueError("Invalid candle")
        if c["time"] <= previous or c["low"] > min(c["open"], c["close"]) or c["high"] < max(c["open"], c["close"]):
            raise ValueError("Unordered or inconsistent candles")
        previous = c["time"]
    tolerance = payload.get("tolerance", .08)
    if tolerance not in [.05, .08, .12]:
        raise ValueError("Unsupported tolerance")
    auto_apply = payload.get("auto_apply", False)
    if not isinstance(auto_apply, bool):
        raise ValueError("Invalid auto_apply flag")
    print(json.dumps(research(candles, tolerance, auto_apply), allow_nan=False))


if __name__ == "__main__":
    main()
