> Current workflow: [Demo cockpit guide](DEMO-COCKPIT.md). Paper automation and free-mode app call caps described in older sections below are retired. Existing records are preserved. Charts now support exchange WebSockets; private demo account values still use polling.

# Remote free AI, research strategies and Obsidian memory

## Decision from the four suggested projects

Reviewed 2026-10-13:

| Project | Finding | Use here |
|---|---|---|
| [FreeRideV3](https://github.com/Shaivpidadi/FreeRideV3) | An actual remote-provider routing engine, normally run as a local gateway; uses your provider keys. | Best architectural reference for free model selection and cooldowns. This app implements a small direct remote adapter; FreeRide itself is not installed. |
| [Free-LLM](https://github.com/nejib1/Free-LLM) | Directory of providers and integration examples. | Provider discovery; directory claims are not billing guarantees. |
| [9router](https://github.com/decolua/9router) | Broad gateway supporting subscription and cheap/paid fallback as well as free models. | Not the default because the requested budget is zero and no extra gateway service is wanted. |
| [no-cost-ai](https://github.com/zebbern/no-cost-ai) | Directory spanning APIs, websites and limited trials. | Reference only; not a routing engine. |

Reviewed commits respectively: `3811c8e29ef41d96eea2fe37d0219c1790e530b1`, `b444aa04190ad03371f110efd80c2f2c379d1423`, `ce4460ef79382bfddb4aa5fc0ff9f3cb0d5f95a8`, `a1e44647ac7cc17f9ae46963640d401503e3210c`.

## Default remote inference

```dotenv
TEAM_AI_PROVIDER=openrouter_free
TEAM_REMOTE_MODEL=auto-free
TEAM_DAILY_CALL_LIMIT=9
```

Create an account/key at https://openrouter.ai/keys and enter it privately in
Connections → Free-tier AI provider API key. It is stored as `TEAM_REMOTE_KEY`.
No OpenAI API key, local model, GPU or second router service is needed.
Do not fund/enable paid usage merely to run this configuration. Verify the
provider's current free-tier eligibility, terms and limits in your own account.

The app fetches OpenRouter's model catalog and selects only text models with
`:free` IDs, at least 16K context, and explicitly zero advertised prices for
all reported price fields. Missing, unknown, null or positive prices are
rejected. Available models are sorted by context size, then ID; this is a
practical routing heuristic, not a measured model-quality leaderboard.

A rate-limited model is cooled for a minute, and at most one other catalog-
verified free model is tried. If none remains, the run stops. It never rotates
accounts or bypasses quotas, never falls back to a paid model or OpenAI, and
never starts a local model. Three successful calls normally form a briefing.
The nine-attempt daily default includes rejected attempts; unknown outcomes
also consume a call slot. Cache hits cost no inference call.

Free prices are provider assertions, not an enforceable external billing
contract. If a response reports positive cost, that model is blocked persistently
and the reported cost is recorded. This cannot undo an already reported charge.
Keep provider-side paid usage disabled and check provider terms. Free quota,
availability and model quality can change. Real provider calls need your own
private key and permitted network access; tests use controlled responses.

For a different documented OpenAI-compatible remote service, set
`TEAM_AI_PROVIDER=free_remote`, its HTTPS `TEAM_REMOTE_BASE_URL` (ending before
`/chat/completions`), `TEAM_REMOTE_MODEL`, an exact comma-separated
`TEAM_REMOTE_FREE_MODELS` allowlist and `TEAM_REMOTE_FREE_CONFIRMED=1` only after
verifying the free tier. Add `TEAM_REMOTE_KEY` privately. Anonymous access must
be explicitly enabled with `TEAM_REMOTE_ANONYMOUS=1` if the service supports it.
Generic endpoints cannot have their free pricing independently verified by this
app. Paid mode requires the explicit setting `TEAM_AI_PROVIDER=openai`; it is
never an automatic fallback.

ECC role definitions remain available for Codex development. ECC is an agent
workflow framework and does not make a paid Codex session free. Dashboard
research and Codex coding sessions are separate. FreeRide documents a separate
Responses-compatible gateway for coding tools; setting a chat-completions URL
alone does not establish compatibility with your Codex version.

## Strategy research

The Strategy explorer compares six long-only families:

- Canonical Fibonacci 0.618 reclaim, three bounded tolerances.
- Fixed-window volume-profile value-area-high breakout and retest.
- Volume-profile point-of-control reclaim.
- Donchian breakout, three lookbacks.
- EMA20/50 trend pullback.
- Rolling/simple RSI14 mean reversion with a flat-trend filter.

These are hypotheses, not proven recommendations. The first 60% selects both
family and parameter. The next 20% and final 20% only veto that selection;
final holdout results never choose a winner. Displaying many families still
creates multiple-comparison risk, so a future untouched sample is required.
Forward slices use the fixed training-selected parameter as a robustness
diagnostic; they are not independent nested walk-forward model selection.

Entries occur at the next bar open. The harness uses a 2 ATR stop, 2R target,
24-bar timeout, adverse gap-through-stop fills and stop-first ambiguous bars.
Baseline costs are 12 bps per side; stress costs double to 24 bps per side.
Metrics are R units, not euro profit, an account-equity forecast or a monthly
return estimate. Funding, borrowing, order-book impact and queue position are
not modeled. Existing paper/demo execution semantics differ from these tests.

A forward paper-trial candidate needs at least 10 training trades and five
trades in EACH holdout, positive validation/final/stressed final results, and
final drawdown <=5R. New families are not deployed automatically. Existing
Fibonacci bots retain their prior deterministic execution gates.

Only 300–500 candles are compared at a time. The UI shows their actual time
coverage: 500 five-minute bars are not a month of evidence. A one-day coding
session cannot establish a first-month €1,000 outcome. Use chronological
historical validation followed by forward paper/demo records before assessing
an actual edge or sizing any real-money strategy. Real-money execution remains
unimplemented.

## Fixed-range volume-profile method

The displayed range is selectable by start/end dates, defaulting to the last
120 closed bars. Each candle's volume is spread uniformly across its high-low
range into 24 price bins. POC is the peak-volume bin. The 70% value area grows
from POC toward the more heavily traded adjacent bin. High-volume zones group
bins carrying at least 70% of peak-bin volume. Historical retest strategies
freeze the profile before their breakout/retest bars to avoid lookahead.

This is an OHLCV approximation. Candle totals cannot recover the actual
intra-candle volume-at-price, aggressor side or order book. True trade-level
fixed-range profiles need trade data or lower-timeframe reconstruction. High
volume may indicate acceptance/consolidation; it does not guarantee resistance,
support, a retest, or profits. The zones require independent tests.

Reference reviewed: [py-market-profile](https://github.com/bfolkens/py-market-profile)
commit `a40ad39e3e80ac4f38f13c5de3ad08d86446f1be`. Its OHLCV implementation bins
volume by rounded close; this project's own code instead uses range-overlap
allocation. No third-party profile implementation is copied or installed.
TradingView's public volume-profile page and the SSRN backtest-overfitting
paper were inaccessible from this environment and are not claimed as reviewed.

## Obsidian learning loop

Bounded research now includes the comparison when at least 300 candles exist.
Paper learning and demo bot research refresh it on new bars without AI calls.
The app saves immutable, source-labeled strategy reports and a rolling
`Learning Memory.md` under `Research/<workspace-id>/`. Different workspaces
stay isolated; repeated identical evidence is deduplicated.

The council reads that memory on its next review. You may add a private
`Agent Memory.md` in the same workspace folder for curated notes. Only these
specific files are read, path escapes are rejected, context is bounded, and
all note content is treated as untrusted data. Changes invalidate briefing
caches. The council also receives actual prior research outcomes and paper/
demo journal summaries. It cannot execute instructions from notes.

This is retrieval-based learning plus bounded strategy evaluation. It does
not retrain an LLM's weights, fit a predictive price model, or autonomously
rewrite/deploy trading code. Reliable weight training needs labeled outcomes,
chronological evaluation and a separate training pipeline.
