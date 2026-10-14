# Penguin + FreeRide on Windows

This integration runs the real [FreeRideV3](https://github.com/Shaivpidadi/FreeRideV3) router, pinned to reviewed revision `3811c8e29ef41d96eea2fe37d0219c1790e530b1` (0.4.0a25). It runs a small gateway on your laptop; **AI inference stays with remote providers**. No local model, Ollama, or OpenAI billing is required.

## 1. Update the app

In PowerShell, change into the folder where you cloned this repository:

```powershell
git pull origin main
npm.cmd ci
npm.cmd run setup:windows
```

The setup helper keeps your saved keys and settings. Python 3.14 is supported by the helper; it writes the Python path into `.env.local`. If you already configured the full Python path, keep it. Do not delete `.runtime`: it contains your encrypted connections and trading ledger.

## 2. Configure private settings

Open `.env.local` privately:

```powershell
notepad .env.local
```

Set these values, with each name appearing **once**:

```dotenv
TEAM_AI_PROVIDER=freeride
TEAM_REMOTE_MODEL=auto-free
TEAM_DAILY_CALL_LIMIT=9
FREERIDE_GROQ_FREE_CONFIRMED=0
```

You do not need a gateway URL or gateway key: Penguin manages its own private loopback address and authentication. `TEAM_REMOTE_MODEL` is ignored in FreeRide mode; routing uses `auto` with verified free models.

Your existing OpenRouter key saved in **Connections → OpenRouter / free-provider API key** is reused. You don't need to paste it again or enter it in chat. If the key is stored as `TEAM_REMOTE_KEY` in `.env.local`, that value takes precedence over Connections.

For optional fallback, create a Groq key from https://console.groq.com/keys, confirm that the account is on its free plan, add it privately in **Connections → Groq free-tier key**, then set `FREERIDE_GROQ_FREE_CONFIRMED=1`. Restart the gateway after changing either provider's key. No extra OpenRouter accounts or rotating account keys are configured.

## 3. Install FreeRide once

```powershell
npm.cmd run freeride:install
```

This creates a separate Python virtual environment inside the ignored `.runtime/freeride-venv` directory and installs the pinned upstream source. Internet access to GitHub and PyPI is needed. It does not install a model or change your global Python packages. If GitHub is blocked, fix the network restriction rather than disabling TLS verification.

## 4. Start both services

In the first PowerShell window, in the repository folder:

```powershell
npm.cmd run freeride:start
```

Leave that window open. The gateway binds only to `127.0.0.1:11343`, with private authentication managed by Penguin. Do not expose this port publicly.

In a second PowerShell window, in the same folder:

```powershell
npm.cmd run build
npm.cmd start
```

Open `http://localhost:3000` in Edge or Chrome. Unlock Connections using your existing settings password. Open **Research council → Check AI connection**. It should report FreeRide reachable and the configured remote providers. This check makes no inference request.

Run strategy research on your chosen chart, then use **Convene research team**. Completed briefings show the actual responding provider/model and are saved in your Obsidian vault. FreeRide needs to remain running for scheduled AI reviews; Penguin's deterministic research and paper engine work without it.

## What is included

The managed gateway uses actual FreeRide model discovery, provider failover, key cooldowns and response metadata. Penguin adds private authentication, strict OpenRouter zero-price checks, an output cap, and a maximum of two upstream inference attempts per gateway request. It disables upstream telemetry and keeps its state in `.runtime/freeride`.

**Currently integrated providers: OpenRouter and optional Groq.** The other providers in FreeRide's table are not enabled by this adapter. NVIDIA credits and Hugging Face allowances are not unlimited free inference; adding a provider requires its own verified free-account and price gates. Ollama is intentionally excluded because you requested remote inference.

Penguin's persistent daily call limit counts gateway requests, not FreeRide's hidden upstream attempts. With nine requests/day and two attempts/request, the maximum is eighteen upstream inference attempts/day. Three successful requests normally complete one council run. Successful token accounting uses the final upstream response; rejected/uncertain attempts can lack token receipts. No paid escalation is available in FreeRide mode. A provider reporting a charge blocks further gateway requests; a zero-dollar display is not proof that inference succeeded or a provider invoice.

This managed endpoint supports Penguin's bounded non-streaming research council. Upstream FreeRide has broader CLI/streaming integrations; those routes are deliberately disabled in this adapter and aren't advertised as Codex CLI compatibility.

## OpenRouter HTTP 403

A router cannot guarantee removal of a 403. The updated app distinguishes provider privacy settings, regional restrictions, authentication and generic access denial without logging raw provider bodies or keys.

1. First use **Check AI connection** in direct mode (`TEAM_AI_PROVIDER=openrouter_free`) and restart Penguin. Metadata acceptance only proves the key endpoint works.
2. If a council run identifies a privacy policy restriction, inspect https://openrouter.ai/settings/privacy and select an accessible `:free` model. Enabling provider data sharing is your choice.
3. For a region/account restriction, check the provider console. Do not use routing to bypass it.
4. Switch back to `freeride`, restart Penguin, and keep the gateway running. An independently eligible Groq free account can provide fallback after an explicit rejection. Unknown/time-out/5xx inference outcomes never cascade automatically.

Do not paste keys into chat. Remove the duplicate `TEAM_DAILY_CALL_LIMIT` line from your earlier configuration: keep only `TEAM_DAILY_CALL_LIMIT=9`.

## Incomplete AI answer or Groq absent from the provider list

Update the repository, rebuild Penguin, and restart **both** services after changing settings. The council now requests a complete review of at most 220 words, with a default output allowance of 2000 tokens. Provider reasoning can consume that allowance before visible text is returned. `TEAM_MAX_OUTPUT_TOKENS` is configurable from 256 to 4000, and the managed gateway accepts at most 4000. A truncated or empty answer remains a failed review; its usage is recorded and it is never automatically retried or treated as a completed strategy evaluation. The error now reports model, output limit and available token counts, without exposing reasoning traces.

```dotenv
TEAM_AI_PROVIDER=freeride
TEAM_MAX_OUTPUT_TOKENS=2000
FREERIDE_GROQ_FREE_CONFIRMED=1
```

Set the Groq confirmation only after verifying your account's free plan. Save the key in **Connections → Groq free-tier key**, not the OpenRouter field. **Check AI connection** now distinguishes a missing Groq key, missing free-plan confirmation, and a gateway that needs restarting. The gateway's startup prints key **presence only**, never key values. If you save a key after starting the gateway, restart it; keys are loaded at startup. If two project copies exist, both terminals must use the same project folder and `TERMINAL_DATA_DIR`.

If the new error explicitly reports output-limit exhaustion, you can increase `TEAM_MAX_OUTPUT_TOKENS` to 4000 and restart Penguin; larger answers consume more free quota. Do not repeatedly click Run: failed attempts still count toward the daily limit.

## Updating after an output-limit failure

If Apodex used 1,911 reasoning tokens out of a 2,000-token cap, almost no room remained for the visible answer. The managed gateway now defaults to concise chat routing: it excludes known reasoning-heavy model families. Models offering optional reasoning remain eligible with reasoning disabled. This is a selection heuristic, not a guarantee about every provider model. If no eligible free model is available, the run stops or uses the eligible Groq fallback within the existing two-attempt limit; it never switches to paid inference.

Stop both PowerShell processes with Ctrl+C. In your Penguin repository folder:

```powershell
git pull origin main
npm.cmd run build
```

In `.env.local`, keep one entry for each setting (remove duplicates):

```dotenv
TEAM_AI_PROVIDER=freeride
TEAM_MAX_OUTPUT_TOKENS=2000
FREERIDE_ALLOW_REASONING_MODELS=0
```

Keep your existing keys private and unchanged. If you enabled Groq on its free plan, retain `FREERIDE_GROQ_FREE_CONFIRMED=1`. Start `npm.cmd run freeride:start` in one PowerShell window and `npm.cmd start` in a second. You do not need to reinstall FreeRide for this routing update. Check AI connection should now report `concise-chat` routing. Then run the council once. Earlier failed calls still count toward the UTC daily allowance.

Optional: `FREERIDE_OPENROUTER_MODEL` pins an exact OpenRouter model ID, but the model must still pass the zero-price, context and reasoning filters. Leave it blank for automatic selection. Set `FREERIDE_ALLOW_REASONING_MODELS=1` only if you deliberately want reasoning models back; increasing the output cap alone may still produce an incomplete response.

## Cinematic voice and mobile controls

Open **Cinematic JARVIS** from navigation, the phone's JARVIS dock button, or the voice console's **Cinematic view** link. The dedicated route is `/jarvis`; its Fullscreen button also hides browser chrome where supported. Animated orbit rings, stars and an audio-reactive core accompany real selected-market and paper-account status. Press **Start microphone** explicitly to listen. **Stop microphone** or closing the view releases the microphone. Voices are your browser's installed speech voices, with a British English preference; this is not the film actor's voice. Browser recognition may require an Internet connection and a secure browser context. OS reduced-motion settings disable ambient animation.

On phones, the bottom dock exposes Home, Markets, JARVIS, Team and More; More opens all workspace views. POC research results remain available under Strategy explorer.

## One-command startup and one-button council

After pulling this update and running `npm.cmd run build`, use **one PowerShell window**:

```powershell
npm.cmd run launch
```

This starts the managed FreeRide gateway when enabled and eligible keys exist, waits for authenticated readiness, then starts Penguin. An already healthy authenticated gateway is reused. With no AI keys, paper/research starts and Connections explains how to add them privately. FreeRide installation is still a one-time prerequisite (`npm.cmd run freeride:install`). Ctrl+C stops only processes this launcher started. Do not run a second Penguin process on the same port. If an old separately started FreeRide process is running, stop it before launching to load new settings.

In **Research council**, the allowance card now shows remaining calls, full three-agent runs available, and the reset time in your browser's timezone. Your error means the application's shared ledger reached its configured limit, even if the provider itself has quota remaining. Failed/incomplete provider requests still consume calls. The old default is nine calls/day (three successful council runs).

To continue today, set **Daily call allowance** to a value you choose (for example 30) and click **Save daily allowance**. This owner-only setting persists across restarts and overrides `TEAM_DAILY_CALL_LIMIT`; it does not erase usage, clear uncertain reservations, change dollar budgets, buy credits or raise provider quotas. Thirty gateway calls can mean up to sixty upstream attempts. Alternatively wait until UTC midnight; the reset card displays your local time. A fresh council run requires at least three remaining calls before inference starts. Atomic per-call spending gates still apply.

After strategy research exists for the selected market and Connections is unlocked, **Start council & auto reviews** checks the provider, runs all three agents, saves the briefing, then enables reviews every eight hours only when the first run completes successfully. Cached evidence and shared budgets continue to apply. Pause scheduled team stops future reviews. This button enables research, not exchange trading.

In JARVIS, enable **Interface sounds** for locally generated startup/listening, completion and stop cues. Sounds use browser Web Audio, require a user gesture, and make no network request or AI call. Spoken replies still use your browser voices. `alexberardi/jarvis-admin` was inspected: it is an AGPL-licensed administration console requiring separate Jarvis services, not a bundled film voice or sound pack. Penguin's cues are independently generated; its code/assets were not imported.

## Reachable but no usable model/key

Update Penguin, stop both old processes, rebuild and use `npm.cmd run launch`. The revised **Check AI connection** checks provider catalogs as well as gateway reachability, without inference. It reports each provider separately:

- **Eligible free models:** catalog checks passed; this still does not prove an inference request will succeed.
- **Key cooling down:** wait for the reported seconds. Cooldowns persist across restarts; they are not erased to bypass quotas.
- **Catalog access rejected:** check that provider's key/account permissions and privacy restrictions privately.
- **No eligible models:** remove an unavailable `FREERIDE_OPENROUTER_MODEL` pin, or use another eligible configured provider.
- **Catalog unavailable/rate limited:** check gateway network access or wait for the provider quota reset.

The earlier filter incorrectly excluded every model advertising optional reasoning. Those models now remain eligible, with OpenRouter `reasoning.enabled=false`; known reasoning-heavy families remain excluded by default. Explicit no-inference gateway failures are rejected locally, rather than marked as uncertain inference. Previous unknown ledger entries remain preserved. FreeRide failure messages cannot establish which account restriction exists without this readiness check.

The council dashboard now uses separate allowance/reset/schedule cards, full-width mobile inputs, a primary start button, and collapsible advanced controls/history. Daily allowance inputs initially load the saved value; premium controls appear only in explicit paid mode. Expand **Allowance, schedule & advanced controls** for one-off runs and limits.

## Catalog works, but inference returns 503

The gateway now uses separate timeouts: 10 seconds for catalog access and 45 seconds for upstream inference. Catalog results are cached for 60 seconds; Penguin allows 90 seconds for the managed request. An earlier shared 10-second timeout could cut off inference. True timeouts/5xx still retain uncertain reservations and never trigger an automatic resend.

FreeRide can wrap explicit upstream failures in HTTP503. The adapter now preserves sanitized 400/401/403/404/429 rejection categories rather than reporting all of them as uncertain 503 outcomes. Raw provider bodies and keys are never shown. If the new message identifies parameters, authentication, privacy, model availability or quota, follow that specific cause; a genuine upstream 5xx still requires waiting/checking provider status.

On a user-confirmed Groq free plan, the native free-catalog GPT-OSS 20B/120B IDs are now eligible with `reasoning_effort=low`. Compound agents remain excluded, the context gate and output cap remain enforced, and there is no OpenAI API billing or paid fallback. Low reasoning does not eliminate all reasoning tokens, so truncation is still possible. Unknown/new model IDs are not blindly accepted. Restart the old gateway after pulling/rebuilding; no reinstall or allowance reset is required.

## Recommended simple path: direct free cloud

The new direct router avoids the FreeRide process and native model resolver. It uses your existing encrypted Groq/OpenRouter keys, live catalog eligibility, short catalog caching and persistent per-model cooldowns. There are at most two inference attempts per role; every outbound attempt uses Penguin's shared atomic ledger. An explicit 404 cools that model for 15 minutes and tries another eligible model. Authentication/privacy/quota failures may try the other provider. Timeouts/5xx/unknown outcomes are not resent. Positive/unknown OpenRouter pricing is rejected; Groq requires the same confirmed free-plan switch and an exact known chat-model allowlist. Paid OpenAI and local inference are never automatic fallbacks.

1. Stop old processes, `git pull origin main`, `npm.cmd run build`, then `npm.cmd run launch`.
2. Open **Settings** (`/settings`) and unlock it with your existing admin password. Click **Use direct free cloud**. Saved keys and the daily allowance are reused; do not paste keys in chat.
3. Stop/restart `npm.cmd run launch` once. The saved router choice takes precedence over `.env.local`, so it now starts Penguin alone, with no FreeRide service needed.
4. On the desk choose your exchange/source and **Prepare strategy evidence**. Open **AI trading team** and **Start council & auto reviews**, or tell JARVIS **start team**. Its first successful briefing enables the bounded schedule and writes Obsidian memory.

FreeRide remains an optional compatibility path; the direct router is the recommended way out of repeated retired-model errors. A catalog pass still cannot prove your account has inference access. The UI labels paper, demo and sample data separately; closed-bar paper P&L is not tick-level P&L. Main desk **Binance demo** polls authenticated positions/open orders/journal every 15 seconds while visible. Demo realized income is not imported and is not invented. Real-money execution is still unavailable; the guarded execution desk uses demo keys and explicit previews/confirmation.

The three bounded AI roles are chart analyst/trader, risk reviewer and execution officer/vault curator. Execution readiness is reviewed against actual paper positions and demo order evidence; the deterministic execution workers enforce order limits and reconciliation. JARVIS coordinates reviews, navigation and paper pause/resume. AI roles do not independently submit orders or deploy code. Obsidian retrieves strategy/learning notes, not neural-model weight training.

## Discord alerts and optional Jarvis voice

Create a webhook in your private Discord channel's Integrations settings. In Penguin Settings save it as **DISCORD_WEBHOOK_URL** (encrypted), enable alerts for this workspace and optionally send a test. The Public Key is still used for incoming signed slash commands; it cannot send outgoing messages. Alerts report council failures, worker failures, closed paper losses and monitored Binance demo unrealized losses/errors. Demo risk alerts are deduplicated hourly per symbol; paper/council events are deduplicated by event identity. Delivery failures/uncertainty are recorded and are not automatically resent. No automated voice calls or DMs are implemented. Alerts require the server running and a valid channel webhook. Keep webhook URLs private.

The linked Jarvis admin's speech engine is [alexberardi/jarvis-tts](https://github.com/alexberardi/jarvis-tts): Piper (`en_GB-alan-low`) or Kokoro, with Jarvis app-to-app authentication. No voice assets or AGPL service code were copied into Penguin. Browser voice and synthesized interface sounds work immediately; no film actor voice is bundled.

If you already have that TTS service hosted remotely, configure `JARVIS_TTS_URL` to its HTTPS `/speak` endpoint and `JARVIS_TTS_APP_ID=penguin` (or your registered Jarvis app ID). Save **JARVIS_TTS_APP_KEY** privately in Settings and register that app with the Jarvis auth service. Penguin forwards the documented `X-Jarvis-App-Id`/`X-Jarvis-App-Key` headers, requests bounded WAV audio and exposes **Remote Jarvis voice** in the assistant. Owner unlock is required. Browser speech is the fallback if the remote service is unavailable. Hosting Jarvis TTS is optional and separate; no local AI model or TTS stack is installed automatically. This connection was not tested against a real hosted Jarvis service.

## Sidebar scrolling and router identification

Desktop navigation scrolls independently on short screens and supports wheel, keyboard and focus navigation. The phone More menu is also height bounded and scrollable.

Old `.env.local` files with `TEAM_AI_PROVIDER=freeride` now select direct free cloud unless an explicit saved routing preference exists or `TEAM_KEEP_LEGACY_GATEWAY=1` requests compatibility mode. This avoids keeping upgraded installations on the old gateway by accident. The council displays its active router and new history entries record which router actually ran. An owner-saved direct-cloud choice still takes precedence. No keys, allowance or uncertain accounting entries are cleared.

A genuine upstream503 does not prove a request was rejected; it stops without resending and retains accounting. Direct mode cools all routes for that provider for60 seconds. A later manually requested review can select another eligible provider. If neither provider is available, the review still stops without paid fallback. The new error identifies the router and attempted model/status instead of suggesting gateway startup for every503. Old historical errors remain unchanged. Stop the old app/gateway, pull, rebuild and use `npm.cmd run launch` before checking the new router label.

## Groq429 followed by OpenRouter privacy404

These are different provider restrictions. The council now sends compact evidence (held-out metrics, costs, POC context and execution state), omitting bulky profile bins/walk-forward arrays and bounding memory/discussion excerpts. Full research remains in the vault/dashboard; the cache still includes full memory so edits invalidate prior briefings.

After an explicit Groq429, a reported Retry-After or token-reset time up to30 seconds permits one wait and one final retry. Longer/missing reset times can try another eligible Groq model before OpenRouter. A role never exceeds two inference attempts; both attempts count, and timeouts/5xx are never resent. Reported reset times appear in failure details. Daily/account-wide exhaustion may still block every Groq model; this is not bypassed.

In OpenRouter Settings > Privacy, enable **Filter the model catalog for API keys** if you want authenticated model discovery to reflect your key's allowed models. This does not relax data-sharing restrictions. Penguin already authenticates its direct catalog request. If your privacy policy leaves no allowed free endpoints, use Groq or consciously choose a provider/model/privacy policy you accept. Do not enable public prompt publishing just to make a request succeed. Keep keys private. Restart after this code update; catalog changes can take up to60 seconds to refresh.
