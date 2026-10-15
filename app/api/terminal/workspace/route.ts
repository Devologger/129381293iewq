import {tradeFeedback,candidateOutcomeVeto} from "@/lib/server/trade-feedback";
import {configureScan,scannerStatus} from "@/lib/server/scanner";
import {withAccount} from "@/lib/server/accounts";
import { closePaper, openPaper } from "@/lib/terminal-engine";
import { contextKey, createLink, updateWorkspace, type Bot } from "@/lib/server/store";
import { sameOrigin, workspaceSession } from "@/lib/server/session";
import { getFeed, validateContext } from "@/lib/server/worker";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET(request: Request) {
  const session = workspaceSession(request, true);
  return Response.json({...session.workspace,scanner:scannerStatus(session.id),feedback:tradeFeedback(session.id)}, { headers: { "Cache-Control": "no-store", ...(session.cookie ? { "Set-Cookie": session.cookie } : {}) } });
}
async function handlePOST(request: Request) {
  try { sameOrigin(request); } catch { return Response.json({ error: "Same-origin access required" }, { status: 403 }); }
  try {
    const session = workspaceSession(request); const text = await request.text();
    if (text.length > 20000) return Response.json({ error: "Payload too large" }, { status: 413 });
    const payload = JSON.parse(text);
    if (payload.action === "scan") return Response.json(configureScan(session.id,payload.context,payload.enabled));
    if (payload.action === "link") return Response.json({ code: createLink(session.id), expiresInSeconds: 600 });
    if (payload.action === "open") {
      validateContext(payload.context); if (!["long", "short"].includes(payload.side)) throw new Error("Invalid side");
      const feed = await getFeed(payload.context);
      return Response.json(updateWorkspace(session.id, ws => ({ ...ws, portfolio: openPaper(ws.portfolio, feed, payload.side, payload.notional) })));
    }
    if (payload.action === "close") {
      const position = session.workspace.portfolio.positions.find(p => p.id === payload.id); if (!position) throw new Error("Position not found");
      const feed = await getFeed({ ...position, source: position.source as "demo" | "exchange", timeframe: position.timeframe || "15m" });
      return Response.json(updateWorkspace(session.id, ws => ({ ...ws, portfolio: closePaper(ws.portfolio, payload.id, feed) })));
    }
    return Response.json(updateWorkspace(session.id, ws => {
      if (payload.action === "engine") { if (typeof payload.paused !== "boolean") throw new Error("Invalid engine state"); return { ...ws, portfolio: { ...ws.portfolio, paused: payload.paused } }; }
      if (payload.action === "watchlist") {
        if (!Array.isArray(payload.symbols) || payload.symbols.length < 1 || payload.symbols.length > 8 || new Set(payload.symbols).size !== payload.symbols.length || !payload.symbols.every((s: unknown) => typeof s === "string" && /^[A-Z0-9]{2,12}$/.test(s))) throw new Error("Use 1–8 unique base symbols"); return { ...ws, watchlist: payload.symbols };
      }
      if (payload.action === "remove-bot" || payload.action === "pause-bot") {
        validateContext(payload.context); const key = contextKey(payload.context);
        return { ...ws, bots: payload.action === "remove-bot" ? ws.bots.filter(b => b.key !== key) : ws.bots.map(b => b.key === key ? { ...b, enabled: false, learning: false, scanning:false } : b) };
      }
      if(payload.action==='acknowledge-feedback'){validateContext(payload.context);if(payload.confirmed!==true)throw new Error('Explicit review acknowledgement required');const key=contextKey(payload.context);return {...ws,bots:ws.bots.map(b=>b.key===key?{...b,enabled:false,feedbackPaused:false,feedbackReason:undefined}:b)};}
      if (payload.action === "candidate") {
        validateContext(payload.context); const key = contextKey(payload.context); const candidate = ws.bots.find(b => b.key === key)?.research?.candidate;
        if (typeof candidate !== "number" || ![.05, .08, .12].includes(candidate)) throw new Error("Run server research and obtain a passing paper candidate first");
        const veto=candidateOutcomeVeto(session.id,payload.context,candidate);if(veto)throw new Error(veto.reason);
        return { ...ws, bots: ws.bots.map(b => b.key === key ? { ...b, tolerance: candidate, research: null } : b) };
      }
      if (payload.action === "automation" || payload.action === "learning") {
        validateContext(payload.context); if (typeof payload.enabled !== "boolean") throw new Error("Invalid automation state");
        if (payload.enabled && (ws.portfolio.paused || payload.context.source !== "exchange")) throw new Error("Enable the paper engine and select exchange data first");
        const key = contextKey(payload.context); const existing = ws.bots.find(b => b.key === key);
        if(payload.action==='automation'&&payload.enabled&&existing?.feedbackPaused)throw new Error("Review and acknowledge the automatic paper-loss pause first");
        if (!existing && ws.bots.length >= 8) throw new Error("Maximum eight configured paper bots");
        const bot: Bot = existing || { ...payload.context, key, enabled: false, learning: false, tolerance: .08, lastBar: 0, research: null, error: null, updatedAt: null };
        const updated = { ...bot, ...(payload.action === "automation" ? { enabled: payload.enabled } : { learning: payload.enabled }), lastBar: payload.enabled ? 0 : bot.lastBar };
        return { ...ws, bots: [...ws.bots.filter(b => b.key !== key), updated] };
      }
      throw new Error("Unsupported workspace action");
    }));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Workspace action failed" }, { status: 400 }); }
}

export const GET = withAccount(handleGET);
export const POST = withAccount(handlePOST);
