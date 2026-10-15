import {withAccount} from "@/lib/server/accounts";
import { ownerSession } from "@/lib/server/session";
import { verifyBinanceDemo } from "@/lib/server/binance-demo";
export const runtime = "nodejs";
async function handleGET(request: Request) {
  if (!ownerSession(request)) return Response.json({ error: "Unlock private settings first" }, { status: 401 });
  try { return Response.json(await verifyBinanceDemo()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Binance demo verification failed" }, { status: 502 }); }
}

export const GET = withAccount(handleGET);
