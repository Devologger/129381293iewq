> Current workflow: [Demo cockpit guide](DEMO-COCKPIT.md). Paper automation and free-mode app call caps described in older sections below are retired. Existing records are preserved. Charts now support exchange WebSockets; private demo account values still use polling.

# Live display and learning from trade outcomes

## What the council does

A COMPLETE council briefing means the providers returned three accounted answers and a note was saved. It does not mean the strategy was trained, an experiment ran, or an order was approved. The pasted briefing still made mistakes: 12 hours of 15-minute candles is **48 bars**, not 192. A claimed universal 30-trade threshold is not a statistical proof, and costs cannot be converted to account percentage without notional/denominator information. Review model statements against recorded facts.

The AI remains an advisory research team. It reads research, vault context and recorded outcomes, proposes bounded experiments and reviews risk. There is no LLM weight fine-tuning, no automatic execution of free-text strategy proposals and no automatic promotion of a new strategy family.

## The outcome feedback loop

Every new paper closure now records its entry/exit, initial stop/target, position ID, modeled net P&L, net R against initial price risk, market/timeframe, and known manual/automatic provenance. Automatic entries also record the active tolerance and research candle timestamp. These records are committed with the workspace update in a persistent `trade_outcomes` ledger, rather than disappearing with the latest 200 dashboard fills.

A linked `Trade Outcomes.md` note shows the latest 50 outcomes in the account's private vault. The database remains authoritative if optional vault storage is unavailable. The council receives a bounded outcome summary, and a fresh outcome changes its evidence/cache key. Old fills can be imported with their original fields; missing provenance, entry, timeframe or R is **not invented**. They cannot silently count as automatic strategy failures.

Recorded failures now affect paper decisions conservatively:

- **Three consecutive losing automatic exchange-paper positions**, for the same exchange/market/symbol/timeframe, pause new automatic entries for that context. Scan/research and existing position monitoring continue. Manual/sample/legacy outcomes do not trigger this guard. A manual exit of a position that was opened automatically still retains that automatic-position provenance.
- To resume, inspect the outcomes and fresh evidence in **Strategy lab**, acknowledge the review, and explicitly enable paper automation again. Acknowledging does not enable execution. It does not erase historical losses; a further loss can re-trigger the pause.
- **Bounded paper learning** still considers only the existing tolerance values (0.05, 0.08, 0.12) under its training/holdout gates. Before a tolerance promotion, a new guard checks up to the latest 20 known automatic exchange-paper outcomes at that exact tolerance and context. With at least five outcomes and nonpositive aggregate net R, the promotion is vetoed. This is a conservative heuristic, not a significance test. The worker recomputes the baseline snapshot so the displayed levels still match the retained tolerance.

No risk is increased to recover losses. An absence of losses, a successful candidate or passing a guard is not evidence of profitability. Binance demo realized trade income is not imported, so this outcome-learning loop currently covers the paper ledger, not exchange-demo or real-money realized returns.

## How to use it

1. Choose an exchange and start scanning the watchlist. Wait for real closed-bar research to complete. Scanning alone places no orders.
2. Review the strategy report under **More tools → Strategy lab**.
3. If you want to collect forward paper outcomes, enable the paper engine and explicitly enable paper automation for the chosen exchange-data context. It waits for its actual closed-bar signal; it does not force trades to manufacture training data.
4. Enable **bounded paper learning** only if you want the existing tolerance-selection procedure to run on subsequent closed bars. The outcome veto and execution risk gates remain active.
5. Closed outcomes appear in **Outcome memory** on the dashboard and in the vault. Ask the council to compare actual failures against the proposed experiment. Preserve a fresh forward period; do not repeatedly tune on already inspected holdouts.

This is a data/validation/feedback loop, not a promise that repeated losing trades eventually produce profit. The baseline long-only paper execution rule and percentage stops/targets remain separate from the strategy lab's ATR research exits.

## What is live

Previously exchange charts refreshed closed-bar history every 30 seconds; sample charts were static. Now every watchlist chart can also display the current forming candle from an authenticated, display-only `/api/terminal/live` endpoint. It uses fixed public Binance/Bybit/Kraken REST destinations, validates candle data and shares a short public-data cache. No API key or AI tokens are required for these public quotes.

While the browser tab is visible:

| Data | Refresh behavior |
| --- | --- |
| Watchlist forming candles and display prices | Best-effort 3-second REST snapshots |
| Indicative open P&L/equity | Fresh matching watchlist snapshots; other positions use closed-bar or entry marks |
| Workspace, paper orders, positions and outcome summary | 5-second server-ledger polling |
| Research history / scanner | New closed bars, checked by the 30-second server worker |
| Binance demo positions/orders | Separate authenticated 15-second account refresh |

These are REST snapshots, **not an exchange tick-by-tick WebSocket stream**. The badge says **LIVE · 3s snapshots** only with a current successful display snapshot; failures show an unavailable state and old data is not labelled live. Polling pauses for hidden tabs and catches up on visibility. Feed errors never switch exchange mode into synthetic sample mode. Static samples remain labelled **STATIC SAMPLE**.

Forming candles are for display only. Research, candidate selection and paper execution continue to use validated **closed candles** from the separate existing market feed. A moving quote is not an order fill. Indicative P&L is not guaranteed executable value. No browser-side prices are submitted as trusted execution prices.

Charts keep their instance across data refreshes, preserving pan/zoom. Interface motion includes heartbeat/status pulses, quote-change highlights, a scanner glow, button sheen and restrained activity transitions. Motion stops under the browser/OS reduced-motion preference. Animated decoration never generates prices, fake fills or simulated performance.

## Update

From the existing project folder, stop Penguin and run:

```powershell
git pull origin main
npm.cmd run build
npm.cmd run launch
```

Use exchange data or **Start scanning** to see live display snapshots. Sample mode intentionally stays static. Keep the server running for background scanning/protection. Existing credentials, account sessions, vaults and ledgers remain in their current private storage locations.

## Cloud network validation

A real read-only Kraken BTC spot snapshot passed in the coding environment using its existing HTTPS proxy with Node 24's `NODE_USE_ENV_PROXY=1`. Binance returned HTTP451 and Bybit HTTP403 from that environment; those are observed access restrictions, not missing AI keys, and were not bypassed. Windows/account-region access can differ. Select another supported exchange explicitly if yours is unavailable; the app never substitutes another venue silently.

If deploying Node behind configured `HTTP_PROXY`/`HTTPS_PROXY`, enable its native proxy support with `NODE_USE_ENV_PROXY=1`. This is unnecessary on a laptop with ordinary direct Internet access and no proxy. Provider/key and region restrictions still apply. No live orders or real provider inference were exercised by the display tests.
