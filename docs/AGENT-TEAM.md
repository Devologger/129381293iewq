# Obsidian research council and ECC

The app has a real server-side remote AI agent pipeline, not a simulated team UI:
strategy researcher → independent risk reviewer → vault curator. Each member
receives the authoritative saved research and a bounded discussion from earlier
members. The curator's briefing and every member's response are written to the
private Obsidian workspace. Roles have no shell, code-editing, trading or
exchange tools. Their reviews are advisory; existing deterministic paper
learning remains separate.

## Runtime operation

1. Add a remote free-provider API key (`TEAM_REMOTE_KEY`) privately and unlock Connections.
2. Choose a market/timeframe and run Strategy Lab research.
3. Open AI research team. Load budget & history, then convene the team.
4. Read all three reviews and the generated Obsidian note.
5. Optionally enable scheduled reviews (minimum 60 minutes). The schedule is
   persistent and the server must remain running. It uses the selected saved
   research; enable bounded paper learning separately to refresh that evidence.
6. Premium review is unavailable in free mode; explicit paid mode requires both configured escalation prices/model and the
   explicit allow switch. Only the risk reviewer escalates when requested;
   schedules never do so automatically.

Local navigation, voice status, indicator computation, Python research and the
paper worker use no LLM tokens. Unknown voice questions and `run team` invoke
the council. Each uncached standard briefing usually makes three API calls.
Cache hits reuse a complete briefing for identical evidence/question/models
for six hours; new research, journal evidence or questions invalidate it.

## Persistent budget and accounting

The SQLite `ai_calls` table stores per-attempt reservations, model, UTC day,
workspace/run/role, input/output/cached token usage, charged estimate and status.
Limits are shared across all workspaces using the server's API credential.
Free mode defaults to nine attempts/day and 2000 output tokens per call; it has no paid fallback. Explicit paid mode retains $1/day and $0.20/run accounting limits. See [current free-routing instructions](FREE-AI-AND-STRATEGIES.md).

For explicit paid mode only, rates default to conservative estimates of $1/million input tokens and
$5/million output tokens, with cached input charged at $1/million. Verify and
set rates for your actual model before use. These are accounting estimates,
not live pricing or provider invoices. Price ceilings only bound money if the
configured rates cover actual provider prices. Provider spending limits are
an additional independent control.

A transaction reserves before network access, using UTF-8 byte length plus
framing overhead and the output cap as a conservative token bound. Successful
usage replaces the reservation with calculated cost, including output reasoning
tokens reported by the provider. Unknown/time-out/5xx responses retain their
reservation and are not retried. Only explicit HTTP 429 rejection permits one
retry, with at most five seconds delay and a fresh counted reservation. A daily
call cap still counts rejected attempts. Partial failures remain in history.
The budget resets on UTC day boundaries; this is independent of browser timezone.

Configuration in private environment settings or `.env.local`:

```dotenv
TEAM_DAILY_BUDGET_USD=1
TEAM_RUN_BUDGET_USD=0.20
TEAM_DAILY_CALL_LIMIT=9
TEAM_INPUT_USD_PER_MILLION=1
TEAM_OUTPUT_USD_PER_MILLION=5
TEAM_CACHED_INPUT_USD_PER_MILLION=1
# Optional premium model: verify both price values before configuring.
TEAM_ESCALATION_MODEL=
TEAM_ESCALATION_INPUT_USD_PER_MILLION=
TEAM_ESCALATION_OUTPUT_USD_PER_MILLION=
```

The old analyst endpoint now uses this same council/accounting path; it cannot
bypass the budget. No raw candles are sent per tick to a swarm of agents.

## ECC integration for Codex development

ECC is a development-agent framework, not an exchange execution engine. This
project supplies `.codex/config.toml` and three specialist role configurations
following its Codex role pattern, with inherited models, three threads and
read-only reviewers. The application pipeline remains self-contained and does
not require an ECC process or plugin to run. Codex development-session costs
are separate from the application's API accounting; this app cannot meter
Codex subscription/CLI usage.

Reviewed upstream: https://github.com/affaan-m/everything-claude-code
at commit b92f181b3b748d1abbc2afd94af6aa7d8c8fca29. Role instructions here are
project-specific. We have not installed a global plugin, trusted external
hooks, or copied ECC's broad MCP configuration into your environment.

For the full ECC plugin, the reviewed upstream README documents native Codex
installation (requires a Codex version with plugin commands):

```bash
codex plugin marketplace add affaan-m/ECC
codex plugin add ecc@ecc
codex plugin list --json
```

Then follow upstream `$configure-ecc`. Review hooks through Codex's own trust
flow. Keep the project role configuration, use only needed tools, and avoid
combining native plugin installation with its deprecated legacy sync installer.
This is an optional user-side development setup, not an app runtime dependency.
