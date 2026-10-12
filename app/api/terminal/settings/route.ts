import { CREDENTIAL_NAMES, credential, saveCredential } from "@/lib/server/store";
import { cookieHeader, ownerPasswordMatches, ownerSession, sameOrigin, signedToken } from "@/lib/server/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let failures = 0; let lockedUntil = 0;

export async function GET(request: Request) {
  return Response.json({ adminConfigured: (process.env.TERMINAL_ADMIN_PASSWORD?.length || 0) >= 16, unlocked: ownerSession(request),
    credentials: CREDENTIAL_NAMES.map(name => ({ name, configured: Boolean(credential(name)), managedByEnvironment: Boolean(process.env[name]) })) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try { sameOrigin(request); } catch { return Response.json({ error: "Same-origin access required" }, { status: 403 }); }
  const origin = process.env.TERMINAL_PUBLIC_ORIGIN || new URL(request.url).origin;
  if (!origin.startsWith("https:") && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) return Response.json({ error: "Use HTTPS to configure private integrations" }, { status: 426 });
  const text = await request.text();
  if (text.length > 8192) return Response.json({ error: "Payload too large" }, { status: 413 });
  try {
    const data = JSON.parse(text);
    if (data.action === "login") {
      if ((process.env.TERMINAL_ADMIN_PASSWORD?.length || 0) < 16) return Response.json({ error: "Private settings can be configured later. Set TERMINAL_ADMIN_PASSWORD (16+ characters) in environment settings or .env.local to unlock them." }, { status: 503 });
      if (lockedUntil > Date.now()) return Response.json({ error: "Too many attempts. Retry in one minute." }, { status: 429 });
      if (typeof data.password !== "string" || !ownerPasswordMatches(data.password)) { failures++; if (failures >= 5) { lockedUntil = Date.now() + 60000; failures = 0; } return Response.json({ error: "Incorrect settings password" }, { status: 401 }); }
      failures = 0;
      return Response.json({ unlocked: true }, { headers: { "Set-Cookie": cookieHeader(request, "obsidian_owner", signedToken(`owner:${Date.now() + 3600000}`), 3600) } });
    }
    if (!ownerSession(request)) return Response.json({ error: "Unlock private settings first" }, { status: 401 });
    if (data.action === "logout") return Response.json({ unlocked: false }, { headers: { "Set-Cookie": cookieHeader(request, "obsidian_owner", "", 0) } });
    if (data.action !== "save" || typeof data.name !== "string" || typeof data.value !== "string") throw new Error("Unsupported settings action");
    saveCredential(data.name, data.value);
    return Response.json({ saved: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Settings could not be saved" }, { status: 400 }); }
}
