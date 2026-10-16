import {withAccount} from '@/lib/server/accounts';
import {ownerSession,sameOrigin,workspaceSession} from '@/lib/server/session';
import {askAppHelper} from '@/lib/server/agent-team';
export const runtime='nodejs';
export const POST=withAccount(async(request:Request)=>{
 try{sameOrigin(request);}catch{return Response.json({error:'Same-origin access required'},{status:403});}
 if(!ownerSession(request))return Response.json({error:'Sign in or unlock Settings to use AI help.'},{status:401});
 try{const text=await request.text();if(text.length>4000)throw new Error('Question too long');const data=JSON.parse(text);return Response.json(await askAppHelper(workspaceSession(request).id,data.question),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e instanceof Error?e.message:'AI help unavailable'},{status:400});}
});
