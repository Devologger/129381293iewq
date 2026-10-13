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

If Apodex used 1,911 reasoning tokens out of a 2,000-token cap, almost no room remained for the visible answer. The managed gateway now defaults to concise chat routing: it excludes models advertising reasoning controls and known reasoning model families. This is a selection heuristic, not a guarantee about every provider model. If no eligible free model is available, the run stops or uses the eligible Groq fallback within the existing two-attempt limit; it never switches to paid inference.

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
