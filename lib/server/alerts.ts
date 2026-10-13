import {createHash,randomUUID} from 'node:crypto';
import {credential,db} from './store.ts';
function tables(){db().exec('CREATE TABLE IF NOT EXISTS alert_settings (workspace_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS alert_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created INTEGER NOT NULL, status TEXT NOT NULL)');}
export function alertSettings(id:string){tables();return {enabled:Boolean((db().prepare('SELECT enabled FROM alert_settings WHERE workspace_id=?').get(id) as {enabled:number}|undefined)?.enabled),configured:Boolean(credential('DISCORD_WEBHOOK_URL'))};}
export function saveAlertSettings(id:string,enabled:boolean){if(typeof enabled!=='boolean')throw new Error('Use an explicit notification switch');tables();db().prepare('INSERT INTO alert_settings VALUES (?,?) ON CONFLICT(workspace_id) DO UPDATE SET enabled=excluded.enabled').run(id,Number(enabled));return alertSettings(id);}
export async function notify(id:string,event:string,content:string,fetcher:typeof fetch=fetch){
 if(!alertSettings(id).enabled)return false;
 const raw=credential('DISCORD_WEBHOOK_URL');if(!raw)return false;let url:URL;try{url=new URL(raw);}catch{return false;}
 if(url.protocol!=='https:'||url.hostname!=='discord.com'||!/^\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]+$/.test(url.pathname)||url.search||url.hash)return false;
 const key=createHash('sha256').update(id+event).digest('hex');if(!db().prepare('INSERT OR IGNORE INTO alert_events VALUES (?,?,?,?)').run(key,id,Date.now(),'SENDING').changes)return false;
 try{const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'Penguin · JARVIS',content:content.slice(0,1800),allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(8000)});db().prepare('UPDATE alert_events SET status=? WHERE id=?').run(response.ok?'SENT':'FAILED',key);return response.ok;}catch{db().prepare("UPDATE alert_events SET status='UNCERTAIN' WHERE id=?").run(key);return false;}
}
export function testAlert(id:string){return notify(id,'test:'+randomUUID(),'Penguin systems check: Discord notifications are connected. No order was placed.');}
