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
- **AI research:** The three-member council defaults to direct remote free routing across configured Groq/OpenRouter accounts. Add a free-provider key as `TEAM_REMOTE_KEY`; no OpenAI billing or local model is required. `TRADE_AI_KEY` is used only when `TEAM_AI_PROVIDER=openai` is explicitly selected. Owner authentication is required, requests use `store: false`, and agents have no execution tools. All AI endpoints share a persistent budget.
- **Binance demo:** `BINANCE_DEMO_API_KEY` and `BINANCE_DEMO_API_SECRET` enable signed USD-M demo verification and exchange execution. These must be raw signing credentials, not proxy placeholders. They can be entered privately later. Verification reads balances without placing orders. The separate Binance demo desk supports market/limit orders, reduce-only closes, cancellation, reconciliation, and opt-in demo automation. All execution destinations are fixed to `demo-fapi.binance.com`; real-money execution is unavailable.
- **Deployment:** set `TERMINAL_PUBLIC_ORIGIN` to the exact HTTPS origin behind a reverse proxy, so origin validation and secure cookies work. Do not expose credential configuration over remote HTTP.

The `.runtime` directory holds the SQLite ledger and encryption/signing key. Preserve it across restarts; losing it loses workspace access and encrypted settings. It is excluded from Git, Docker build context, and application file tracing. The app can create a fresh workspace if its browser cookie is lost; it does not claim that different browsers automatically share an account.

## Live markets and demo trading

The cockpit opens with exchange data. Binance, Bybit and Kraken charts use public browser WebSockets, with reconnect/backoff, visibility cleanup and validated forming candles. The connection badge distinguishes **EXCHANGE STREAM**, **SNAPSHOT FALLBACK**, offline and synthetic sample. Public chart prices never become execution inputs. Private demo positions/P&L are polled every five seconds and marked stale on failure; this is not a user-data execution stream.

WebSocket destinations: `stream.binance.com:9443`, `fstream.binance.com`, `stream.bybit.com`, `ws.kraken.com`. REST history/fallback still needs `api.binance.com`, `fapi.binance.com`, `api.bybit.com`, `api.kraken.com`. Regional exchange restrictions still apply. No restriction bypass is provided.

Paper automation is retired. Existing paper positions retain server protection and historical ledgers/vault records are preserved. Old paper engine/automation enable requests are rejected; old enabled bots become research-only scanners. New orders use the separately authorized Binance demo cockpit.

## Persistent automation and learning

The Node worker runs every 30 seconds while the application server is running. Research uses a new closed candle once per context. The browser can close; the server must remain running. Demo entries establish a baseline before waiting for a future Fibonacci reclaim. Starting does not force a trade.

The bundled research harness compares bounded tolerances using chronological training/holdout data. Candidates remain advisory; demo execution does not auto-promote tolerances or strategy families. This standalone harness is distinct from the original confluence/production worker. See [current operating guide](docs/DEMO-COCKPIT.md).

## Obsidian + Codex

Open `obsidian-vault` as an Obsidian vault. Manual and automated research save linked Markdown reports under `obsidian-vault/Research/<workspace-id>/`. The optional `TERMINAL_VAULT_DIR` changes the vault location. Notes include data source, costs, training/holdout results, and the paper journal. Markdown download remains available from the UI.

Codex can read the notes and `Codex Research Protocol.md` to investigate and test further strategies or exchange adapters. Bounded runtime learning updates parameters; repository code changes use the Codex development workflow. The app does not autonomously deploy Codex patches. The research council produces reviewed notes on demand or on a persisted schedule; `.codex` contains ECC-style development roles. See [agent-team setup](docs/AGENT-TEAM.md). No Obsidian desktop process is required in the cloud container.

## Discord access

Configure the optional Public Key later. Deploy this app at a public HTTPS origin and set Discord's interaction endpoint to `<origin>/api/terminal/discord`. Register `/obsidian` with `help`, `status`, `positions`, `pause`, `resume`, and `link` subcommands; `link` has a required string option named `code`. The command schema is in `discord-command.json`.

In dashboard Connections, generate a one-time link code. Use `/obsidian link code:<code>` privately within ten minutes. A code is single-use and binds the Discord user to that persistent workspace. Signed status commands report cached demo worker state and historical paper information. Pause stops new demo entries; resume directs you to the cockpit for explicit demo authorization. Responses are ephemeral; unlinked users cannot read another workspace's portfolio. Only one Discord account is linked to a workspace at a time. No command has been registered or message sent by this setup.

## Binance demo execution

1. Set a private `TERMINAL_ADMIN_PASSWORD` (16+ characters), restart, and unlock Connections.
2. Add `BINANCE_DEMO_API_KEY` and `BINANCE_DEMO_API_SECRET` privately. These must be USD-M demo keys; spot testnet is a separate service.
3. Set Binance demo to **one-way position mode**. The app rejects hedge mode and never changes that account setting for you.
4. Open **Command center**, choose contract/timeframe and entry size, check **Allow automated Binance DEMO orders**, then **Start demo**. The **DEMO CONNECTED** badge confirms a successful private demo-account read, not merely a running browser.
5. Wait for the worker baseline, then a new closed-bar reclaim. Default caps remain 500 USDT per entry and 2000 USDT total account exposure. The contract must be flat, with no pending entry or stale protection.
6. New market entries attach an exchange-native mark-price stop and three reducing targets via `/fapi/v1/algoOrder`, after the entry acknowledgement. Stop: 2% from the preview mark; targets: 1R/2R/3R from that same reference; allocations 40/30/30% after quantity rounding. Actual fill slippage changes realized R. Very small sizes that cannot support three filtered quantities are rejected before entry.
7. Inspect **Positions** or **More tools → Binance demo desk → Exchange conditional protection**. The stop must be acknowledged active, and all target statuses must be confirmed. Unknown submissions are queried by persistent client IDs and never blindly repeated. Unconfirmed protection halts entries; after a confirmed bot fill, the worker attempts a separately journaled reduce-only close if it can verify the exposed position. A failed/uncertain close still requires inspection in Binance demo.
8. **Pause demo** stops entries; installed native protection stays on the exchange. Flat-position reconciliation cancels leftover sibling conditionals before that contract can be reused. Existing legacy positions retain their old sampled protection until closed; they are not silently converted.
9. Manual protected market previews and reduce-only closes remain in the advanced demo desk. Existing limit orders can be reconciled/canceled; new unprotected limit entries are disabled.

Use a dedicated USD-M demo account in one-way mode. All execution destinations are fixed to `demo-fapi.binance.com`; no real-money adapter exists. SL/TP submission is not atomic with the entry: there is a post-fill protection window. Full original strategy/worker parity, private account streaming and imported demo realized-outcome learning are not implemented. This build is validated with controlled exchange responses; real demo conditional orders require your private keys and permitted exchange access.

## Research council and costs

Starting demo autopilot schedules the council automatically once demo evidence exists. Open **AI research team** for history or an optional manual question. Select saved chart or Binance demo bot evidence, ask a question, and convene the strategy researcher, risk reviewer and vault curator. Each role calls the selected remote provider with bounded evidence, Obsidian memory, and earlier reviews. Free routing requires zero advertised model prices and never falls back to paid OpenAI. Full discussion and a linked note are saved to the Obsidian workspace.

Free mode has no app-imposed daily call cap and defaults to 2000 output tokens/call. Provider quotas still apply; no router supplies unlimited free tokens. Explicit paid mode retains dollar budgets and its optional call cap. SQLite persists usage/reservations across restarts and shares accounting across workspaces. Automatic reviews default to every eight hours and persist a waiting state on provider failure; they do not loop until a provider accepts. Identical completed briefings are cached for six hours. Unknown provider outcomes retain reservations; only an explicit rate-limit rejection allows one retry. Premium review is disabled in free mode. Explicit paid mode requires configured model prices, an allow switch, and an escalation request. Automatic schedules never escalate.

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

### Cinematic mobile workspace and distribution confirmation

The dedicated `/jarvis` page adds a fullscreen voice console with animated orbital rings, stars, audio response and selected-market telemetry. Mobile navigation uses a labeled bottom dock and an all-views menu. The interface respects reduced motion and releases microphone tracks when stopped or closed.

Strategy explorer now reports bullish, bearish or neutral **POC distribution context**. The default profile freezes the preceding 120 candles before the latest two closed candles. Two later closes above POC plus its tolerance indicate bullish acceptance; two below indicate bearish acceptance; mixed or missing confirmation stays neutral. Tolerance is the larger of 5% of the value-area width and 0.15% of POC. A confirmed retest requires a touch of this band, a close back on the accepted side and a subsequent close holding that side. An explicit range ending at the latest candle has no later confirmation yet. The POC-reclaim research strategy also freezes its profile before its crossing/retest sequence.

This context is included in council inputs and saved Obsidian strategy notes. It is an OHLCV-based volume estimate and research evidence, not a guarantee or automatic deployment instruction. The managed FreeRide gateway defaults to concise-chat model filtering to reduce reasoning-token exhaustion; see the [Windows update steps](docs/FREERIDE-WINDOWS.md#updating-after-an-output-limit-failure).

### Simple startup and council controls

After the one-time build and optional FreeRide install, `npm run launch` starts Penguin and its configured private router together. Add private demo and AI keys in Settings. In the demo cockpit choose size/timeframe, explicitly authorize demo orders and press Start demo. This queues automatic eight-hour council reviews after demo evidence exists. Free-mode app calls are unlimited; provider quotas, compact prompts, cached evidence and accounting remain. See [current Windows operating guide](docs/DEMO-COCKPIT.md).

### Compact desk and direct free-cloud routing

The demo-first cockpit groups connection/worker health, streamed charts, sampled private P&L, positions and native protection statuses. Paper automation is retired. Settings live on `/settings`; order and research diagnostics remain behind More tools. Direct free cloud reuses encrypted Groq/OpenRouter keys without a gateway. Uncertain inference outcomes are never resent.

JARVIS can coordinate the three-role team with “start team,” saving reviewed evidence to Obsidian and enabling a bounded schedule after success. Optional owner-enabled Discord channel webhooks report failures and losses. Optional remote Jarvis TTS uses the linked project's documented authenticated WAV endpoint; default browser voice remains available. These roles review trading evidence; the guarded demo worker executes the configured deterministic harness. Profitability, real provider access, webhook delivery and hosted TTS must be verified with the user's privately configured accounts.

Free cloud comparison: open **AI research team → Compare free AI routes** to run the same small question through direct free cloud, Groq, OpenRouter, optional FreeRideV3 and optional 9Router. Results include actual answers, latency, tokens and failures using the shared call ledger. Free-LLM/no-cost-ai are linked provider directories. Follow [the Windows setup and comparison guide](docs/AI-ROUTE-COMPARISON.md) for optional gateway configuration; no paid fallback or local AI inference is enabled.

Scanning and customer accounts: the simplified dashboard has a watchlist scan control, worker/feed status, chart, equity and positions. `/account` supports invitation-based registration, persistent private workspaces, profiles and revocable sessions. [Read how scanning works, the Windows setup, invitation pilot configuration and remaining commercial release gaps](docs/SCANNING-AND-ACCOUNTS.md). Keep `PENGUIN_ACCOUNT_MODE=0` for your existing local owner workspace; enable account mode with an invitation code before an online pilot.

Live display and outcome feedback: watchlist forming candles refresh using 3-second REST snapshots; research/execution still use closed bars. Actual paper closures feed a persistent outcome journal, a context-specific three-loss pause and a veto on tolerance promotions with recorded negative paper evidence. [Read what is live, how to enable bounded learning and the limits](docs/LIVE-DATA-AND-LEARNING.md). This is not LLM weight training or automatic strategy deployment.
