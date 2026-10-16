import {supabase} from './hosted.ts';
import {rememberHosted,resolveHostedAccount,hostedAccessToken,revokeAccountSessions,logoutAccount,signupPolicy,enrollHostedEmail,requireHostedEnrollment} from './accounts.ts';
import {cookieHeader} from './session.ts';
import {createHash,timingSafeEqual} from 'node:crypto';
const digest=(s:string)=>createHash('sha256').update(s).digest();
function email(value:unknown){if(typeof value!=='string'||value.length>254||!/^\S+@\S+\.\S+$/.test(value))throw new Error('Enter a valid email');return value.trim().toLowerCase();}
function password(value:unknown){if(typeof value!=='string'||value.length<12||value.length>256)throw new Error('Use a password of 12–256 characters');return value;}
export async function hostedAccountAction(request:Request,data:Record<string,unknown>){
 const policy=signupPolicy();
 if(data.action==='logout'){logoutAccount(request);return Response.json({signedOut:true},{headers:{'Set-Cookie':cookieHeader(request,'penguin_session','',0)}});}
 if(data.action==='signup'){
  if(!policy.enabled)throw new Error('Registration is closed');
  if(policy.invitationRequired&&!timingSafeEqual(digest(String(data.invitation||'')),digest(process.env.PENGUIN_SIGNUP_CODE||'')))throw new Error('Invitation code is invalid');
  if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80)throw new Error('Use a name of 1–80 characters');
  const result=await supabase('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:email(data.email),password:password(data.password),data:{name:data.name.trim()}})});
  // Require email confirmation even if the project was mistakenly configured otherwise.
  if(result.access_token)throw new Error('The operator must enable Supabase email confirmation before opening registration');
  enrollHostedEmail(email(data.email));
  return Response.json({verificationRequired:true,message:'Check your email for the confirmation code.'});
 }
 if(data.action==='recover'){
  await supabase('/auth/v1/recover',{method:'POST',body:JSON.stringify({email:email(data.email)})});
  return Response.json({recoveryRequired:true,message:'If the address is registered, a recovery code has been sent.'});
 }
 if(data.action==='login'||data.action==='verify'||data.action==='reset'){
  let result;
  if(data.action==='login')result=await supabase('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:email(data.email),password:password(data.password)})});
  else {
   if(typeof data.code!=='string'||!/^\d{6,10}$/.test(data.code))throw new Error('Enter the email confirmation code');
   result=await supabase('/auth/v1/verify',{method:'POST',body:JSON.stringify({email:email(data.email),token:data.code,type:data.action==='reset'?'recovery':'signup'})});
   if(data.action==='reset'){
    await supabase('/auth/v1/user',{method:'PUT',headers:{Authorization:'Bearer '+result.access_token},body:JSON.stringify({password:password(data.newPassword)})});
    await supabase('/auth/v1/logout?scope=global',{method:'POST',headers:{Authorization:'Bearer '+result.access_token}});
    revokeAccountSessions(result.user.id.replaceAll('-',''));return Response.json({signedOut:true,message:'Password reset. Sign in with your new password.'},{headers:{'Set-Cookie':cookieHeader(request,'penguin_session','',0)}});
   }
  }
  requireHostedEnrollment(result.user.email);
  const session=rememberHosted(result.user,result);
  return Response.json({account:session.account},{headers:{'Set-Cookie':cookieHeader(request,'penguin_session',session.token,7*86400),'Cache-Control':'no-store'}});
 }
 const account=await resolveHostedAccount(request);if(!account)return Response.json({error:'Sign in first'},{status:401});
 const access=hostedAccessToken(request),headers={Authorization:'Bearer '+access};
 if(data.action==='profile'){
  if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80)throw new Error('Use a name of 1–80 characters');
  await supabase('/auth/v1/user',{method:'PUT',headers,body:JSON.stringify({data:{name:data.name.trim()}})});return Response.json({saved:true});
 }
 if(data.action==='password'){
  await supabase('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:account.email,password:password(data.oldPassword)})});
  await supabase('/auth/v1/user',{method:'PUT',headers,body:JSON.stringify({password:password(data.newPassword)})});
  await supabase('/auth/v1/logout?scope=global',{method:'POST',headers});revokeAccountSessions(account.id);
 }else throw new Error('Unsupported account action');
 return Response.json({signedOut:true},{headers:{'Set-Cookie':cookieHeader(request,'penguin_session','',0)}});
}
