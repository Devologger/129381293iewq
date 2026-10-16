// Server-only transport. Never import this module from a client component.
import {AsyncLocalStorage} from 'node:async_hooks';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
export const hostedEnabled=()=>process.env.PENGUIN_AUTH_PROVIDER==='supabase';
export const remoteSecrets=new AsyncLocalStorage<Map<string,string>>();
export function supabaseConfig(){
 const raw=process.env.SUPABASE_URL||'',url=new URL(raw);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new Error('Configure the HTTPS Supabase project URL');
 const anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!anon||!service)throw new Error('Supabase server configuration is incomplete');
 return {url:url.origin,anon,service};
}
export async function supabase(path:string,options:RequestInit={},admin=false,fetcher:typeof fetch=fetch){
 const config=supabaseConfig(),key=admin?config.service:config.anon;
 const response=await fetcher(config.url+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...options.headers},cache:'no-store',signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw new Error(response.status===429?'Account service rate limited. Try again later.':'Hosted account service rejected the request. Check your account or server configuration.');
 const text=await response.text();if(!text)return null;try{return JSON.parse(text);}catch{throw new Error('Hosted account service returned an unreadable response');}
}
function master(){const value=process.env.PENGUIN_SECRET_MASTER_KEY||'';if(!/^[a-f\d]{64}$/i.test(value))throw new Error('Configure a separate 32-byte PENGUIN_SECRET_MASTER_KEY');return Buffer.from(value,'hex');}
export function sealSecret(user:string,name:string,value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',master(),iv);cipher.setAAD(Buffer.from('penguin:v1:'+user+':'+name));const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(v=>v.toString('base64')).join('.');}
export function openSecret(user:string,name:string,value:string){const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64'));const decipher=createDecipheriv('aes-256-gcm',master(),iv);decipher.setAAD(Buffer.from('penguin:v1:'+user+':'+name));decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');}
export function hostedUuid(id:string){if(!/^[a-f\d]{32}$/.test(id))throw new Error('Invalid hosted identity');return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;}
export function hostedIdentity(user:{id:string;email?:string;email_confirmed_at?:string;banned_until?:string;user_metadata?:{name?:string}}){
 if(!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(user.id)||!user.email||!user.email_confirmed_at)throw new Error('Verify your email before signing in');
 if(user.banned_until&&Date.parse(user.banned_until)>Date.now())throw new Error('Account access is suspended');
 return {id:user.id.replaceAll('-','').toLowerCase(),workspaceId:createHash('sha256').update('penguin:workspace:'+user.id.toLowerCase()).digest('hex').slice(0,48),email:user.email,name:String(user.user_metadata?.name||user.email.split('@')[0]).slice(0,80)};
}
export async function loadHostedSecrets(id:string,fetcher:typeof fetch=fetch){const user=hostedUuid(id),rows=await supabase('/rest/v1/integration_secrets?user_id=eq.'+user+'&select=name,ciphertext',{},true,fetcher) as {name:string;ciphertext:string}[];if(!Array.isArray(rows))throw new Error('Hosted secrets unavailable');return new Map(rows.map(row=>[row.name,openSecret(user,row.name,row.ciphertext)]));}
export async function saveHostedSecret(id:string,name:string,value:string,fetcher:typeof fetch=fetch){const user=hostedUuid(id);await supabase('/rest/v1/integration_secrets?on_conflict=user_id,name',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:user,name,ciphertext:sealSecret(user,name,value),updated_at:new Date().toISOString()})},true,fetcher);remoteSecrets.getStore()?.set(name,value);}
