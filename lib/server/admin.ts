import {readFileSync,writeFileSync,mkdirSync,renameSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {rootDataDirectory,currentAccount,type AccountIdentity} from './account-context.ts';
import {hostedEnabled} from './hosted.ts';
export const ADMIN_EMAIL='info@penguin.com.cy';
type AdminBinding={id:string;email:string;created:string};
const file=()=>join(rootDataDirectory(),'admin-identity.json');
export function adminBinding():AdminBinding|null{
 try{const path=file();if(lstatSync(path).isSymbolicLink())return null;const value=JSON.parse(readFileSync(path,'utf8'));return /^[a-f\d]{32}$/.test(value.id)&&value.email===ADMIN_EMAIL?value:null;}catch{return null;}
}
export function bindAdmin(id:string){
 if(!/^[a-f\d]{32}$/.test(id))throw new Error('Invalid admin identity');
 const existing=adminBinding();if(existing&&existing.id!==id)throw new Error('An administrator is already bound. A reviewed server-side migration is required.');
 mkdirSync(rootDataDirectory(),{recursive:true,mode:0o700});const path=file(),temporary=path+'.'+process.pid+'.tmp';
 writeFileSync(temporary,JSON.stringify({id,email:ADMIN_EMAIL,created:new Date().toISOString()}),{mode:0o600,flag:'wx'});renameSync(temporary,path);
}
export function isAdmin(account:AccountIdentity|undefined=currentAccount()){
 const binding=adminBinding();return Boolean(hostedEnabled()&&account&&binding&&binding.id===account.id&&account.email.toLowerCase()===ADMIN_EMAIL);
}
