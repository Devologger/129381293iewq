# Obsidian standalone trading workspace

This repository is the application. `/workspace/312897ads` is a reference checkout only: never import it at runtime or redirect users into its account flows.

Use the existing checkout; cloud tasks are isolated and do not need Git worktrees unless explicitly requested.

Runtime: Node >=24, Python >=3.12 (validated here on Node 24 / Python 3.12). Windows may use its installed Python 3.14 through TERMINAL_PYTHON. `npm ci`, `npm run build`, and `npm start` run at this repository root. Python research uses only the standard library and the bundled directional Fibonacci model.

Before changing Next.js code, read relevant guides in `node_modules/next/dist/docs/`. This is Next.js 16.2.6.

Paper state belongs to the server's SQLite ledger, not browser storage. The worker and signed Discord commands use that same ledger. Preserve source labels, accounting invariants, closed-bar semantics, and training/validation separation.

Credentials are optional. Private integration settings require the standalone admin password. Store submitted credentials encrypted in `.runtime`; never print, return, commit, or embed their values. Exchange execution is restricted to fixed Binance USD-M demo endpoints; real-money execution is unavailable. Preserve explicit confirmation, idempotency, reconciliation, exchange filters, and exposure gates.

The runtime research council has no trading tools. All AI paths must use its atomic, persistent budget ledger. Unknown provider outcomes retain reservations. ECC-style Codex specialist roles live under .codex; do not assume development-session costs are covered by the application budget.

Checks: `npm test`, `npm run test:research`, `npm run lint`, `npm run build`. README.md describes startup and late credential configuration.

Remote free inference is the default. Never automatically switch to paid OpenAI, paid models, or local model hosting. Free model selection must pass catalog price and quota gates. OHLCV profiles are estimates, not trade-level evidence. Obsidian memory is retrieval context, not neural-weight fine-tuning. New strategy families remain research-only until separately authorized and forward validated.
