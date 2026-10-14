# Compare free cloud routes in Penguin

Penguin includes five test profiles. Free-LLM and no-cost-ai are also linked in the screen as provider directories. They have no gateway to install and do not grant tokens.

| Profile | What runs | Setup |
| --- | --- | --- |
| Direct free cloud | Penguin selects verified free Groq/OpenRouter models | Your existing encrypted keys |
| Groq direct | Only confirmed Groq free-plan models | Groq key + free-plan confirmation |
| OpenRouter direct | Zero-price `:free` models | OpenRouter key; compatible account privacy settings |
| FreeRideV3 | Penguin's private managed FreeRide gateway | Optional existing install/start scripts |
| 9Router | Separate loopback gateway, explicit verified free targets | Optional steps below |

These profiles share upstream quotas. Comparing three profiles backed by the same OpenRouter account does not provide three token allowances. No router bypasses provider limits or supplies 7 billion free tokens.

## Windows: update and start

In PowerShell, enter your existing Penguin project folder, then:

```powershell
git pull origin main
npm.cmd ci
npm.cmd run build
npm.cmd run launch
```

Preserve your `.env.local`, `.runtime`, and vault. The launcher starts Penguin and starts FreeRide when FreeRide is your selected council router. If comparing FreeRide while direct routing is selected, start FreeRide separately as described below. 9Router remains separately managed.

Open Penguin in your browser, unlock **Connections / private settings**, and use the existing private key fields. Never paste keys in a chat or commit them. Your OpenRouter key goes in **OpenRouter / free-provider API key**; your Groq key goes in **Groq free-tier key**.

After verifying your Groq account is on the free plan, set this in `.env.local` and restart Penguin:

```dotenv
FREERIDE_GROQ_FREE_CONFIRMED=1
```

For OpenRouter, check your account's model eligibility and privacy restrictions. Enabling data sharing changes where prompts may be retained or used; choose settings you accept. This comparison sends only the small test question, not your vault or trading evidence. Regular council reviews send research and retrieved vault context.

## Optional FreeRideV3

In a second PowerShell window at the project folder:

```powershell
npm.cmd run freeride:install
npm.cmd run freeride:start
```

Keep that terminal running. The private gateway reuses encrypted Penguin keys. If it was already running before changing keys, restart it. It allows two upstream attempts per gateway request. Penguin's shared ledger counts the gateway request, not each internal attempt.

## Optional 9Router

9Router runs routing software on your laptop; inference remains on remote cloud providers. Penguin does not host an AI model locally. Reviewed upstream source: `decolua/9router` at `ce4460ef79382bfddb4aa5fc0ff9f3cb0d5f95a8`; npm release available at review: `9router@0.5.99`.

Use a separate terminal. First check that port 20128 is unused; do not start another gateway over an existing service:

```powershell
Get-NetTCPConnection -LocalPort 20128 -ErrorAction SilentlyContinue
```

If a listener exists, use its existing dashboard or stop the process you own before continuing. The upstream CLI can terminate a process occupying its port. With the port free:

```powershell
$env:REQUIRE_API_KEY="true"
$env:ENABLE_REQUEST_LOGS="false"
npx.cmd --yes 9router@0.5.99 --host 127.0.0.1 --port 20128 --no-browser
```

Open its dashboard at `http://127.0.0.1:20128/dashboard`. Finish its private administrator setup. In 9Router:

1. Connect only your confirmed free Groq account and/or OpenRouter free models. Do not add paid accounts, paid fallback, local models, tunnels or paid subscriptions for this test.
2. Disable capacity adaptation and model substitution. Do not create combos or aliases for Penguin targets. Keep request logging disabled.
3. Create a restricted endpoint API key whose allowlist contains only explicit provider/model IDs, such as `groq/llama-3.1-8b-instant`. Keep one upstream connection per provider for the initial test to reduce hidden account rotations. Use the same upstream provider accounts/keys saved in Penguin so catalog checks match the tested accounts.
4. Copy the **9Router endpoint key**, not an upstream Groq/OpenRouter key, into Penguin's encrypted **9Router restricted endpoint key** field.
5. Once those restrictions are configured, add the exact allowed IDs to Penguin's `.env.local`:

```dotenv
NINE_ROUTER_FREE_ONLY_CONFIRMED=1
NINE_ROUTER_FREE_MODELS=groq/llama-3.1-8b-instant
```

For OpenRouter use `openrouter/<exact-current-model-id>:free`, only if the upstream zero-price catalog and restricted 9Router catalog both list it. Multiple exact IDs use commas. Wildcards, aliases, combos and other provider prefixes are rejected. Restart Penguin after changing these environment settings. Keep 9Router running separately.

Penguin verifies requested targets against both catalogs. It cannot independently audit arbitrary changes inside a separately administered gateway. The confirmation above is your assertion that its restricted key, free upstream accounts and routing settings are correct. If you change those settings, recheck them before testing. Penguin never automatically retries a 9Router inference request. 9Router can make internal upstream attempts; these are not exposed by Penguin's call ledger.

## Run the live comparison

1. Open **AI research team → Compare free AI routes**.
2. Leave the profiles you configured checked. The default includes all five; missing keys/gateways are reported as **NOT_RUN**.
3. Press **Test selected routes live**. This makes a real inference request for each usable profile using the same arithmetic/risk question. It requires no chart research and places no orders.
4. Review responses, model IDs, elapsed time, input/output token usage, failures and uncertain reservations. Elapsed time includes catalog preflight. Each profile uses at most one Penguin inference request, capped at 512 output tokens; FreeRide/9Router can make their own internal attempts.
5. Use **Use … for council** on a completed response to select that profile. Selection is explicit and persists across restarts. It changes neither existing keys nor the budget history. `npm run launch` will start FreeRide on the next launch if you selected it; 9Router still needs its separate terminal.

The arithmetic spot check looks for expected numbers, not a full semantic proof or a measure of trading ability. Judge the actual answer too. A faster successful test does not prove reliability or profitable trading. Repeat sparingly because failed provider requests still consume the shared call allowance and may consume upstream quotas. A timeout/5xx retains its reservation and is not automatically resent.

A missing/free-ineligible catalog or an exhausted Penguin allowance causes **NOT_RUN**, before inference. A rejected or uncertain inference is **FAILED**. A valid completed response with usage is **COMPLETE**. Tests are persisted per workspace, with the five most recent comparisons shown. Switching routers does not reset budgets or bypass quotas.

Free-LLM: https://github.com/nejib1/Free-LLM

no-cost-ai: https://github.com/zebbern/no-cost-ai

Those directories may help find other services later. Their listed providers are not all installed or enabled by these five profiles; many require separate accounts, plan verification, payment cards or different API adapters.
