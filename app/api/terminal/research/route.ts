import { runResearch } from "@/lib/server/research";
import { getFeed, validateContext } from "@/lib/server/worker";
import { contextKey, updateWorkspace, type Bot } from "@/lib/server/store";
import { sameOrigin, workspaceSession } from "@/lib/server/session";
import { saveVaultNote } from "@/lib/server/vault";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 250000) return Response.json({ error: "Payload too large" }, { status: 413 });
  try {
    const data = JSON.parse(body);
    if (![.05, .08, .12].includes(data.tolerance ?? .08)) throw new Error("Unsupported tolerance");
    if (data.context) {
      sameOrigin(request); validateContext(data.context); const session = workspaceSession(request);
      const feed = await getFeed(data.context);
      const report = await runResearch(feed.candles, data.tolerance ?? .08, false);
      const key = contextKey(data.context);
      const workspace = updateWorkspace(session.id, ws => {
        const current = ws.bots.find(b => b.key === key);
        if (!current && ws.bots.length >= 8) return ws;
        const bot: Bot = { ...data.context, key, enabled: false, learning: false, lastBar: 0, error: null, updatedAt: null, ...current, research: report, tolerance: report.active_tolerance };
        return { ...ws, bots: [...ws.bots.filter(b => b.key !== key), bot] };
      });
      saveVaultNote(session.id, feed, report, workspace.portfolio);
      return Response.json(report);
    }
    if (!Array.isArray(data.candles) || data.candles.length < 120 || data.candles.length > 500) throw new Error("Provide 120–500 closed candles");
    return Response.json(await runResearch(data.candles, data.tolerance ?? .08, data.auto_apply === true));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Research failed" }, { status: 422 }); }
}
