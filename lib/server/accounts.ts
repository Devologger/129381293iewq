import {hostedEnabled,hostedIdentity,supabase,sealSecret,openSecret,loadHostedSecrets,remoteSecrets} from './hosted.ts';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {accountContext,rootDataDirectory,type AccountIdentity} from './account-context.ts';
import {createWorkspace} from './store.ts';

const scrypt=promisify(scryptCallback);
const databases=new Map<string,DatabaseSync>();
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const TTL=7*86400000;
function accountsDb(){
 const root=rootDataDirectory();let connection=databases.get(root);if(connection)return connection;
 mkdirSync(root,{recursive:true,mode:0o700});connection=new DatabaseSync(join(root,'accounts.sqlite'));
 connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,workspace_id TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS account_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS hosted_enrollments(email TEXT PRIMARY KEY,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS hosted_sessions(token_hash TEXT PRIMARY KEY,encrypted TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_limits(identity TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL);`);
 databases.set(root,connection);return connection;
}
type AccountRow={id:string;email:string;name:string;password:string;workspace_id:string};
const identity=(row:AccountRow):AccountIdentity=>({id:row.id,email:row.email,name:row.name,workspaceId:row.workspace_id});
function emailAddress(value:unknown){if(typeof value!=='string'||value.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(value))throw new Error('Enter a valid email address');return value.trim().toLowerCase();}
function validPassword(value:unknown):asserts value is string{if(typeof value!=='string'||value.length<12||value.length>256)throw new Error('Use a password of 12–256 characters');}
async function passwordHash(password:string){const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64) as Buffer).toString('hex');}
async function passwordMatches(password:string,stored:string){const [salt,digest]=stored.split(':');const actual=await scrypt(password,salt,64) as Buffer;return /^[a-f\d]{128}$/.test(digest||'')&&timingSafeEqual(actual,Buffer.from(digest,'hex'));}
function session(account:AccountIdentity){const token=randomBytes(32).toString('hex'),connection=accountsDb();connection.prepare('DELETE FROM hosted_sessions WHERE token_hash IN (SELECT token_hash FROM account_sessions WHERE expires<?)').run(Date.now());connection.prepare('DELETE FROM account_sessions WHERE expires<?').run(Date.now());connection.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run(hash(token),account.id,Date.now()+TTL);return {account,token};}
export function signupPolicy(){return {hosted:hostedEnabled(),open:process.env.PENGUIN_OPEN_SIGNUP==='1',invitationRequired:process.env.PENGUIN_OPEN_SIGNUP!=='1'&&Boolean(process.env.PENGUIN_SIGNUP_CODE),enabled:process.env.PENGUIN_OPEN_SIGNUP==='1'||Boolean(process.env.PENGUIN_SIGNUP_CODE),requireLogin:hostedEnabled()||process.env.PENGUIN_ACCOUNT_MODE==='1'};}
export function rateLimitAuth(identity:string,maximum=10){
 const connection=accountsDb(),now=Date.now(),key=hash(identity);connection.exec('BEGIN IMMEDIATE');
 try{connection.prepare('DELETE FROM auth_limits WHERE expires<?').run(now);const row=connection.prepare('SELECT attempts FROM auth_limits WHERE identity=?').get(key) as {attempts:number}|undefined;
 if((row?.attempts||0)>=maximum)throw new Error('Too many account attempts. Wait 15 minutes.');
 connection.prepare('INSERT INTO auth_limits VALUES (?,1,?) ON CONFLICT(identity) DO UPDATE SET attempts=attempts+1').run(key,now+900000);connection.exec('COMMIT');}catch(e){connection.exec('ROLLBACK');throw e;}
}
export async function signupAccount(input:{email:unknown;name:unknown;password:unknown;invitation?:unknown}){
 const policy=signupPolicy();if(!policy.enabled)throw new Error('Registration is disabled. The operator must configure invitation access.');
 if(!policy.open&&(typeof input.invitation!=='string'||!timingSafeEqual(Buffer.from(hash(input.invitation)),Buffer.from(hash(process.env.PENGUIN_SIGNUP_CODE||'')))))throw new Error('Invitation code is invalid');
 const email=emailAddress(input.email);validPassword(input.password);
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80)throw new Error('Use a name of 1–80 characters');
 const row:AccountIdentity={id:randomBytes(16).toString('hex'),workspaceId:randomBytes(24).toString('hex'),email,name:input.name.trim()};
 const password=await passwordHash(input.password);
 try{accountsDb().prepare('INSERT INTO accounts VALUES (?,?,?,?,?,?)').run(row.id,row.email,row.name,password,row.workspaceId,Date.now());}catch{throw new Error('Account could not be created. Try signing in if you already registered.');}
 accountContext.run(row,()=>createWorkspace(row.workspaceId));return session(row);
}
export async function loginAccount(email:unknown,password:unknown){
 const normalized=emailAddress(email);validPassword(password);const row=accountsDb().prepare('SELECT * FROM accounts WHERE email=?').get(normalized) as AccountRow|undefined;
 // Equal-cost password derivation even when the account does not exist.
 const matches=await passwordMatches(password,row?.password||'00000000000000000000000000000000:'+ '0'.repeat(128));
 if(!row||!matches)throw new Error('Email or password is incorrect');return session(identity(row));
}
export function accountFromRequest(request:Request){
 const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('penguin_session='))?.slice('penguin_session='.length);
 if(!token||!(/^[a-f\d]{64}$/).test(token))return null;
 const row=accountsDb().prepare('SELECT a.* FROM accounts a JOIN account_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires>?').get(hash(token),Date.now()) as AccountRow|undefined;
 return row?identity(row):null;
}
export function accountById(id:string){if(!/^[a-f\d]{32}$/.test(id))return null;const row=accountsDb().prepare('SELECT * FROM accounts WHERE id=?').get(id) as AccountRow|undefined;return row?identity(row):null;}
export function logoutAccount(request:Request){const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('penguin_session='))?.slice('penguin_session='.length);if(token){accountsDb().prepare('DELETE FROM hosted_sessions WHERE token_hash=?').run(hash(token));accountsDb().prepare('DELETE FROM account_sessions WHERE token_hash=?').run(hash(token));}}
export async function changeAccountPassword(account:AccountIdentity,oldPassword:unknown,newPassword:unknown){
 validPassword(oldPassword);validPassword(newPassword);const row=accountsDb().prepare('SELECT * FROM accounts WHERE id=?').get(account.id) as AccountRow|undefined;
 if(!row||!await passwordMatches(oldPassword,row.password))throw new Error('Current password is incorrect');
 const password=await passwordHash(newPassword),connection=accountsDb();connection.exec('BEGIN IMMEDIATE');try{connection.prepare('UPDATE accounts SET password=? WHERE id=?').run(password,account.id);connection.prepare('DELETE FROM account_sessions WHERE account_id=?').run(account.id);connection.exec('COMMIT');}catch(e){connection.exec('ROLLBACK');throw e;}
}
export function renameAccount(account:AccountIdentity,name:unknown){if(typeof name!=='string'||!name.trim()||name.length>80)throw new Error('Use a name of 1–80 characters');accountsDb().prepare('UPDATE accounts SET name=? WHERE id=?').run(name.trim(),account.id);}
export function withAccount(handler:(request:Request)=>Response|Promise<Response>){return async(request:Request)=>{
 let account;try{account=hostedEnabled()?await resolveHostedAccount(request):accountFromRequest(request);}catch{return Response.json({error:"Hosted account service unavailable. Retry shortly."},{status:503});}
 if(!account&&signupPolicy().requireLogin)return Response.json({error:'Sign in to your Penguin account',signInRequired:true},{status:401,headers:{'Cache-Control':'no-store'}});
 if(hostedEnabled()&&account){try{const secrets=await loadHostedSecrets(account.id);return accountContext.run(account,()=>remoteSecrets.run(secrets,()=>handler(request)));}catch{return Response.json({error:"Encrypted integrations unavailable. No account action was performed."},{status:503});}}
 return accountContext.run(account||undefined,()=>handler(request));
};}
export async function runAllAccounts(job:()=>Promise<void>){
 const entries=accountsDb().prepare('SELECT * FROM accounts').all() as AccountRow[];
 for(const account of (hostedEnabled()?entries.filter(r=>r.password==='supabase').map(identity):[undefined,...entries.filter(r=>r.password!=='supabase').map(identity)]))await accountContext.run(account,async()=>{try{if(hostedEnabled()){const secrets=await loadHostedSecrets(account!.id);await remoteSecrets.run(secrets,job);}else await job();}catch{/* A failed tenant must not stop monitoring other tenants. Individual workers persist their errors. */}});
}

export function rememberHosted(user:Parameters<typeof hostedIdentity>[0],tokens:{access_token:string;refresh_token:string;expires_in:number}){
 const account=hostedIdentity(user),connection=accountsDb();
 if(typeof tokens.access_token!=='string'||!tokens.access_token||typeof tokens.refresh_token!=='string'||!tokens.refresh_token||!Number.isFinite(tokens.expires_in)||tokens.expires_in<=0)throw new Error('Invalid hosted session');
 try{connection.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name").run(account.id,account.email,account.name,'supabase',account.workspaceId,Date.now());}catch{throw new Error('Hosted account conflicts with an existing local account. Use a dedicated hosted installation; existing local accounts are not migrated automatically.');}
 const result=session(account),record={...tokens,expires_at:Date.now()+tokens.expires_in*1000};
 connection.prepare('INSERT INTO hosted_sessions VALUES (?,?)').run(hash(result.token),sealSecret(account.id,'session',JSON.stringify(record)));
 return result;
}
const refreshing=new Map<string,Promise<void>>();
export async function resolveHostedAccount(request:Request){
 const account=accountFromRequest(request);if(!account)return null;
 const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('penguin_session='))?.slice(16);
 const key=hash(token||''),row=accountsDb().prepare('SELECT encrypted FROM hosted_sessions WHERE token_hash=?').get(key) as {encrypted:string}|undefined;
 if(!row)return null;
 const read=()=>JSON.parse(openSecret(account.id,'session',(accountsDb().prepare('SELECT encrypted FROM hosted_sessions WHERE token_hash=?').get(key) as {encrypted:string}).encrypted));
 let record=read();
 if(record.expires_at<Date.now()+30000){
  let pending=refreshing.get(key);if(!pending){pending=(async()=>{const fresh=await supabase('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:record.refresh_token})});accountsDb().prepare('UPDATE hosted_sessions SET encrypted=? WHERE token_hash=?').run(sealSecret(account.id,'session',JSON.stringify({...fresh,expires_at:Date.now()+fresh.expires_in*1000})),key);})();refreshing.set(key,pending);}
  try{await pending;}finally{refreshing.delete(key);}record=read();
 }
 const user=await supabase('/auth/v1/user',{headers:{Authorization:'Bearer '+record.access_token}});
 const verified=hostedIdentity(user);if(verified.id!==account.id)throw new Error('Session identity mismatch');return verified;
}
export function hostedAccessToken(request:Request){const account=accountFromRequest(request);if(!account)throw new Error('Sign in first');const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('penguin_session='))?.slice(16);const row=accountsDb().prepare('SELECT encrypted FROM hosted_sessions WHERE token_hash=?').get(hash(token||'')) as {encrypted:string}|undefined;if(!row)throw new Error('Sign in first');return JSON.parse(openSecret(account.id,'session',row.encrypted)).access_token as string;}
export function revokeAccountSessions(id:string){accountsDb().prepare('DELETE FROM hosted_sessions WHERE token_hash IN (SELECT token_hash FROM account_sessions WHERE account_id=?)').run(id);accountsDb().prepare('DELETE FROM account_sessions WHERE account_id=?').run(id);}

export function enrollHostedEmail(email:string){accountsDb().prepare('INSERT OR IGNORE INTO hosted_enrollments VALUES (?,?)').run(email.trim().toLowerCase(),Date.now());}
export function requireHostedEnrollment(email:string){if(!accountsDb().prepare('SELECT email FROM hosted_enrollments WHERE email=?').get(email.trim().toLowerCase()))throw new Error('Create your Penguin account through this application first. An invitation may be required.');}
