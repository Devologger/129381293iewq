import {withAccount} from "@/lib/server/accounts";
import { sameOrigin, workspaceSession } from "@/lib/server/session";
import { getFeed, validateContext } from "@/lib/server/worker";
import { runStrategyLab } from "@/lib/server/research";
import { saveStrategyEvidence, strategyHistory } from "@/lib/server/strategy-memory";
import { contextKey } from "@/lib/server/store";
export const runtime = "nodejs";
async function handleGET(request: Request) {
  try { const id=workspaceSession(request).id, key=new URL(request.url).searchParams.get("contextKey"); if (!key || key.length>200) throw new Error("Choose a market"); return Response.json({ history:strategyHistory(id,key) },{headers:{"Cache-Control":"no-store"}}); }
  catch(error){return Response.json({error:error instanceof Error?error.message:"Strategy history unavailable"},{status:400});}
}
async function handlePOST(request: Request) {
  try { sameOrigin(request); } catch {return Response.json({error:"Same-origin access required"},{status:403});}
  try {
    const text=await request.text();if(text.length>4000)throw new Error("Payload too large");const data=JSON.parse(text);validateContext(data.context);
    for(const key of ["rangeStart","rangeEnd"])if(data[key]!==undefined && (typeof data[key]!=="number"||!Number.isFinite(data[key])||data[key]<=0))throw new Error("Use valid fixed-range timestamps");
    if(data.rangeStart && data.rangeEnd && data.rangeStart>data.rangeEnd)throw new Error("Range start must precede end");
    const id=workspaceSession(request).id,feed=await getFeed(data.context),report=await runStrategyLab(feed.candles,data.rangeStart,data.rangeEnd);
    saveStrategyEvidence(id,contextKey(data.context),report,feed.source);return Response.json(report);
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Strategy comparison failed"},{status:400});}
}

export const GET = withAccount(handleGET);
export const POST = withAccount(handlePOST);
