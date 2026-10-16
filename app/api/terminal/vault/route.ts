import {withAccount} from "@/lib/server/accounts";
import { knowledgeActivity, generateVaultViews, saveAgentMemory, vaultNote, vaultNotes } from "@/lib/server/vault";
import { ownerSession, sameOrigin, workspaceSession } from "@/lib/server/session";
export const runtime = "nodejs";
async function handleGET(request: Request) {
  if (!ownerSession(request)) return Response.json({ error: "Unlock private settings in Connections first" }, { status: 401 });
  try { const id = workspaceSession(request).id, name = new URL(request.url).searchParams.get("name"); return Response.json(name ? vaultNote(id, name) : { notes: vaultNotes(id),activity:await knowledgeActivity(id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Note unavailable or outside this workspace" }, { status: 400 }); }
}
async function handlePOST(request: Request) {
  try { sameOrigin(request); } catch { return Response.json({ error: "Same-origin access required" }, { status: 403 }); }
  if (!ownerSession(request)) return Response.json({ error: "Unlock private settings in Connections first" }, { status: 401 });
  try { const text = await request.text(); if (text.length > 12000) throw new Error("Payload too large"); const data = JSON.parse(text), id = workspaceSession(request).id; if (data.action === "generate") return Response.json(generateVaultViews(id)); if (data.action === "memory") return Response.json(saveAgentMemory(id, data.text)); throw new Error("Unsupported vault action"); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Vault action failed" }, { status: 400 }); }
}

export const GET = withAccount(handleGET);
export const POST = withAccount(handlePOST);
