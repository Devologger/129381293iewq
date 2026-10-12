# Obsidian Trading Workspace

A standalone trading dashboard and paper automation service with multi-market charts, bounded Fibonacci learning, voice commands, an Obsidian research vault, optional OpenAI analysis, and signed Discord controls.

`Devologger/312897ads` was a strategy and connection reference. This app does **not** need that checkout, its API, its database, its authentication, or port 8000. The canonical directional Fibonacci model is bundled under `research/`; provenance is in NOTICE.md.

## Start

Requires Node 24 and Python 3.12. Python research uses only the standard library; there is no Python dependency installation or separate API process.

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
- **AI research:** `TRADE_AI_KEY` enables the optional OpenAI advisory endpoint. `TRADE_AI_MODEL` defaults to `gpt-5-mini`. Owner authentication is required, requests use `store: false`, and the model has no execution tools.
- **Binance demo:** `BINANCE_DEMO_API_KEY` and `BINANCE_DEMO_API_SECRET` enable signed, read-only USD-M demo account verification. These must be raw signing credentials, not proxy placeholders. They can be entered privately later. Verification uses `demo-fapi.binance.com`, reads balances, and places no orders. This app’s trading engine currently executes paper orders.
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

Codex can read the notes and `Codex Research Protocol.md` to investigate and test further strategies or exchange adapters. Bounded runtime learning updates parameters; repository code changes use the Codex development workflow. The app does not autonomously deploy Codex patches. No Obsidian desktop process is required in the cloud container.

## Discord access

Configure the optional Public Key later. Deploy this app at a public HTTPS origin and set Discord's interaction endpoint to `<origin>/api/terminal/discord`. Register `/obsidian` with `help`, `status`, `positions`, `pause`, `resume`, and `link` subcommands; `link` has a required string option named `code`. The command schema is in `discord-command.json`.

In dashboard Connections, generate a one-time link code. Use `/obsidian link code:<code>` privately within ten minutes. A code is single-use and binds the Discord user to that persistent workspace. Signed commands then read its actual paper status/positions and pause/resume its engine. Responses are ephemeral; unlinked users cannot read another workspace's portfolio. Only one Discord account is linked to a workspace at a time. No command has been registered or message sent by this setup.

## Voice

Use HTTPS and a browser supporting SpeechRecognition/WebKitSpeechRecognition, with microphone permission. Supported commands include `show Bitcoin`, `show markets`, `show strategy`, `show vault`, `run research`, `export report`, `start engine`, `pause engine`. The command field supports the same commands. The browser may use its speech provider; microphone recognition needs validation in your own browser. Paper orders use explicit dashboard buttons.

## Checks

```bash
npm test
npm run test:research
npm run lint
npm run build
```

Tests exercise costs, collateral conservation, risk rejection, provider response schemas, source isolation, signed Discord access, persistent ledger transactions, encrypted settings, server learning/entry deduplication/protection, Binance demo signing, and chronological research. External exchange requests, real OpenAI responses, Discord registration, and microphone recognition need their optional runtime prerequisites. Binance demo verification is covered with controlled responses, not real keys.

The application build may emit a Turbopack tracing warning for the Python subprocess; the supported runtime layout keeps the bundled Python sources alongside the Node app. The build finishes by filtering private runtime, environment, and generated-note paths from all tracing manifests, including the instrumentation trace which Next's route exclusions do not cover. Keep persistent data as runtime storage; do not package `.runtime`, private notes, or `.env.local` as source artifacts.
