# Hosted setup has moved

Use [the current launch guide](LAUNCH-GUIDE.md) for the complete backend, Supabase, administrator, subscriptions and Discord instructions.

The current flow has an animated public landing page, open registration, email/password sign-in and confirmation/recovery **links**. It has no email-code entry or JARVIS voice flow. Customer AI is locked until a verified active subscription; the reserved administrator must be created/bound through the trusted server CLI. Missing billing never unlocks customer AI.

Supabase hosts identity, encrypted integrations and subscription state. Trading journals, sessions, the administrator UUID binding and Markdown vault remain on **one durable application server**. Do not run multiple independent replicas against the same exchange keys. Preserve runtime storage and separate encryption-key backups across updates.

[Native charts and real read-only Binance](REAL-BINANCE-AND-CHARTS.md) · [Demo execution and protection](DEMO-COCKPIT.md)

Earlier screenshots are synthetic design examples, not exchange connectivity or profitability evidence. Live Supabase/SMTP/Stripe/Discord/exchange validation and the legal/operational release requirements in the launch guide must be completed before selling access.
