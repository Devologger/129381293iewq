import {supabase,hostedIdentity} from './hosted.ts';
import {ADMIN_EMAIL,adminBinding,bindAdmin} from './admin.ts';
import {enrollHostedEmail} from './accounts.ts';
// Only called from the operator's local CLI, never an HTTP route.
export async function provisionAdmin(password:string,confirmedId?:string,fetcher:typeof fetch=fetch){
 if(typeof password!=='string'||password.length<16||password.length>256)throw new Error('Use a private password of 16–256 characters');
 let existing:Parameters<typeof hostedIdentity>[0]|undefined;
 for(let page=1;page<=100;page++){
  const body=await supabase('/auth/v1/admin/users?page='+page+'&per_page=100',{method:'GET'},true,fetcher);
  if(!Array.isArray(body.users))throw new Error('Invalid Supabase user listing');
  existing=body.users.find((user:{email?:string})=>user.email?.toLowerCase()===ADMIN_EMAIL);
  if(existing||body.users.length<100)break;
  if(page===100)throw new Error('User listing limit reached; inspect the administrator identity manually');
 }
 if(existing){
  const identity=hostedIdentity(existing),binding=adminBinding();
  if(binding?.id!==identity.id&&confirmedId!==existing.id)throw new Error('That email already exists. Verify mailbox ownership and its Supabase UUID, then rerun with PENGUIN_ADMIN_EXISTING_USER_ID set privately. No existing password was changed.');
  bindAdmin(identity.id);enrollHostedEmail(ADMIN_EMAIL);return {id:existing.id,created:false};
 }
 if(adminBinding())throw new Error('A bound administrator no longer exists remotely. Resolve this explicitly before replacing it.');
 const result=await supabase('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email:ADMIN_EMAIL,password,email_confirm:true,user_metadata:{name:'Penguin administrator'}})},true,fetcher);
 const user=result.user||result,identity=hostedIdentity(user);if(identity.email.toLowerCase()!==ADMIN_EMAIL)throw new Error('Administrator email mismatch');
 bindAdmin(identity.id);enrollHostedEmail(ADMIN_EMAIL);return {id:user.id,created:true};
}
