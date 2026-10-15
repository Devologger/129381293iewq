import {withAccount} from '@/lib/server/accounts';
import {ownerSession} from '@/lib/server/session';
import {binanceLiveAccount} from '@/lib/server/binance-live';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handleGET(request:Request){
 if(!ownerSession(request))return Response.json({error:'Unlock private settings first'},{status:401});
 const market=new URL(request.url).searchParams.get('market')||'perpetual';
 if(market!=='spot'&&market!=='perpetual')return Response.json({error:'Choose spot or perpetual'},{status:400});
 try{return Response.json(await binanceLiveAccount(market),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e instanceof Error?e.message:'Real Binance account unavailable'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
export const GET=withAccount(handleGET);
