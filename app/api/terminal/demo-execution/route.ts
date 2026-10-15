import {demoProtections} from "@/lib/server/demo-protection";
import {withAccount} from "@/lib/server/accounts";
import { cancelDemo, demoAccount, maintainDemoProtection, previewDemo, reconcileDemo, submitDemo } from "@/lib/server/demo-execution";
import { ownerSession, sameOrigin, workspaceSession } from "@/lib/server/session";
import { configureDemoBot, demoBots } from "@/lib/server/demo-bots";
export const runtime = "nodejs";
async function handleGET(request: Request) {
  if (!ownerSession(request)) return Response.json({ error: "Unlock private settings in Connections first" }, { status: 401 });
  try { const id = workspaceSession(request).id; const account=await demoAccount(id);await maintainDemoProtection(id,account.positions);return Response.json({ ...account,protections:demoProtections(id), bots: demoBots(id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Demo account unavailable" }, { status: 502 }); }
}
async function handlePOST(request: Request) {
  try { sameOrigin(request); } catch { return Response.json({ error: "Same-origin access required" }, { status: 403 }); }
  if (!ownerSession(request)) return Response.json({ error: "Unlock private settings in Connections first" }, { status: 401 });
  try {
    const text = await request.text(); if (text.length > 4000) throw new Error("Payload too large");
    const payload = JSON.parse(text), id = workspaceSession(request).id;
    if (payload.action === "bot" && payload.confirmation === "BINANCE DEMO") return Response.json(await configureDemoBot(id, payload));
    if (payload.action === "preview") return Response.json(await previewDemo(id, payload));
    if (typeof payload.id !== "string") throw new Error("Select a demo order first");
    if (payload.action === "submit" && payload.confirmation === "BINANCE DEMO") return Response.json(await submitDemo(id, payload.id));
    if (payload.action === "reconcile") return Response.json(await reconcileDemo(id, payload.id));
    if (payload.action === "cancel" && payload.confirmation === "BINANCE DEMO") return Response.json(await cancelDemo(id, payload.id));
    throw new Error("Explicit Binance demo confirmation required");
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Demo action failed" }, { status: 400 }); }
}

export const GET = withAccount(handleGET);
export const POST = withAccount(handlePOST);
