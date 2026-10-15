import {withAccount} from "@/lib/server/accounts";
import {alertSettings,saveAlertSettings,testAlert} from '@/lib/server/alerts';
import {ownerSession,sameOrigin,workspaceSession} from '@/lib/server/session';
export const runtime='nodejs';
async function handleGET(request:Request){if(!ownerSession(request))return Response.json({error:'Unlock Settings first'},{status:401});return Response.json(alertSettings(workspaceSession(request).id));}
async function handlePOST(request:Request){try{sameOrigin(request);if(!ownerSession(request))return Response.json({error:'Unlock Settings first'},{status:401});const data=await request.json(),id=workspaceSession(request).id;if(data.action==='test')return Response.json({message:await testAlert(id)?'Discord test message sent.':'Notification unavailable or disabled; check your encrypted webhook and enable alerts.'});return Response.json(saveAlertSettings(id,data.enabled));}catch{return Response.json({error:'Notification settings request failed'},{status:400});}}

export const GET = withAccount(handleGET);
export const POST = withAccount(handlePOST);
