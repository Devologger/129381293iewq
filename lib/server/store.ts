import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { INITIAL_PORTFOLIO, type Portfolio, type Research } from "../terminal-engine.ts";

export type Context = { exchange: string; market: string; symbol: string; timeframe: string; source: "demo" | "exchange" };
export type Bot = Context & { key: string; enabled: boolean; learning: boolean; lastBar: number; tolerance: number; research: Research | null; error: string | null; updatedAt: string | null };
export type Workspace = { portfolio: Portfolio; bots: Bot[]; watchlist: string[]; lastWorkerAt: string | null; workerError: string | null };
const state = globalThis as unknown as { obsidianDatabases?: Map<string, DatabaseSync> };

export function dataDirectory() { return resolve(process.env.TERMINAL_DATA_DIR || ".runtime"); }
export function keyMaterial() {
  mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
  const file = join(dataDirectory(), "storage.key");
  try { return readFileSync(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try { writeFileSync(file, randomBytes(32), { mode: 0o600, flag: "wx" }); }
    catch (writeError) { if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError; }
    return readFileSync(file);
  }
}
export function db() {
  const directory = dataDirectory();
  state.obsidianDatabases ||= new Map();
  const existing = state.obsidianDatabases.get(directory);
  if (existing) return existing;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(join(directory, "workspace.sqlite"));
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials (name TEXT PRIMARY KEY, encrypted TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS links (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS discord_accounts (user_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS discord_replays (id TEXT PRIMARY KEY, response TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_orders (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, state TEXT NOT NULL, updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_bots (symbol TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_bot_locks (symbol TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_calls (id TEXT PRIMARY KEY, day TEXT NOT NULL, workspace_id TEXT NOT NULL, run_id TEXT NOT NULL, role TEXT NOT NULL, model TEXT NOT NULL, reserved REAL NOT NULL, charged REAL NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cached_tokens INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS team_runs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, cache_key TEXT NOT NULL, state TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS team_settings (workspace_id TEXT PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS team_locks (workspace_id TEXT PRIMARY KEY, expires INTEGER NOT NULL);`);
  state.obsidianDatabases.set(directory, connection);
  return connection;
}
export function createWorkspace(id: string) {
  const workspace: Workspace = { portfolio: structuredClone(INITIAL_PORTFOLIO), bots: [], watchlist: ["BTC", "ETH", "SOL", "XRP"], lastWorkerAt: null, workerError: null };
  db().prepare("INSERT OR IGNORE INTO workspaces VALUES (?, ?)").run(id, JSON.stringify(workspace));
  return readWorkspace(id);
}
export function readWorkspace(id: string): Workspace {
  const row = db().prepare("SELECT state FROM workspaces WHERE id=?").get(id) as { state: string } | undefined;
  if (!row) throw new Error("Workspace not found");
  return JSON.parse(row.state);
}
export function updateWorkspace(id: string, change: (workspace: Workspace) => Workspace) {
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const result = change(readWorkspace(id));
    connection.prepare("UPDATE workspaces SET state=? WHERE id=?").run(JSON.stringify(result), id);
    connection.exec("COMMIT"); return result;
  } catch (error) { connection.exec("ROLLBACK"); throw error; }
}
export function workspaceIds() { return (db().prepare("SELECT id FROM workspaces").all() as { id: string }[]).map(r => r.id); }
export function contextKey(c: Context) { return `${c.exchange}:${c.market}:${c.symbol}:${c.timeframe}:${c.source}`; }

export const CREDENTIAL_NAMES = ["TRADE_AI_KEY", "DISCORD_PUBLIC_KEY", "BINANCE_DEMO_API_KEY", "BINANCE_DEMO_API_SECRET"] as const;
export function credential(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const row = db().prepare("SELECT encrypted FROM credentials WHERE name=?").get(name) as { encrypted: string } | undefined;
  if (!row) return undefined;
  const [iv, tag, data] = row.encrypted.split(".").map(s => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), iv);
  decipher.setAAD(Buffer.from(name)); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
export function saveCredential(name: string, value: string) {
  if (!CREDENTIAL_NAMES.includes(name as typeof CREDENTIAL_NAMES[number])) throw new Error("Unsupported setting");
  if (process.env[name]) throw new Error("This value is managed by environment settings; update it there.");
  if (!value.trim() || value.length > 4096) throw new Error("Enter a nonempty value of at most 4096 characters");
  if (name === "DISCORD_PUBLIC_KEY" && !/^[a-f\d]{64}$/i.test(value.trim())) throw new Error("Discord Public Key must be 64 hexadecimal characters");
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  cipher.setAAD(Buffer.from(name));
  const data = Buffer.concat([cipher.update(value.trim(), "utf8"), cipher.final()]);
  const encrypted = [iv, cipher.getAuthTag(), data].map(b => b.toString("base64")).join(".");
  db().prepare("INSERT INTO credentials VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET encrypted=excluded.encrypted").run(name, encrypted);
}
export function createLink(id: string) {
  db().prepare("DELETE FROM links WHERE expires < ? OR workspace_id=?").run(Date.now(), id);
  const code = randomBytes(16).toString("hex");
  db().prepare("INSERT INTO links VALUES (?, ?, ?)").run(createHash("sha256").update(code).digest("hex"), id, Date.now() + 600000);
  return code;
}
export function linkDiscord(userId: string, code: string) {
  const connection = db(); connection.exec("BEGIN IMMEDIATE");
  try {
    const hash = createHash("sha256").update(code).digest("hex");
    const row = connection.prepare("SELECT workspace_id FROM links WHERE hash=? AND expires>?").get(hash, Date.now()) as { workspace_id: string } | undefined;
    if (!row) throw new Error("Link code is invalid or expired. Generate a fresh code in Connections.");
    connection.prepare("DELETE FROM discord_accounts WHERE workspace_id=?").run(row.workspace_id);
    connection.prepare("INSERT INTO discord_accounts VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET workspace_id=excluded.workspace_id").run(userId, row.workspace_id);
    connection.prepare("DELETE FROM links WHERE hash=?").run(hash);
    connection.exec("COMMIT"); return row.workspace_id;
  } catch (error) { connection.exec("ROLLBACK"); throw error; }
}
export function discordWorkspace(userId: string) {
  return (db().prepare("SELECT workspace_id FROM discord_accounts WHERE user_id=?").get(userId) as { workspace_id: string } | undefined)?.workspace_id;
}
