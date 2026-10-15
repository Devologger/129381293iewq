import {withAccount} from '@/lib/server/accounts';
import {liveMarket} from '@/lib/server/live-market';
export const runtime='nodejs';
export const GET=withAccount(async(request:Request)=>{try{return Response.json(await liveMarket(new URL(request.url).searchParams),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e instanceof Error?e.message:'Live display unavailable'},{status:502,headers:{'Cache-Control':'no-store'}});}});
