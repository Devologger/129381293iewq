import {accountContext} from '@/lib/server/account-context';
import {aiAccess} from '@/lib/server/ai-access';
import {isAdmin} from '@/lib/server/admin';
import {hostedEnabled} from '@/lib/server/hosted';
import {hostedAccountAction} from '@/lib/server/hosted-auth';
import {resolveHostedAccount} from '@/lib/server/accounts';
import {accountFromRequest,signupPolicy,rateLimitAuth,signupAccount,loginAccount,logoutAccount,changeAccountPassword,renameAccount} from '@/lib/server/accounts';
import {cookieHeader,sameOrigin} from '@/lib/server/session';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const account=hostedEnabled()?await resolveHostedAccount(request):accountFromRequest(request);let access={allowed:false,reason:'Sign in to use AI features.',admin:false};if(account){try{access=await accountContext.run(account,()=>aiAccess());}catch{access={allowed:false,reason:'Subscription status unavailable. Try again shortly.',admin:false};}}return Response.json({account,ai:access,admin:account?isAdmin(account):false,...signupPolicy()},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Hosted account service unavailable. Try again shortly.'},{status:503});}}
export async function POST(request:Request){
 try{sameOrigin(request);}catch{return Response.json({error:'Same-origin access required'},{status:403});}
 const origin=process.env.TERMINAL_PUBLIC_ORIGIN||new URL(request.url).origin;
 if(!origin.startsWith('https:')&&!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))return Response.json({error:'Accounts require HTTPS'},{status:426});
 try{
 const text=await request.text();if(text.length>4096)return Response.json({error:'Payload too large'},{status:413});const data=JSON.parse(text);
 if(hostedEnabled()){rateLimitAuth('hosted-origin:'+(process.env.PENGUIN_TRUSTED_IP_HEADER?request.headers.get(process.env.PENGUIN_TRUSTED_IP_HEADER)||'shared':'shared'),200);rateLimitAuth('hosted:'+String(data.email||'session').trim().toLowerCase(),30);return await hostedAccountAction(request,data);}
 const account=accountFromRequest(request);
 if(data.action==='logout'){logoutAccount(request);return Response.json({signedOut:true},{headers:{'Set-Cookie':cookieHeader(request,'penguin_session','',0)}});}
 if(['login','signup','password'].includes(data.action)){
 // Do not trust arbitrary X-Forwarded-For values. A proxy may supply a single verified identity header if configured by the operator.
 const configured=process.env.PENGUIN_TRUSTED_IP_HEADER;
 const ip=configured?request.headers.get(configured)||'unknown':'shared';
 rateLimitAuth('origin:'+ip,configured?30:200);
 if(typeof data.email==='string')rateLimitAuth('email:'+data.email.trim().toLowerCase());
 }
 if(data.action==='login'||data.action==='signup'){
 const result=data.action==='signup'?await signupAccount(data):await loginAccount(data.email,data.password);
 return Response.json({account:result.account},{headers:{'Set-Cookie':cookieHeader(request,'penguin_session',result.token,7*86400)}});
 }
 if(!account)return Response.json({error:'Sign in first'},{status:401});
 if(data.action==='password'){await changeAccountPassword(account,data.oldPassword,data.newPassword);return Response.json({signedOut:true},{headers:{'Set-Cookie':cookieHeader(request,'penguin_session','',0)}});}
 if(data.action==='profile'){renameAccount(account,data.name);return Response.json({saved:true});}
 throw new Error('Unsupported account action');
 }catch(e){const message=e instanceof Error?e.message:'Account request failed';return Response.json({error:message},{status:message.startsWith('Too many')?429:400});}
}
