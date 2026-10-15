import {withAccount} from "@/lib/server/accounts";
import { runTeam } from "@/lib/server/agent-team";
import { ownerSession, sameOrigin, workspaceSession } from "@/lib/server/session";
export const runtime = "nodejs";
// Compatibility endpoint: every AI request shares the persistent team budget.
async function handlePOST(request: Request) {
  try { sameOrigin(request); } catch { return Response.json({ error: "Same-origin access required" }, { status: 403 }); }
  if (!ownerSession(request)) return Response.json({ error: "Unlock private settings in Connections first" }, { status: 401 });
  try {
    const text = await request.text(); if (text.length > 4000) throw new Error("Payload too large");
    const data = JSON.parse(text); if (typeof data.contextKey !== "string") throw new Error("Select a researched market first");
    const run = await runTeam(workspaceSession(request).id, data.contextKey);
    if (run.status !== "COMPLETE") return Response.json({ error: run.error }, { status: 502 });
    return Response.json({ note: run.messages.at(-1)?.text, advisory_only: true, run });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Team unavailable" }, { status: 400 }); }
}

export const POST = withAccount(handlePOST);
