import {currentAccount} from "./account-context.ts";
import {createHash} from 'node:crypto';
import {credential,db} from './store.ts';
export type FreeRoute={provider:'groq'|'openrouter';model:string;endpoint:string;key:string;identity:string;parameters:Record<string,unknown>};
type FreeProvider = FreeRoute['provider'];
export type CatalogCheck={provider:FreeProvider;status:string;message:string;eligibleModels:number;availableModels:number};
const cache=new Map<string,{at:number;routes:FreeRoute[]}>();
export function selectedAiProvider(){
 db().exec('CREATE TABLE IF NOT EXISTS ai_routing (id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL)');
 const saved=(db().prepare('SELECT provider FROM ai_routing WHERE id=1').get() as {provider:string}|undefined)?.provider;
 if(saved)return saved;
 return currentAccount()?'free_cloud':process.env.TEAM_AI_PROVIDER||'free_cloud';
}
export function saveAiRouting(provider:string){if(currentAccount()&&!['free_cloud','groq_free','openrouter_free'].includes(provider))throw new Error('Customer accounts use private direct free routes; shared host gateways are unavailable');if(!['free_cloud','freeride','openrouter_free','groq_free','nine_router'].includes(provider))throw new Error('Choose a supported free router');db().exec('CREATE TABLE IF NOT EXISTS ai_routing (id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL)');db().prepare('INSERT INTO ai_routing VALUES (1,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider').run(provider);return provider;}
export async function inspectFreeCloud(fetcher:typeof fetch=fetch, only?:FreeProvider){
 const providers=[{provider:'groq' as const,key:credential('GROQ_API_KEY'),base:'https://api.groq.com/openai/v1'},{provider:'openrouter' as const,key:credential('TEAM_REMOTE_KEY'),base:'https://openrouter.ai/api/v1'}].filter(p=>!only||p.provider===only);
 const checks:CatalogCheck[]=[];
 const lists=await Promise.allSettled(providers.map(async p=>{
  const check:CatalogCheck={provider:p.provider,status:'unavailable',message:'',eligibleModels:0,availableModels:0};checks.push(check);
  if(!p.key){check.status='key_missing';check.message='API key missing in this Penguin process. Save it privately in Connections; check the project folder and TERMINAL_DATA_DIR.';return [];}
  if(p.provider==='groq'&&(currentAccount()?((db().prepare('SELECT value FROM account_preferences WHERE name=?').get('groq_free_confirmed') as {value:string}|undefined)?.value!=='1'):process.env.FREERIDE_GROQ_FREE_CONFIRMED!=='1')){check.status='confirmation_off';check.message=currentAccount()?'Key is saved. Confirm your Groq free plan using the checkbox in Connections.':'Key is saved, but FREERIDE_GROQ_FREE_CONFIRMED=1 is not loaded by this Penguin process. Confirm your free plan, set it once in .env.local, then restart Penguin. A separately running FreeRide may have different settings.';return [];}
  const hash=createHash('sha256').update(p.provider+p.key).digest('hex'),hit=cache.get(hash);
  let catalogRoutes=hit&&Date.now()-hit.at<60000?hit.routes:undefined;
  if(!catalogRoutes){
  let response:Response;
  try{response=await fetcher(p.base+'/models',{headers:{Authorization:'Bearer '+p.key},signal:AbortSignal.timeout(12000),cache:'no-store'});}catch{check.status='network_error';check.message='Catalog request failed or timed out. Check this Penguin process\'s network/proxy access; no inference was made.';return [];}
  if(!response.ok){check.status='catalog_rejected';check.message=`Catalog HTTP ${response.status}. ${response.status===401||response.status===403?'Check key permissions, account access and provider restrictions.':response.status===429?'Catalog is rate limited; wait for the provider reset.':'Check provider availability.'} No inference was made.`;return [];}
  let data;
  try{data=await response.json();}catch{check.status='invalid_catalog';check.message='Catalog response was unreadable; no inference was made.';return [];}
  if(!Array.isArray(data.data)){check.status='invalid_catalog';check.message='Catalog did not contain a model list; no inference was made.';return [];}
  const models=data.data.filter((m:{id?:string;context_length?:number;pricing?:Record<string,unknown>;architecture?:{output_modalities?:string[]}})=>{
   if(!m.id||!(/^[A-Za-z0-9][A-Za-z0-9/_.:-]{1,150}$/).test(m.id))return false;
   if(p.provider==='groq')return ['llama-3.1-8b-instant','llama-3.3-70b-versatile','openai/gpt-oss-20b','openai/gpt-oss-120b'].includes(m.id);
   return m.id.endsWith(':free')&&(m.context_length||0)>=16384&&m.architecture?.output_modalities?.includes('text')&&m.pricing?.prompt!==undefined&&m.pricing?.completion!==undefined&&Object.values(m.pricing).every(v=>(typeof v==='string'||typeof v==='number')&&v!==null&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)===0)&&!/apodex|deepseek.*r1|qwq|reasoner|thinking/i.test(m.id);
  });
  const routes:FreeRoute[]=models.map((m:{id:string;supported_parameters?:string[]})=>({provider:p.provider,model:m.id,endpoint:p.base+'/chat/completions',key:p.key!,identity:createHash('sha256').update(p.base+'/chat/completions'+m.id).digest('hex'),parameters:p.provider==='groq'&&m.id.startsWith('openai/gpt-oss')?{reasoning_effort:'low'}:p.provider==='openrouter'&&m.supported_parameters?.includes('reasoning')?{reasoning:{enabled:false}}:{}})).sort((a:FreeRoute,b:FreeRoute)=>(a.model.includes('gpt-oss-120b')?2:a.model.includes('gpt-oss')?1:0)-(b.model.includes('gpt-oss-120b')?2:b.model.includes('gpt-oss')?1:0)||a.model.localeCompare(b.model));
  cache.set(hash,{at:Date.now(),routes});catalogRoutes=routes;
  }
  check.eligibleModels=catalogRoutes.length;
  let blocked=0,soonest=Infinity;
  const available=catalogRoutes.filter(r=>{
   if(db().prepare('SELECT identity FROM provider_blocks WHERE identity=?').get(r.identity)){blocked++;return false;}
   const cool=db().prepare('SELECT expires FROM free_model_cooldowns WHERE model=?').get(r.provider+':'+r.model) as {expires:number}|undefined;
   if(cool&&cool.expires>Date.now()){soonest=Math.min(soonest,cool.expires);return false;}return true;
  });
  check.availableModels=available.length;
  if(available.length){check.status='ready';check.message=`${available.length} available / ${catalogRoutes.length} eligible catalog models. Catalog access does not prove inference access.`;}
  else if(!catalogRoutes.length){check.status='no_eligible_models';check.message=p.provider==='groq'?'Catalog accessible, but no supported free-plan model IDs were listed.':'Catalog accessible, but no models pass the zero-price, :free, text/context and concise-model filters. Check account model eligibility and privacy settings.';}
  else{check.status='paused';check.message=`${catalogRoutes.length} eligible models, but none available. ${Number.isFinite(soonest)?`Cooldown: retry in ${Math.max(1,Math.ceil((soonest-Date.now())/1000))} seconds. `:''}${blocked?`${blocked} model(s) blocked after reported nonzero charges. `:''}Reservations and provider limits were preserved.`;}
  return available;
 }));
 // Unexpected errors stay categorical; raw provider errors can contain private data.
 lists.forEach((r,i)=>{if(r.status==='rejected'){checks[i].status='unavailable';checks[i].message='Catalog check failed; check server configuration. No inference was made.';}});
 return {routes:lists.flatMap(r=>r.status==='fulfilled'?r.value:[]),checks};
}
export async function freeCloudRoutes(fetcher:typeof fetch=fetch,only?:FreeProvider):Promise<FreeRoute[]>{
 const result=await inspectFreeCloud(fetcher,only);
 if(!result.routes.length)throw new Error('No verified free cloud route available. '+result.checks.map(c=>`${c.provider==='groq'?'Groq':'OpenRouter'}: ${c.message}`).join(' ')+' No inference was made.');return result.routes;
}
export function coolFreeRoute(route:FreeRoute,seconds=900){db().prepare('INSERT OR REPLACE INTO free_model_cooldowns VALUES (?,?)').run(route.provider+':'+route.model,Date.now()+seconds*1000);}
