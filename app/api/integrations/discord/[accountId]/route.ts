import {hostedEnabled,loadHostedSecrets,remoteSecrets} from '@/lib/server/hosted';
import {accountById} from '@/lib/server/accounts';
import {accountContext} from '@/lib/server/account-context';
import {discordInteraction} from '@/lib/server/discord';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{accountId:string}>}){
 const {accountId}=await context.params,account=accountById(accountId);
 if(!account)return Response.json({error:'Integration unavailable'},{status:404});
 try{if(hostedEnabled()){const secrets=await loadHostedSecrets(account.id);return accountContext.run(account,()=>remoteSecrets.run(secrets,()=>discordInteraction(request)));}return accountContext.run(account,()=>discordInteraction(request));}catch{return Response.json({error:'Integration unavailable'},{status:503});}
}
