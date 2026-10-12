import { credential } from "../../../../lib/server/store.ts";
export { discordInteraction as POST } from "../../../../lib/server/discord.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ configured: Boolean(credential("DISCORD_PUBLIC_KEY")), commands: ["/obsidian help", "/obsidian link", "/obsidian status", "/obsidian positions", "/obsidian pause", "/obsidian resume"] });
}
