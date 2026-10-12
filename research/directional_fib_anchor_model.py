
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any
import math


# phase179_directional_fib_anchor_model
# User rule:
#   long  = draw fib high -> low
#   short = draw fib low  -> high
CHECKED_FIB_RATIOS = [
    0.618,
    -1.618,
    -3.618,
    3.618,
    5.618,
    6.618,
    12.618,
    15.618,
    20.618,
    45.618,
]


@dataclass
class NormalizedCandle:
    index: int
    time: int | None
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


@dataclass
class Pivot:
    index: int
    time: int | None
    kind: str
    price: float


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        f = float(value)
        if not math.isfinite(f):
            return None
        return f
    except Exception:
        return None


def _safe_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(float(value))
    except Exception:
        return None


def _normalize_candles(candles: list[Any]) -> list[NormalizedCandle]:
    out: list[NormalizedCandle] = []

    for i, item in enumerate(candles or []):
        if isinstance(item, dict):
            o = _safe_float(item.get("open") or item.get("o"))
            h = _safe_float(item.get("high") or item.get("h"))
            l = _safe_float(item.get("low") or item.get("l"))
            c = _safe_float(item.get("close") or item.get("c"))
            v = _safe_float(item.get("volume") or item.get("v")) or 0.0
            t = _safe_int(item.get("time") or item.get("timestamp") or item.get("t"))
            if t and t > 20_000_000_000:
                t = int(t / 1000)
        elif isinstance(item, (list, tuple)) and len(item) >= 5:
            t_raw = _safe_int(item[0])
            t = int(t_raw / 1000) if t_raw and t_raw > 20_000_000_000 else t_raw
            o = _safe_float(item[1])
            h = _safe_float(item[2])
            l = _safe_float(item[3])
            c = _safe_float(item[4])
            v = _safe_float(item[5]) if len(item) > 5 else 0.0
            v = v or 0.0
        else:
            continue

        if o is None or h is None or l is None or c is None:
            continue

        out.append(
            NormalizedCandle(
                index=len(out),
                time=t,
                open=o,
                high=h,
                low=l,
                close=c,
                volume=v,
            )
        )

    return out


def _find_pivots(candles: list[NormalizedCandle], radius: int = 3) -> list[Pivot]:
    pivots: list[Pivot] = []

    if len(candles) < radius * 2 + 5:
        return pivots

    for i in range(radius, len(candles) - radius):
        c = candles[i]
        window = candles[i - radius : i + radius + 1]

        is_high = c.high == max(x.high for x in window)
        is_low = c.low == min(x.low for x in window)

        # Avoid marking same tiny candle as both unless it is truly dominant.
        if is_high:
            left_high = max(x.high for x in candles[i - radius : i])
            right_high = max(x.high for x in candles[i + 1 : i + radius + 1])
            if c.high > left_high and c.high >= right_high:
                pivots.append(Pivot(index=c.index, time=c.time, kind="high", price=c.high))

        if is_low:
            left_low = min(x.low for x in candles[i - radius : i])
            right_low = min(x.low for x in candles[i + 1 : i + radius + 1])
            if c.low < left_low and c.low <= right_low:
                pivots.append(Pivot(index=c.index, time=c.time, kind="low", price=c.low))

    pivots.sort(key=lambda p: p.index)
    return pivots


def _fib_price(start_price: float, end_price: float, ratio: float) -> float:
    # TradingView-style directional line:
    # high -> low long:  low + (high - low) * ratio
    # low -> high short: high + (low - high) * ratio
    return end_price + (start_price - end_price) * ratio


def _pct(a: float, b: float) -> float:
    if b == 0:
        return 0.0
    return abs(a - b) / abs(b) * 100.0


def _confirmation_for_primary(
    *,
    candles: list[NormalizedCandle],
    side: str,
    end_index: int,
    primary_price: float,
    tolerance_pct: float,
) -> dict[str, Any]:
    post = candles[end_index + 1 :]
    touches: list[dict[str, Any]] = []
    closes_ok = 0

    for c in post:
        tol = primary_price * tolerance_pct / 100.0
        touched = c.low - tol <= primary_price <= c.high + tol
        if not touched:
            continue

        ok_close = c.close >= primary_price if side == "long" else c.close <= primary_price
        if ok_close:
            closes_ok += 1

        touches.append(
            {
                "index": c.index,
                "time": c.time,
                "price": primary_price,
                "close": c.close,
                "ok_close": ok_close,
            }
        )

        if len(touches) >= 8:
            break

    return {
        "primary_price": primary_price,
        "touch_count": len(touches),
        "confirmed_touch_count": closes_ok,
        "confirmed": closes_ok > 0,
        "touches": touches,
    }


def _build_anchor_candidates(
    *,
    candles: list[NormalizedCandle],
    pivots: list[Pivot],
    side: str,
    min_move_pct: float,
    max_leg_bars: int,
    tolerance_pct: float,
) -> list[dict[str, Any]]:
    anchors: list[dict[str, Any]] = []

    if side == "long":
        start_kind = "high"
        end_kind = "low"
        direction = "high_to_low"
    else:
        start_kind = "low"
        end_kind = "high"
        direction = "low_to_high"

    starts = [p for p in pivots if p.kind == start_kind]
    ends = [p for p in pivots if p.kind == end_kind]

    for start in starts:
        later_ends = [
            p for p in ends
            if p.index > start.index and (p.index - start.index) <= max_leg_bars
        ]
        if not later_ends:
            continue

        # Use the first meaningful pullback/bounce after the start pivot.
        chosen_end = None
        for end in later_ends:
            move = _pct(start.price, end.price)
            if move >= min_move_pct:
                chosen_end = end
                break

        if chosen_end is None:
            continue

        move_pct = _pct(start.price, chosen_end.price)
        levels = [
            {
                "ratio": ratio,
                "name": f"{ratio:g}",
                "price": _fib_price(start.price, chosen_end.price, ratio),
            }
            for ratio in CHECKED_FIB_RATIOS
        ]

        primary = next(x for x in levels if abs(x["ratio"] - 0.618) < 1e-12)
        confirmation = _confirmation_for_primary(
            candles=candles,
            side=side,
            end_index=chosen_end.index,
            primary_price=primary["price"],
            tolerance_pct=tolerance_pct,
        )

        recency_score = chosen_end.index / max(1, len(candles) - 1)
        confirmation_bonus = 1.0 if confirmation["confirmed"] else 0.0
        score = move_pct + confirmation_bonus * 2.0 + recency_score

        anchors.append(
            {
                "side": side,
                "direction": direction,
                "start_kind": start.kind,
                "end_kind": chosen_end.kind,
                "start_index": start.index,
                "end_index": chosen_end.index,
                "start_time": start.time,
                "end_time": chosen_end.time,
                "start_price": start.price,
                "end_price": chosen_end.price,
                "move_pct": round(move_pct, 6),
                "levels": levels,
                "primary_0618": primary,
                "confirmation": confirmation,
                "score": round(score, 6),
            }
        )

    # Prefer recent confirmed anchors. Keep chronological labels after selecting.
    anchors.sort(
        key=lambda a: (
            bool(a["confirmation"]["confirmed"]),
            a["end_index"],
            a["score"],
        ),
        reverse=True,
    )

    selected = anchors[:3]
    selected.sort(key=lambda a: a["end_index"])

    for idx, anchor in enumerate(selected, start=1):
        anchor["anchor_label"] = f"anchor {idx}"
        anchor["level_label"] = f"{idx}{'st' if idx == 1 else 'nd' if idx == 2 else 'rd'} level"

    return selected


def build_directional_fib_snapshot(
    candles: list[Any],
    *,
    side: str,
    min_move_pct: float = 0.18,
    max_leg_bars: int = 80,
    pivot_radius: int = 3,
    tolerance_pct: float = 0.08,
) -> dict[str, Any]:
    side = str(side or "").lower().strip()
    if side not in {"long", "short"}:
        return {
            "ok": False,
            "reason": "invalid_side",
            "side": side,
            "anchors": [],
            "display_fib_levels": [],
            "display_levels": [],
        }

    normalized = _normalize_candles(candles)
    if len(normalized) < 40:
        return {
            "ok": False,
            "reason": "not_enough_candles",
            "side": side,
            "candle_count": len(normalized),
            "anchors": [],
            "display_fib_levels": [],
            "display_levels": [],
        }

    pivots = _find_pivots(normalized, radius=pivot_radius)

    anchors = _build_anchor_candidates(
        candles=normalized,
        pivots=pivots,
        side=side,
        min_move_pct=min_move_pct,
        max_leg_bars=max_leg_bars,
        tolerance_pct=tolerance_pct,
    )

    display_fib_levels: list[dict[str, Any]] = []
    display_levels: list[dict[str, Any]] = []

    for anchor in anchors:
        primary = anchor["primary_0618"]
        display_levels.append(
            {
                "label": f'{anchor["anchor_label"]} 0.618',
                "type": "directional_fib_primary",
                "price": primary["price"],
                "anchor_label": anchor["anchor_label"],
                "direction": anchor["direction"],
                "confirmed": anchor["confirmation"]["confirmed"],
                "touch_count": anchor["confirmation"]["touch_count"],
            }
        )

        for level in anchor["levels"]:
            # Show only the useful visual ratios by default.
            # Full checked set remains in anchor["levels"] for debugging/API.
            if level["ratio"] in {0.618, -1.618, 3.618}:
                display_fib_levels.append(
                    {
                        "name": level["name"],
                        "ratio": level["ratio"],
                        "price": level["price"],
                        "anchor_label": anchor["anchor_label"],
                        "direction": anchor["direction"],
                        "start_time": anchor["start_time"],
                        "end_time": anchor["end_time"],
                        "start_price": anchor["start_price"],
                        "end_price": anchor["end_price"],
                    }
                )

    return {
        "ok": bool(anchors),
        "reason": "directional_anchors_found" if anchors else "no_valid_directional_anchor",
        "version": 179,
        "mode": "directional_user_fib_anchor_model",
        "side": side,
        "direction": "high_to_low" if side == "long" else "low_to_high",
        "rule": "long_high_to_low__short_low_to_high",
        "checked_fib_ratios": CHECKED_FIB_RATIOS,
        "candle_count": len(normalized),
        "pivot_count": len(pivots),
        "anchors": anchors,
        "display_fib_levels": display_fib_levels,
        "display_levels": display_levels,
    }
