import { credential, discordWorkspace, linkDiscord, readWorkspace, updateWorkspace } from "./store.ts";
import { createPublicKey, verify } from "node:crypto";

export async function discordInteraction(request: Request) {
  const key = credential("DISCORD_PUBLIC_KEY");
  if (!key || !/^[a-f\d]{64}$/i.test(key)) return Response.json({ error: "Discord Public Key can be configured later in Connections" }, { status: 503 });
  const timestamp = request.headers.get("x-signature-timestamp") || ""; const signature = request.headers.get("x-signature-ed25519") || "";
  const body = await request.text();
  if (body.length > 32000 || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f\d]{128}$/i.test(signature)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  try {
    const publicKey = createPublicKey({ key: Buffer.from(`302a300506032b6570032100${key}`, "hex"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(timestamp + body), publicKey, Buffer.from(signature, "hex"))) return Response.json({ error: "Invalid signature" }, { status: 401 });
    const interaction = JSON.parse(body);
    if (interaction.type === 1) return Response.json({ type: 1 });
    if (interaction.type !== 2 || !["penguin", "obsidian"].includes(interaction.data?.name || "")) return Response.json({ error: "Unsupported command" }, { status: 400 });
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const command = interaction.data.options?.[0]?.name;
    const reply = (content: string) => Response.json({ type: 4, data: { content: content.slice(0, 1900), flags: 64 } });
    if (command === "help") return reply("Penguin commands: link, status, positions, pause, resume. These control the standalone paper ledger. Generate a one-time link code in dashboard Connections. All keys can be added later; no live exchange orders are sent.");
    if (!userId || !/^\d{5,25}$/.test(userId)) return reply("Discord user identity is missing.");
    if (command === "link") {
      const code = interaction.data.options[0].options?.find((o: { name: string }) => o.name === "code")?.value;
      if (typeof code !== "string" || !/^[a-f\d]{32}$/.test(code)) return reply("Use /obsidian link code:<one-time code from Connections>.");
      try { linkDiscord(userId, code); return reply("Workspace linked. /obsidian status and /obsidian positions now read your persistent paper account."); }
      catch (error) { return reply(error instanceof Error ? error.message : "Account linking failed"); }
    }
    const id = discordWorkspace(userId);
    if (!id) return reply("Link your workspace first using a one-time code from Connections. Service is online; no personal account is exposed until linked.");
    let ws = readWorkspace(id);
    if (command === "pause" || command === "resume") {
      ws = updateWorkspace(id, state => ({ ...state, portfolio: { ...state.portfolio, paused: command === "pause" } }));
      return reply(command === "pause" ? "Paper entries and learning paused. Existing paper positions remain monitored by the server." : "Paper engine resumed. Existing configured paper bots will watch fresh bars.");
    }
    if (command === "positions") return reply(ws.portfolio.positions.length ? ws.portfolio.positions.map(p => `${p.symbol} ${p.side} · ${p.exchange}/${p.market}/${p.source} · entry ${p.entry.toFixed(4)} · size $${p.collateral.toFixed(2)}`).join("\n") : "No open paper positions.");
    if (command === "status") return reply(`Paper engine: ${ws.portfolio.paused ? "paused" : "enabled"}. Cash: $${ws.portfolio.cash.toFixed(2)}. Open positions: ${ws.portfolio.positions.length}. Closed trades: ${ws.portfolio.fills.length}. Bots: ${ws.bots.filter(b => b.enabled).length}. Last worker cycle: ${ws.lastWorkerAt || "waiting for first cycle"}.${ws.workerError ? " A market feed needs attention; inspect the dashboard." : ""}`);
    return reply("Use /obsidian help for supported paper commands.");
  } catch { return Response.json({ error: "Invalid interaction" }, { status: 400 }); }
}
