---
tags: [obsidian-trader, index]
---

# Strategy Index

[[Codex Research Protocol]] · [[Paper Trade Journal]]

## Canonical base

- Repository: Devologger/312897ads, branch `custom-fib-app-integration`.
- Directional Fibonacci anchor model: `research/directional_fib_anchor_model.py`.
- Checked ratios are bundled in the model. Preserve this set.
- The reference production adapter is background reading; this app does not import it.
- Runtime paper ledger and bounded worker: `lib/server/store.ts` and `lib/server/worker.ts`.

## Terminal paper experiment

The new terminal harness studies **long-only 0.618 reclaims** using the canonical anchor model. It is a separate research harness, not a claim that the full production strategy has been backtested. Its bounded tolerance grid is 0.05%, 0.08%, and 0.12%.

Import exported terminal Markdown reports into this vault. Source labels distinguish synthetic samples from public exchange candles. Sample data does not demonstrate a trading edge.
