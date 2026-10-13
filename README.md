# Penguin Trading Workspace

A standalone trading dashboard and paper and Binance USD-M demo automation service with multi-market charts, bounded Fibonacci learning, a JARVIS-inspired voice console, an Obsidian research vault, a budgeted OpenAI research council, and signed Discord controls.

`Devologger/312897ads` was a strategy and connection reference. This app does **not** need that checkout, its API, its database, its authentication, or port 8000. The canonical directional Fibonacci model is bundled under `research/`; provenance is in NOTICE.md.

## Start

Requires Node >=24 and Python >=3.12 (validated in cloud on Node 24 / Python 3.12). Windows Python 3.14 can be selected with `npm.cmd run setup:windows`. See the [Windows guide](docs/WINDOWS-QUICKSTART.md). Python research uses only the standard library; there is no Python dependency installation or separate API process.

```bash
npm ci
npm run build
npm start -- --hostname 127.0.0.1 --port 3000
```

For development use `npm run dev`. Open the terminal route `/terminal`; the root route forwards there. Start all commands in this repository root. Keep the `research` and `obsidian-vault` directories with the app. Running the whole checkout is the supported deployment layout.

## Credentials can wait

Charts in sample mode, paper execution, strategy research, server persistence, and the vault work with **no credentials**. No key needs to be provided in chat.

When ready, use private environment settings or an ignored `.env.local` file. `.env.example` lists optional variables. To use the app’s credential form, set `TERMINAL_ADMIN_PASSWORD` to a private password of at least 16 characters, restart, then unlock **Connections → Private integration settings**. Submitted values are encrypted with AES-256-GCM in the server ledger and are never returned by the API. Environment-managed bindings cannot be overwritten by that form.

- **Discord:** `DISCORD_PUBLIC_KEY` is the application's Public Key from Discord Developer Portal → General Information. It is not the bot token. It verifies incoming slash commands; no bot token is required for this interaction endpoint.
- **AI research:** The three-member council defaults to remote free inference through OpenRouter. Add a free-provider key as `TEAM_REMOTE_KEY`; no OpenAI billing or local model is required. `TRADE_AI_KEY` is used only when `TEAM_AI_PROVIDER=openai` is explicitly selected. Owner authentication is required, requests use `store: false`, and agents have no execution tools. All AI endpoints share a persistent budget.
- **Binance demo:** `BINANCE_DEMO_API_KEY` and `BINANCE_DEMO_API_SECRET` enable signed USD-M demo verification and exchange execution. These must be raw signing credentials, not proxy placeholders. They can be entered privately later. Verification reads balances without placing orders. The separate Binance demo desk supports market/limit orders, reduce-only closes, cancellation, reconciliation, and opt-in demo automation. All execution destinations are fixed to `demo-fapi.binance.com`; real-money execution is unavailable.
- **Deployment:** set `TERMINAL_PUBLIC_ORIGIN` to the exact HTTPS origin behind a reverse proxy, so origin validation and secure cookies work. Do not expose credential configuration over remote HTTP.

The `.runtime` directory holds the SQLite ledger and encryption/signing key. Preserve it across restarts; losing it loses workspace access and encrypted settings. It is excluded from Git, Docker build context, and application file tracing. The app can create a fresh workspace if its browser cookie is lost; it does not claim that different browsers automatically share an account.

## Charts and paper trading

Public market providers: Binance USDT spot/perpetual, Bybit USDT spot/perpetual, Kraken USD spot. Watchlists support 1–8 editable base symbols. Timeframes: 5m, 15m, 1h, 4h. Providers refresh closed OHLC candles every 30 seconds. They are REST snapshots, not tick streams.

Allow outbound access to `api.binance.com`, `fapi.binance.com`, `api.bybit.com`, and `api.kraken.com`. Regional exchange restrictions may still apply. A failed exchange request stays visibly failed; sample data is never labeled as a live fallback. Samples are deterministic synthetic historical candles and do not demonstrate a trading edge.

Paper accounts start with $10,000. The server validates funds, six-position capacity, fresh matching feeds, 1× collateral, and 12 bps costs per side. Spot shorts are rejected; perpetual paper shorts are supported. Cash, positions, and up to 200 closed fills are persisted in SQLite and shared by the dashboard, worker, and linked Discord account. Client requests cannot set cash or provide their own fill prices.

The dashboard marks matching currently loaded feeds; other positions are shown at entry and the marked count is displayed. Unrealized P&L excludes future exit costs. Realized P&L includes both sides.

## Persistent automation and learning

The Node server starts a worker through Next instrumentation. It runs every 30 seconds and continues when the browser closes **while the application server remains running**. A new workspace starts paused. Reloading the dashboard preserves the server engine state; it does not silently pause bots. Pausing the engine stops new entries and learning; existing paper positions remain monitored.

Each exchange/market/symbol/timeframe has its own bot. Switching charts does not stop other configured bots. Enable automation and bounded learning in Strategy Lab while using exchange data. A newly enabled bot records a baseline bar before entering; repeated processing of the same bar cannot duplicate entries. Feed failures and worker errors appear in the dashboard. Static sample data does not produce new-bar automated trades.

Learning compares tolerances 0.05%, 0.08%, and 0.12% around the bundled canonical 0.618 model. Training uses the first 70% of closed candles; the final 30% can veto the training-selected candidate. A candidate requires five training trades, three holdout trades, positive holdout return, improvement over the 0.08 baseline, and no worse holdout drawdown. Candidates passing those gates can update the paper bot tolerance; no live strategy is promoted.

The research harness is long-only, enters a reclaim at the next bar’s open, uses an anchor stop, a 2R target, and a 24-bar timeout. It assumes stop-first on ambiguous bars and includes costs. The paper worker enters at sampled closed-bar prices and monitors 2% stops / 4% targets. Research and paper execution therefore have different fill/protection semantics; their results are not execution-parity proof. Repeated holdout inspection can create selection bias, so forward evidence remains necessary.

## Obsidian + Codex

Open `obsidian-vault` as an Obsidian vault. Manual and automated research save linked Markdown reports under `obsidian-vault/Research/<workspace-id>/`. The optional `TERMINAL_VAULT_DIR` changes the vault location. Notes include data source, costs, training/holdout results, and the paper journal. Markdown download remains available from the UI.

Codex can read the notes and `Codex Research Protocol.md` to investigate and test further strategies or exchange adapters. Bounded runtime learning updates parameters; repository code changes use the Codex development workflow. The app does not autonomously deploy Codex patches. The research council produces reviewed notes on demand or on a persisted schedule; `.codex` contains ECC-style development roles. See [agent-team setup](docs/AGENT-TEAM.md). No Obsidian desktop process is required in the cloud container.

## Discord access

Configure the optional Public Key later. Deploy this app at a public HTTPS origin and set Discord's interaction endpoint to `<origin>/api/terminal/discord`. Register `/obsidian` with `help`, `status`, `positions`, `pause`, `resume`, and `link` subcommands; `link` has a required string option named `code`. The command schema is in `discord-command.json`.

In dashboard Connections, generate a one-time link code. Use `/obsidian link code:<code>` privately within ten minutes. A code is single-use and binds the Discord user to that persistent workspace. Signed commands then read its actual paper status/positions and pause/resume its engine. Responses are ephemeral; unlinked users cannot read another workspace's portfolio. Only one Discord account is linked to a workspace at a time. No command has been registered or message sent by this setup.

## Binance demo execution

1. Set a private `TERMINAL_ADMIN_PASSWORD` (16+ characters), restart, and unlock Connections.
2. Add `BINANCE_DEMO_API_KEY` and `BINANCE_DEMO_API_SECRET` privately. These must be USD-M demo keys; spot testnet is a separate service.
3. Set Binance demo to **one-way position mode**. The app rejects hedge mode and never changes that account setting for you.
4. Open **Binance demo desk**, then refresh the account. Choose a USDT perpetual contract, side, market/limit type and notional.
5. Preview the order. The server loads demo exchange filters, fresh mark price, account positions and pending orders; it enforces default caps of 500 USDT per entry and 2000 USDT total account exposure. A limit price must remain within 10% of mark.
6. Check the explicit Binance demo confirmation and submit within 60 seconds. If the price/quantity changed, create a fresh preview. Orders use persistent client IDs. An uncertain write is reconciled by ID, never blindly retried; unresolved writes block new submissions.
7. Confirmed/demo-uncertain order updates also write `Binance Demo Order Journal.md` into your private Obsidian workspace. Reduce-only close buttons and cancellation operate authoritative exchange positions/orders. Reconcile refreshes an order's actual status.
8. To automate, choose size/timeframe, check the separate demo automation authorization and enable the demo bot. It establishes a closed-bar baseline, then trades long-only 0.618 reclaims using demo candles and local bounded research. No LLM call is needed for this trading loop.
9. A contract has one workspace/bot owner. Existing positions must be closed before assigning a new bot. Pausing stops new entries but keeps position monitoring active. The server checks 2% stops and 4% targets every 30 seconds. These are sampled server checks, **not exchange-side protective orders**; the server and network must remain available.

Use a dedicated demo account. The demo desk sees that entire exchange account; avoid manually trading a bot-managed contract elsewhere. Paper and demo balances are separate. Existing paper bots never change execution mode implicitly. Real credentials, actual account connectivity and demo fills still require your own private keys and permitted network access; automated tests use controlled exchange responses.

## Research council and costs

Run Strategy Lab research, then open **AI research team**. Select saved chart or Binance demo bot evidence, ask a question, and convene the strategy researcher, risk reviewer and vault curator. Each role calls the selected remote provider with bounded evidence, Obsidian memory, and earlier reviews. Free routing requires zero advertised model prices and never falls back to paid OpenAI. Full discussion and a linked note are saved to the Obsidian workspace.

Free mode defaults to nine provider attempts/day and 2000 output tokens/call. Explicit paid mode also enforces $1/day and $0.20/run accounting limits; `.env.example` retains the conservative nine-attempt cap. SQLite persists usage/reservations across restarts and shares limits across workspaces. Identical completed briefings are cached for six hours. Unknown provider outcomes retain reservations; only an explicit rate-limit rejection allows one retry. Premium review is disabled in free mode. Explicit paid mode requires configured model prices, an allow switch, and an escalation request. Automatic schedules never escalate.

Prices are conservative **configured accounting estimates**, not provider invoices. Verify rates for your selected model. Codex development-session charges are separate and cannot be metered by this app. [Free-provider comparison, routing and research details](docs/FREE-AI-AND-STRATEGIES.md). [Schedule and ECC instructions](docs/AGENT-TEAM.md).

## Strategy explorer and Obsidian learning

Compare six research families: Fibonacci reclaim, volume-profile VAH retest, POC reclaim, Donchian breakout, EMA pullback and RSI mean reversion. Fixed-range controls show POC/VAL/VAH and estimated high-volume zones. Profiles are OHLCV approximations, not trade-level volume-at-price. Training-only selection, chronological validation/final holdouts, doubled-cost stress tests and sample-count gates can veto candidates. New families are not deployed automatically.

Bounded research includes these comparisons when 300+ candles are available. Automatic paper learning and demo research refresh evidence on new bars without LLM calls. Source-labeled notes and `Learning Memory.md` accumulate under the workspace’s Obsidian Research folder; the council reads that and optional `Agent Memory.md` on subsequent reviews. This is retrieval-based memory, not weight fine-tuning or proof of monthly profits. [Methodology and limits](docs/FREE-AI-AND-STRATEGIES.md).

## JARVIS-inspired voice interface

Click **JARVIS voice** for the animated assistant console: rotating HUD rings, an audio-reactive core, waveform, transcript history and spoken replies through browser speech synthesis. Navigation/status work locally without AI tokens. Research questions invoke the budgeted council. Demo order submission is available only through desk confirmation.

Use HTTPS and a browser supporting SpeechRecognition/WebKitSpeechRecognition. Allow microphone access and click **Start microphone**. Optional **Conversation** mode listens again after each spoken response; Stop microphone or closing the assistant ends capture. Toggle Spoken replies off for text-only replies. Speech recognition or selected speech voices may use the browser's speech provider; this is not an offline speech engine or OpenAI Realtime integration.

Commands: `show Bitcoin`, `show markets`, `show strategy`, `show vault`, `show demo desk`, `show team`, `show connections`, `show status`, `show budget`, `run research`, `run team`, `export report`, `start engine`, `pause engine`. Natural research questions go to the council. Typed input supports the same actions. Browser microphone quality and availability need validation on your own device.

## Checks

```bash
npm test
npm run test:research
npm run lint
npm run build
```

Tests exercise costs, collateral conservation, risk rejection, provider response schemas, source isolation, signed Discord access, persistent ledger transactions, encrypted settings, server learning/entry deduplication/protection, Binance demo orders/uncertainty/filter/exposure controls, bot bar deduplication and paused protection, agent budgets/cache/retries/usage, and chronological research. External exchange requests, real OpenAI responses, Discord registration, and microphone recognition need their optional runtime prerequisites. Binance demo verification and execution are covered with controlled responses, not real keys.

The application build may emit a Turbopack tracing warning for the Python subprocess; the supported runtime layout keeps the bundled Python sources alongside the Node app. The build finishes by filtering private runtime, environment, and generated-note paths from all tracing manifests, including the instrumentation trace which Next's route exclusions do not cover. Keep persistent data as runtime storage; do not package `.runtime`, private notes, or `.env.local` as source artifacts.

## Penguin + real FreeRide gateway

Optional FreeRideV3 is now integrated, pinned to a reviewed upstream revision. It runs a private routing service and uses remote OpenRouter / optional Groq inference. [Detailed Windows installation and troubleshooting](docs/FREERIDE-WINDOWS.md). After configuring `TEAM_AI_PROVIDER=freeride`, run `npm run freeride:install` once and keep `npm run freeride:start` running alongside Penguin. Existing encrypted OpenRouter keys are reused. Other providers from FreeRide’s table are not enabled by this adapter.

The research council’s **Check AI connection** button checks provider metadata or gateway capabilities without an inference call. Provider failures now explain privacy, regional, authentication and quota restrictions without recording raw error bodies. A 403 still needs the provider’s actual diagnosis; routing cannot bypass an account restriction.

Penguin’s animated cyan HUD respects reduced-motion preferences. The voice interface offers installed browser voices, rate and pitch controls, preferring a British voice when available. It does not include the actor’s Iron Man voice. Obsidian remains the knowledge integration: the vault view reads private linked notes, edits bounded `Agent Memory.md`, and generates a real Canvas plus a Bases table from workspace notes. Memory changes affect the next uncached council run; this is retrieval context, not weight training. Existing runtime files, cookies, encrypted keys and vault paths are preserved by the rename. Existing `/obsidian` Discord commands are accepted alongside the new `/penguin` command; registering the updated JSON is a separate Discord setup step.

Gateway integration checks (after installation):

```powershell
.runtime/freeride-venv/Scripts/python.exe tests/freeride-check.py
```

On Linux, use `.runtime/freeride-venv/bin/python tests/freeride-check.py`. These checks run the actual installed FreeRide engine with synthetic upstream responses; they do not spend provider quota or use real keys.
