import { saveDailyCallLimit, diagnoseProvider, budgetStatus, researchContexts, runTeam, saveTeamSettings, teamRuns, teamSettings, TEAM_ROLES } from "@/lib/server/agent-team";
import { ownerSession, sameOrigin, workspaceSession } from "@/lib/server/session";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!ownerSession(request)) return Response.json({ error: "Unlock private settings in Connections first" }, { status: 401 });
  try { const id = workspaceSession(request).id; return Response.json({ budget: budgetStatus(), runs: teamRuns(id), settings: teamSettings(id), contexts: researchContexts(id), roles: TEAM_ROLES }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Team unavailable" }, { status: 400 }); }
}
export async function POST(request: Request) {
  try { sameOrigin(request); } catch { return Response.json({ error: "Same-origin access required" }, { status: 403 }); }
  if (!ownerSession(request)) return Response.json({ error: "Unlock private settings in Connections first" }, { status: 401 });
  try {
    const text = await request.text(); if (text.length > 5000) throw new Error("Payload too large");
    const data = JSON.parse(text), id = workspaceSession(request).id;
    if (data.action === "budget") return Response.json({ budget: saveDailyCallLimit(data.dailyCalls), message: "Daily allowance saved. Existing usage and uncertain reservations are preserved." });
    if (data.action === "enable") {
      await diagnoseProvider();
      const run = await runTeam(id, data.contextKey, data.question);
      if (run.status === "COMPLETE") saveTeamSettings(id, { enabled: true, contextKey: data.contextKey, intervalMinutes: 480, allowEscalation: false });
      return Response.json({ ...run, ...(run.status === "COMPLETE" ? {message: "Council briefing complete. Automatic reviews enabled every 8 hours; daily limits and cached evidence still apply."} : {}) });
    }
    if (data.action === "diagnose") return Response.json(await diagnoseProvider());
    if (data.action === "settings") return Response.json(saveTeamSettings(id, data));
    if (data.action === "run" && typeof data.contextKey === "string" && (data.escalation === undefined || typeof data.escalation === "boolean")) return Response.json(await runTeam(id, data.contextKey, data.question, data.escalation === true));
    throw new Error("Unsupported team action");
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Team action failed" }, { status: 400 }); }
}
