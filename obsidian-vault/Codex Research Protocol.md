---
tags: [obsidian-trader, codex, protocol]
---

# Codex Research Protocol

Read [[Strategy Index]], [[Paper Trade Journal]], and the latest exported report before proposing a change.

1. Identify one concrete hypothesis and its failure condition.
2. Preserve the canonical Fibonacci ratios, existing authentication, and live execution gates.
3. Use chronological data with training selection and a separate holdout veto. Include costs, drawdown, trade counts, and data-source provenance.
4. Propose a bounded change and run reproducible tests. Do not edit a strategy simply to make a metric improve.
5. Write the rationale, evidence, and limitations into a new linked Markdown note.
6. Apply validated changes to paper experiments first. This workflow does not authorize live exchange orders or autonomous production deployments.

Example Codex task:

> Read the latest BTC Fibonacci report and this protocol. Investigate one bounded improvement to the paper harness. Explain whether the evidence is sufficient, implement the experiment, and run the accounting and chronological-data tests. Keep live execution gated.

The optional OpenAI runtime analyst produces advisory text. It is separate from Codex’s repository-editing workflow.
