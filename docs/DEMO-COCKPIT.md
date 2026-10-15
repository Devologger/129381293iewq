# Penguin demo cockpit

## Update and run on Windows

Keep your `.runtime`, private `.env.local` and vault: they contain your account state and encrypted settings. Do not delete them to fix a quota error.

In PowerShell, inside your existing Penguin repository:

```powershell
git pull --ff-only origin main
npm.cmd ci
npm.cmd run build
npm.cmd run launch
```

For an existing FreeRide setup, update its managed installation once with `npm.cmd run freeride:install` before launch. The launcher starts the managed gateway when that route is selected. FreeRide does not need a separate account or additional pool of tokens: it uses the Groq/OpenRouter keys you saved privately. Registered customer accounts use isolated direct providers instead of the owner's gateway.

Open Penguin in your browser. In Settings, unlock your private settings and add Binance **USD-M demo** API key and secret. Use a dedicated one-way demo account. Add your Groq key and confirm the free plan; add an OpenRouter key if its free models are available under your privacy settings. Never paste keys in chat or commit them.

Return to Command center. A successful private account refresh shows **DEMO CONNECTED / Virtual funds**. Choose a chart and timeframe, set entry size, check demo authorization, and press **Start demo**. This starts closed-candle demo scanning and schedules the research council after the first report exists. The bot waits for a future valid signal; it does not buy immediately just to show activity. Review worker timestamp, entry state, positions and conditional-order statuses. Pause stops new entries. Settings and detailed order/reconciliation tools remain separate from the main desk.

## Data speeds

| Data | Transport | Meaning |
|---|---|---|
| Public charts / forming candles | Exchange WebSocket | Exchange pushes updates as published; Binance futures kline streams document updates as often as 250 ms when activity exists. Other exchanges have their own cadence. This is not tick-by-tick order-book or trade data. |
| Snapshot fallback | REST, every 15 seconds while streaming is unavailable | Explicitly labelled; never reported as streaming. |
| Research and entry signals | Server closed demo candles, checked every 30 seconds | One report per new closed candle; browser prices cannot trigger orders. |
| Private positions and open P&L | Authenticated demo REST, every five seconds while the desk is visible | Last successful sync and stale/disconnected state are shown. No private user-data WebSocket yet. |
| Council | Three bounded specialist calls, default every eight hours | Advisory research saved to Obsidian. Provider failures persist a waiting state until the next scheduled review. No automatic paid fallback or escalation. |

WebSocket hosts are fixed in the code and CSP. If your network/region denies an exchange, select an accessible public chart venue; this does not change the Binance demo execution destination. A public Binance perpetual chart is production public market data, not a private demo-price stream.

## Protection and strategy

The current long-only 0.618 reclaim harness is **not the original repository's complete strategy**. That reference includes multiple confluence/scalp variants and its own admission, sizing and lifecycle rules; the inspected active scalp variant uses one target with TP2/TP3 absent. Penguin has not imported those workers or demonstrated execution parity.

Penguin's explicitly labelled `demo-fixed-risk-v1` policy attaches:

- A native MARK_PRICE STOP_MARKET at 2% from the preview mark, using closePosition=true for the remaining one-way position.
- TP1/TP2/TP3 at 1R/2R/3R from that reference, with reducing 40/30/30% quantities rounded to exchange increments. Fill slippage changes the actual reward/risk and stop distance from entry.
- Persistent clientAlgoIds, a durable write claim before each POST, identity/geometry/reducing-flag checks, and query-only reconciliation after uncertain writes.

These are submitted through the conditional Algo Order API after the entry fills. There is a protection window between entry and verified stop. If a bot's fill is confirmed but its protection is incomplete, the worker halts entries and attempts a separately recorded reduce-only close if it can verify an exposed position. An uncertain submission/close is not repeated. Inspect unresolved state in Binance demo; the app must not label it protected.

Small sizes unable to split into three valid quantities are rejected. New limit entries are disabled; existing limit orders remain reconcilable/cancelable. A contract must be flat with no pending entry or leftover conditional orders before another entry. When a previously observed position becomes flat, reconciliation cancels remaining native conditionals. Keep the server running for scanning, reconciliation and alerts. Installed native stops/targets remain on the exchange if the server closes. Existing legacy positions retain sampled monitoring until closed and are not silently migrated.

Native API parameter contracts were cross-checked against Binance's official [USD-M Trade API source](https://github.com/binance/binance-connector-js/blob/72707d14d842bc046cccc3b88462d6813c664deb/clients/derivatives-trading-usds-futures/src/rest-api/modules/trade-api.ts) and the reference repo's Algo Order implementation. Tests use controlled exchange responses. No authenticated exchange order was submitted during cloud development; real demo acknowledgements and fill behavior still need verification with your keys.

## Free AI capacity

Free modes ignore old TEAM_DAILY_CALL_LIMIT values and saved app call allowances. The ledger continues recording calls, input/output tokens, costs and uncertain reservations; this is not erased by switching routers or restarting. Paid mode retains explicit dollar budgets and an optional call cap.

Groq/OpenRouter quotas belong to your upstream account and model. FreeRide/9Router can switch eligible routes, but a router cannot create free tokens, override privacy access, or guarantee uninterrupted service when every permitted route is exhausted. A 404 means a removed/unavailable route; a 403 requires account/model/privacy investigation; a 429 means capacity is exhausted. Keep Groq free-plan confirmation accurate. Only allow OpenRouter data retention/training policies you accept; do not send exchange secrets, account passwords or private customer data to research models.

Use your existing working FreeRide Groq route, with another permitted provider as optional fallback. Eight-hour research summaries, compact evidence and cached notes reduce pressure. The deterministic scanner and guarded demo execution do not consume LLM tokens and continue independently of advisory-provider availability. Reliable continuous inference eventually requires a provider plan with enough capacity; there is no verified unlimited free-cloud service in this integration.

## What learning means

The council reads research, order acknowledgements, conditional protection and vault memory. It proposes changes; it cannot execute free-text proposals or modify its own permissions. Model weights are not trained by saving Obsidian notes. Historical paper outcomes remain archived, but paper automation is retired. Imported realized demo fills/fees, a demo outcome-learning loop and full reference-worker parity remain unfinished. Do not interpret a completed council briefing as proof of a profitable strategy.

## Validation of this revision

92 Node tests and 16 Python research tests passed, along with lint and a production build. Browser checks used synthetic exchange frames and inference responses: authenticated API access, private demo connection, explicit Start/Pause, automatic worker/council flow, four streamed charts, reconnect, persistent chart canvas, 320/390 px layouts and reduced motion. Exchange-condition tests cover native reducing flags and identity/geometry, uncertain write reconciliation without reposting, concurrency leases, partial-target quantity filters, flat-position sibling cleanup, short-side protection and a confirmed fill followed by rejected protection and a reducing emergency close. Actual Binance demo fills, upstream quotas and microphone/hosted speech remain account/device-dependent and were not live-tested here.
