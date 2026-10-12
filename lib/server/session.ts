import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createWorkspace, keyMaterial, readWorkspace } from "./store.ts";

export function sameOrigin(request: Request) {
  const url = new URL(request.url);
  // Next can construct request.url with localhost even when the browser uses
  // 127.0.0.1. Compare against the actual Host for direct local deployment.
  const allowed = process.env.TERMINAL_PUBLIC_ORIGIN || `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (request.headers.get("origin") !== allowed) throw new Error("A same-origin request is required");
}
function signature(value: string) { return createHmac("sha256", keyMaterial()).update(value).digest("hex"); }
export function signedToken(value: string) { return `${value}.${signature(value)}`; }
export function verifyToken(token: string | undefined) {
  if (!token) return null;
  const index = token.lastIndexOf("."); const value = token.slice(0, index); const sig = token.slice(index + 1);
  if (index < 1 || !/^[a-f\d]{64}$/.test(sig)) return null;
  return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(signature(value), "hex")) ? value : null;
}
function cookie(request: Request, name: string) { return request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="))?.slice(name.length + 1); }
export function cookieHeader(request: Request, name: string, value: string, maxAge: number) {
  const secure = (process.env.TERMINAL_PUBLIC_ORIGIN || request.url).startsWith("https:");
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export function workspaceSession(request: Request, create = false) {
  const verified = verifyToken(cookie(request, "obsidian_workspace"));
  if (verified && /^[a-f\d]{48}$/.test(verified)) {
    try { return { id: verified, workspace: readWorkspace(verified), cookie: null }; } catch { /* Expired/restored storage can lose a workspace. */ }
  }
  if (!create) throw new Error("Load the workspace first");
  const id = randomBytes(24).toString("hex");
  return { id, workspace: createWorkspace(id), cookie: cookieHeader(request, "obsidian_workspace", signedToken(id), 31536000) };
}
export function ownerSession(request: Request) {
  const value = verifyToken(cookie(request, "obsidian_owner"));
  return Boolean(process.env.TERMINAL_ADMIN_PASSWORD && value && /^owner:\d+$/.test(value) && Number(value.slice(6)) > Date.now());
}
export function ownerPasswordMatches(value: string) {
  const expected = process.env.TERMINAL_ADMIN_PASSWORD;
  if (!expected || expected.length < 16 || value.length > 500) return false;
  return timingSafeEqual(createHash("sha256").update(value).digest(), createHash("sha256").update(expected).digest());
}
