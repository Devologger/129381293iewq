import {withAccount} from "../../../../lib/server/accounts.ts";
import { credential } from "../../../../lib/server/store.ts";
import {discordInteraction} from "../../../../lib/server/discord.ts";
export async function POST(request:Request){if(process.env.PENGUIN_ACCOUNT_MODE==='1')return Response.json({error:'Use your account integration endpoint'},{status:404});return discordInteraction(request);}
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handleGET() {
  return Response.json({ configured: Boolean(credential("DISCORD_PUBLIC_KEY")), commands: ["/penguin help", "/penguin link", "/penguin status", "/penguin positions", "/penguin pause", "/penguin resume"] });
}

export const GET=withAccount(handleGET);
