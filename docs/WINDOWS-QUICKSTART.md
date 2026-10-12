# Windows quick start: Python 3.14 and remote free AI

Your Node 26 meets the project's >=24 requirement. Python 3.14 can run this
standard-library research code. Cloud checks were run on Node 24/Python 3.12;
run the checks below on your own Windows machine as well. Do not install
Python 3.12 just because the previous example used `py -3.12`.

## Get or update the app

In PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\Trading" | Out-Null
Set-Location "$HOME\Trading"
git clone https://github.com/Devologger/129381293iewq.git
Set-Location .\129381293iewq
```

If already cloned, enter that checkout and use `git pull --ff-only origin main`
instead. Stop an existing server with Ctrl+C before updating/building.

## Configure Python automatically

```powershell
npm.cmd run setup:windows
notepad .env.local
```

The helper preserves private API keys, selects a supported installed Python
from the `py` launcher (including 3.14), and writes its executable path into
`TERMINAL_PYTHON`. If the owner password is missing, it generates one privately
in the file. Read that password in Notepad; do not paste it into chat.

Check these settings in the file:

```dotenv
TEAM_AI_PROVIDER=openrouter_free
TEAM_REMOTE_MODEL=auto-free
TEAM_DAILY_CALL_LIMIT=9
```

Leave `TRADE_AI_KEY` blank. Leave `TERMINAL_PUBLIC_ORIGIN` blank for laptop-
only use. Existing saved OpenAI keys are not used in this free-provider mode.

If configuring manually, run:

```powershell
py -3.14 -c "import sys; print(sys.executable)"
```

Copy that executable path into a quoted `TERMINAL_PYTHON` line in `.env.local`;
use forward slashes. It must be an executable path, not `py -3.14` as one string.
Set your own `TERMINAL_ADMIN_PASSWORD` of at least 16 characters if needed.

## Install, check, start

```powershell
npm.cmd ci
npm.cmd test
py -3.14 -m unittest discover -s tests -p "test_*.py"
npm.cmd run build
npm.cmd start -- --hostname 127.0.0.1 --port 3000
```

On your laptop, enter `http://127.0.0.1:3000/terminal` in Chrome. Keep that
address and browser profile consistent so your workspace cookie is retained.
Keep the server window open. The application stops when the laptop sleeps
or the process exits; demo protection is server-side monitoring, not exchange-
side protective orders. Manage open demo positions before shutting down.

## Connect remote free inference

1. Create a free-provider account/key at https://openrouter.ai/keys. Verify
   your current free tier and leave paid usage disabled. Do not add funds just
   to use this configuration.
2. Open Connections and unlock it with your private settings password.
3. Select **Free-tier AI provider API key**, enter your key there, and save.
4. Choose an exchange/symbol/timeframe in Market workspace.
5. Run bounded research in Strategy Lab, or compare hypotheses in Strategy explorer.
6. Open AI research team, choose the saved evidence, and convene the council.

Inference runs on remote providers. No Ollama, local model download, local GPU
or second gateway is required. Nine daily provider attempts permit at most
three uncached three-member briefings, fewer when retries/failures occur.
Identical evidence/questions are cached; free-tier limits can change and the
app pauses instead of using paid fallback.

## Volume profile and memory

Open Strategy explorer, set an optional date range and run the comparison.
Read POC/VAL/VAH, high-volume zones, training/validation/final-test/stress results
and the data coverage. Samples are synthetic; their results cannot prove an edge.

Open `obsidian-vault` as your Obsidian vault. Reports, the demo order journal,
`Learning Memory.md` and council notes appear under `Research/<workspace-id>`.
You can add `Agent Memory.md` there for your own curated observations.
The council retrieves these notes on future reviews; no LLM weights are trained.

## Common fixes

- Python missing: use `py --list` and rerun `setup:windows`; your installed 3.14 is usable.
- `npm.ps1` blocked: use `npm.cmd` as above; no execution-policy change is needed.
- No free model passes checks: wait for cooldown/quota reset and check the provider's catalog/account. Never replace the model with a paid ID to get past the guard.
- Provider HTTP 429: quota/rate limit; the router makes at most one verified-free fallback.
- Binance HTTP 451: location restriction, not a wrong password. The cloud instance received this response; your laptop may differ.
- AI settings locked: unlock again after the one-hour owner session expires.
- New configuration not reflected: Ctrl+C, then restart; rebuild after source updates.

Read [free AI and research details](FREE-AI-AND-STRATEGIES.md) and the main
[README](../README.md) for Binance demo, Discord, voice and persistence.
