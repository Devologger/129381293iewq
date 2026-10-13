"""Chronological strategy comparisons and OHLCV-derived fixed-range volume profile.
No model weights are trained, no network calls, no orders. Profiles are estimates.
"""
from __future__ import annotations
import json
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from research.directional_fib_anchor_model import build_directional_fib_snapshot


def volume_profile(candles, bins=24, value_area=.70):
    if not candles or not 8 <= bins <= 64:
        raise ValueError("Use a nonempty range and 8–64 price bins")
    low = min(c["low"] for c in candles)
    high = max(c["high"] for c in candles)
    width = max(high-low, max(low, 1)*1e-8)/bins
    volumes = [0.0]*bins
    for c in candles:
        volume = c.get("volume", 0)
        if not math.isfinite(volume) or volume < 0:
            raise ValueError("Invalid candle volume")
        if c["high"] == c["low"]:
            volumes[min(bins-1, max(0, int((c["close"]-low)/width)))] += volume
        else:
            for i in range(bins):
                overlap = max(0, min(c["high"], low+(i+1)*width)-max(c["low"], low+i*width))
                volumes[i] += volume*overlap/(c["high"]-c["low"])
    total = sum(volumes)
    if total <= 0:
        raise ValueError("Volume profile needs positive volume")
    poc = max(range(bins), key=lambda i: volumes[i])
    left = right = poc
    covered = volumes[poc]
    while covered < total*value_area and (left > 0 or right < bins-1):
        lower = volumes[left-1] if left > 0 else -1
        upper = volumes[right+1] if right < bins-1 else -1
        if upper >= lower:
            right += 1; covered += volumes[right]
        else:
            left -= 1; covered += volumes[left]
    nodes = []
    i = 0
    while i < bins:
        if volumes[i] < volumes[poc]*.7:
            i += 1; continue
        start = i
        while i+1 < bins and volumes[i+1] >= volumes[poc]*.7:
            i += 1
        nodes.append(dict(low=low+start*width, high=low+(i+1)*width, volume=sum(volumes[start:i+1])))
        i += 1
    return dict(start_time=candles[0]["time"], end_time=candles[-1]["time"], bars=len(candles),
                poc=low+(poc+.5)*width, val=low+left*width, vah=low+(right+1)*width,
                total_volume=total, value_area_fraction=covered/total,
                bins=[dict(low=low+i*width, high=low+(i+1)*width, volume=v) for i,v in enumerate(volumes)],
                high_volume_nodes=nodes,
                methodology="OHLCV approximation: candle volume uniformly distributed across its high-low range. Not tick-level volume-at-price; no bid/ask or order-book evidence.")


def distribution_context(profile, candles):
    """Confirm a frozen distribution with later closed bars; this is context, not an order."""
    after = [c for c in candles if c["time"] > profile["end_time"]]
    observations = after[-6:]
    tolerance = max((profile["vah"]-profile["val"])*.05, profile["poc"]*.0015)
    close = candles[-1]["close"]
    location = "above_value_area" if close > profile["vah"] else "below_value_area" if close < profile["val"] else "inside_value_area"
    bias = "neutral"
    confirmation = "waiting_for_two_closed_bars"
    retest = False
    if len(observations) >= 2:
        last = observations[-2:]
        if all(c["close"] > profile["poc"] + tolerance for c in last):
            bias, confirmation = "bullish", "accepted_above_poc"
        elif all(c["close"] < profile["poc"] - tolerance for c in last):
            bias, confirmation = "bearish", "accepted_below_poc"
        else:
            confirmation = "balanced_or_unconfirmed"
        for i, bar in enumerate(observations[:-1]):
            touched = bar["low"] <= profile["poc"]+tolerance and bar["high"] >= profile["poc"]-tolerance
            follow = observations[i+1]["close"]
            if bias == "bullish" and touched and bar["close"] > profile["poc"]+tolerance and follow > profile["poc"]+tolerance:
                retest, confirmation = True, "poc_support_retest_confirmed"
            if bias == "bearish" and touched and bar["close"] < profile["poc"]-tolerance and follow < profile["poc"]-tolerance:
                retest, confirmation = True, "poc_resistance_retest_confirmed"
    return dict(bias=bias, confirmation=confirmation, confirmed_retest=retest, location=location,
                poc=profile["poc"], tolerance=round(tolerance, 8), last_close=close,
                profile_end=profile["end_time"], as_of=candles[-1]["time"], confirmation_bars=len(after),
                methodology="Frozen POC distribution: two later closed bars must accept above/below its tolerance band. A POC retest requires a touching bar and a following close on the same side. Neutral when evidence is missing or mixed. Context only, not a buy/sell instruction.")


def atr(history, length=14):
    rows=history[-length-1:]
    return sum(max(c["high"]-c["low"], abs(c["high"]-rows[i-1]["close"]), abs(c["low"]-rows[i-1]["close"])) for i,c in enumerate(rows[1:],1))/max(1,len(rows)-1)


def ema(values, period):
    result=values[0]; alpha=2/(period+1)
    for value in values[1:]: result += alpha*(value-result)
    return result


def signal(history, family, parameter):
    """History ends at signal close. Every feature uses only that history."""
    if len(history)<parameter+3: return False
    close=history[-1]["close"]; previous=history[-2]["close"]
    if family in ("frvp_vah_retest", "frvp_poc_reclaim"):
        # Freeze the consolidation profile BEFORE breakout/retest candles.
        profile=volume_profile(history[-parameter-2:-2] if family=="frvp_vah_retest" else history[-parameter-3:-3])
        tolerance=atr(history)*.25
        if family=="frvp_vah_retest":
            return previous>profile["vah"] and history[-1]["low"]<=profile["vah"]+tolerance and close>profile["vah"]
        return (history[-3]["close"]<=profile["poc"] and previous>profile["poc"]+tolerance
                and history[-1]["low"]<=profile["poc"]+tolerance and close>profile["poc"]+tolerance)
    if family=="donchian_breakout":
        return close>max(c["high"] for c in history[-parameter-1:-1])
    if family=="ema_trend_pullback":
        values=[c["close"] for c in history]
        fast=ema(values,20); slow=ema(values,50)
        return fast>slow and previous<=fast and close>fast and history[-1]["low"]<=fast+atr(history)*.25
    if family=="rsi_mean_reversion":
        changes=[history[i]["close"]-history[i-1]["close"] for i in range(len(history)-14,len(history))]
        gain=sum(max(0,x) for x in changes); loss=sum(max(0,-x) for x in changes)
        rsi=100 if loss==0 else 100-100/(1+gain/loss)
        return rsi<parameter and close>previous and abs(ema([c["close"] for c in history],20)/ema([c["close"] for c in history],50)-1)<.01
    if family=="fib_reclaim":
        snapshot=build_directional_fib_snapshot(history[-100:],side="long",tolerance_pct=parameter)
        anchors=snapshot.get("anchors",[])
        if not anchors: return False
        level=max(anchors,key=lambda a:a["end_index"])["primary_0618"]["price"]
        return previous<level<=close
    raise ValueError("Unknown strategy")


def simulate(candles, family, parameter, start, end, cost=.0012):
    outcomes=[]; position=None
    for i in range(max(160,start),end):
        bar=candles[i]
        if position:
            price=position["stop"] if bar["low"]<=position["stop"] else position["target"] if bar["high"]>=position["target"] else None
            if price is not None or i-position["index"]>=24 or i==end-1:
                price=price if price is not None else bar["close"]
                # Gap-through stop fills at the worse opening price, not the stop.
                if bar["open"]<position["stop"]: price=bar["open"]
                outcomes.append((price-position["entry"]-(price+position["entry"])*cost)/position["risk"])
                position=None
            continue
        if i==end-1: continue
        history=candles[max(0,i-180):i]
        if signal(history,family,parameter):
            entry=bar["open"]; risk=atr(history)*2
            if entry*.003<=risk<=entry*.05:
                position=dict(entry=entry,risk=risk,stop=entry-risk,target=entry+2*risk,index=i)
    equity=peak=drawdown=0
    for value in outcomes:
        equity+=value; peak=max(peak,equity); drawdown=max(drawdown,peak-equity)
    gains=sum(max(0,x) for x in outcomes); losses=-sum(min(0,x) for x in outcomes)
    return dict(trades=len(outcomes),net_r=round(equity,4),drawdown_r=round(drawdown,4),
                win_rate=round(100*sum(x>0 for x in outcomes)/len(outcomes),2) if outcomes else 0,
                profit_factor=round(gains/losses,3) if losses else None)


FAMILIES={"fib_reclaim":[.05,.08,.12],"frvp_vah_retest":[60,100,140],"frvp_poc_reclaim":[60,100,140],
          "donchian_breakout":[20,40,60],"ema_trend_pullback":[50],"rsi_mean_reversion":[25,30,35]}

def research(candles, range_start=None, range_end=None):
    n=len(candles); training=int(n*.6); validation=int(n*.8)
    selected=[]
    for family,parameters in FAMILIES.items():
        trials=[(p,simulate(candles,family,p,160,training)) for p in parameters]
        parameter,train=max(trials,key=lambda row:row[1]["net_r"])
        selected.append(dict(strategy=family,parameter=parameter,train=train))
    # Select BOTH family and parameter solely on training; holdouts only veto.
    candidate=max(selected,key=lambda row:row["train"]["net_r"])
    for row in selected:
        family=row["strategy"]; p=row["parameter"]
        row["validation"]=simulate(candles,family,p,training,validation)
        row["test"]=simulate(candles,family,p,validation,n)
        row["stress_test"]=simulate(candles,family,p,validation,n,.0024)
        row["walk_forward"]=[simulate(candles,family,p,int(n*a),int(n*b)) for a,b in [(.4,.6),(.6,.8),(.8,1)]]
    eligible=(candidate["train"]["trades"]>=10 and candidate["validation"]["trades"]>=5 and candidate["test"]["trades"]>=5
              and candidate["validation"]["net_r"]>0 and candidate["test"]["net_r"]>0 and candidate["stress_test"]["net_r"]>0
              and candidate["test"]["drawdown_r"]<=5)
    chosen=[c for c in candles if (range_start is None or c["time"]>=range_start) and (range_end is None or c["time"]<=range_end)]
    if not chosen: raise ValueError("Fixed range contains no candles")
    frozen = volume_profile(chosen if range_start is not None or range_end is not None else candles[-122:-2])
    return dict(as_of=candles[-1]["time"],bars=n,coverage_days=round((candles[-1]["time"]-candles[0]["time"])/86400,2),
                split=dict(training_end=training,validation_end=validation,test_end=n),studies=selected,
                training_selected=dict(strategy=candidate["strategy"],parameter=candidate["parameter"]),
                candidate=candidate["strategy"] if eligible else None,
                decision="forward_paper_trial_only" if eligible else "insufficient_edge_evidence",
                profile=frozen, profile_context=distribution_context(frozen, candles),
                methodology="Long-only research: 60/20/20 chronological splits; training-only family/parameter selection; next-bar open entries; 2 ATR stop, 2R target, 24-bar timeout; adverse gaps and stop-first ambiguity; 12 bps/side, stress 24 bps/side. No new strategy is deployed automatically. Forward slices are robustness diagnostics with a training-selected fixed parameter; they are not independent nested walk-forward model selection.",
                limitations=["OHLCV profile is an estimated distribution, not true trade-level fixed-range volume.","Displayed tests of many families can cause selection bias; preserve a future untouched data set.","No funding, borrowing, queue position, latency or market-impact model; no monthly-profit forecast.","Obsidian memory updates agent context; it does not fine-tune neural model weights."])


def main():
    payload=json.loads(sys.stdin.read(250001)); candles=payload["candles"]
    if not 300<=len(candles)<=500: raise ValueError("Expected 300–500 candles")
    previous=0
    for c in candles:
        if not all(isinstance(c[k],(int,float)) and math.isfinite(c[k]) and c[k]>0 for k in ["time","open","high","low","close"]): raise ValueError("Invalid candle")
        if c["time"]<=previous or c["low"]>min(c["open"],c["close"]) or c["high"]<max(c["open"],c["close"]) or c["high"]<c["low"]: raise ValueError("Inconsistent candle")
        if not isinstance(c.get("volume"),(int,float)) or not math.isfinite(c["volume"]) or c["volume"]<0: raise ValueError("Invalid volume")
        previous=c["time"]
    for key in ["range_start","range_end"]:
        if payload.get(key) is not None and (not isinstance(payload[key],(int,float)) or not math.isfinite(payload[key])): raise ValueError("Invalid range")
    print(json.dumps(research(candles,payload.get("range_start"),payload.get("range_end")),allow_nan=False))

if __name__=="__main__":main()
