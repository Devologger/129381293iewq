import {createHash} from 'node:crypto';
import {credential,db} from './store.ts';
export type FreeRoute={provider:'groq'|'openrouter';model:string;endpoint:string;key:string;identity:string;parameters:Record<string,unknown>};
const cache=new Map<string,{at:number;routes:FreeRoute[]}>();
export function selectedAiProvider(){db().exec('CREATE TABLE IF NOT EXISTS ai_routing (id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL)');return (db().prepare('SELECT provider FROM ai_routing WHERE id=1').get() as {provider:string}|undefined)?.provider||process.env.TEAM_AI_PROVIDER||'openrouter_free';}
export function saveAiRouting(provider:string){if(!['free_cloud','freeride','openrouter_free'].includes(provider))throw new Error('Choose a supported free router');db().exec('CREATE TABLE IF NOT EXISTS ai_routing (id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL)');db().prepare('INSERT INTO ai_routing VALUES (1,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider').run(provider);return provider;}
export async function freeCloudRoutes(fetcher:typeof fetch=fetch):Promise<FreeRoute[]>{
 const providers=[{provider:'groq' as const,key:process.env.FREERIDE_GROQ_FREE_CONFIRMED==='1'?credential('GROQ_API_KEY'):null,base:'https://api.groq.com/openai/v1'},{provider:'openrouter' as const,key:credential('TEAM_REMOTE_KEY'),base:'https://openrouter.ai/api/v1'}];
 const lists=await Promise.allSettled(providers.filter(p=>p.key).map(async p=>{
  const hash=createHash('sha256').update(p.provider+p.key).digest('hex'),hit=cache.get(hash);if(hit&&Date.now()-hit.at<60000)return hit.routes;
  const response=await fetcher(p.base+'/models',{headers:{Authorization:'Bearer '+p.key},signal:AbortSignal.timeout(12000),cache:'no-store'});if(!response.ok)throw new Error(`${p.provider} catalog HTTP ${response.status}`);
  const data=await response.json();const models=(Array.isArray(data.data)?data.data:[]).filter((m:{id?:string;context_length?:number;pricing?:Record<string,unknown>;architecture?:{output_modalities?:string[]}})=>{
   if(!m.id||!(/^[A-Za-z0-9][A-Za-z0-9/_.:-]{1,150}$/).test(m.id))return false;
   if(p.provider==='groq')return ['llama-3.1-8b-instant','llama-3.3-70b-versatile','openai/gpt-oss-20b','openai/gpt-oss-120b'].includes(m.id);
   return m.id.endsWith(':free')&&(m.context_length||0)>=16384&&m.architecture?.output_modalities?.includes('text')&&m.pricing?.prompt!==undefined&&m.pricing?.completion!==undefined&&Object.values(m.pricing).every(v=>(typeof v==='string'||typeof v==='number')&&v!==null&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)===0)&&!/apodex|deepseek.*r1|qwq|reasoner|thinking/i.test(m.id);
  });
  const routes=models.map((m:{id:string;supported_parameters?:string[]})=>({provider:p.provider,model:m.id,endpoint:p.base+'/chat/completions',key:p.key!,identity:createHash('sha256').update(p.base+'/chat/completions'+m.id).digest('hex'),parameters:p.provider==='groq'&&m.id.startsWith('openai/gpt-oss')?{reasoning_effort:'low'}:p.provider==='openrouter'&&m.supported_parameters?.includes('reasoning')?{reasoning:{enabled:false}}:{}})).sort((a:FreeRoute,b:FreeRoute)=>Number(a.model.includes('gpt-oss'))-Number(b.model.includes('gpt-oss'))||a.model.localeCompare(b.model));
  cache.set(hash,{at:Date.now(),routes});return routes;
 }));
 const routes=lists.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(r=>{const cool=db().prepare('SELECT expires FROM free_model_cooldowns WHERE model=?').get(r.provider+':'+r.model) as {expires:number}|undefined;return (!cool||cool.expires<Date.now())&&!db().prepare('SELECT identity FROM provider_blocks WHERE identity=?').get(r.identity);});
 if(!routes.length)throw new Error('No verified free cloud route available. Add OpenRouter or confirmed Groq free-plan keys in Settings; provider catalogs/quotas may be unavailable. No inference was made.');return routes;
}
export function coolFreeRoute(route:FreeRoute){db().prepare('INSERT OR REPLACE INTO free_model_cooldowns VALUES (?,?)').run(route.provider+':'+route.model,Date.now()+900000);}
