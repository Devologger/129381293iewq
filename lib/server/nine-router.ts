import {createHash} from 'node:crypto';
import {credential} from './store.ts';
import {freeCloudRoutes, type FreeRoute} from './free-cloud.ts';

export const NINE_ROUTER_URL = 'http://127.0.0.1:20128/v1';
// A gateway's catalog alone cannot establish that its upstream inference is free.
export async function nineRouterRoutes(fetcher: typeof fetch = fetch): Promise<FreeRoute[]> {
  const key = credential('NINE_ROUTER_KEY');
  if (!key || process.env.NINE_ROUTER_FREE_ONLY_CONFIRMED !== '1') throw new Error('9Router not configured: save its restricted endpoint key in Settings and complete the free-only setup guide. No inference was made.');
  const allowed = (process.env.NINE_ROUTER_FREE_MODELS || '').split(',').map(v=>v.trim()).filter(Boolean);
  if (!allowed.length || allowed.some(v=>!/^groq\/[A-Za-z0-9/_.:-]+$|^openrouter\/[A-Za-z0-9/_.:-]+:free$/.test(v))) throw new Error('9Router requires exact groq/ or openrouter/ free model IDs; aliases, combos and wildcards are disabled.');
  const upstream = await freeCloudRoutes(fetcher);
  const response = await fetcher(NINE_ROUTER_URL+'/models', {headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000),cache:'no-store'});
  if (!response.ok) throw new Error(`9Router catalog unavailable (HTTP ${response.status}); no inference was made.`);
  const body = await response.json();
  const catalog = new Set((Array.isArray(body.data)?body.data:[]).map((m:{id?:string})=>m.id));
  const routes = upstream.filter(r=>allowed.includes(r.provider+'/'+r.model)&&catalog.has(r.provider+'/'+r.model)).map(r=>({...r,model:r.provider+'/'+r.model,key,endpoint:NINE_ROUTER_URL+'/chat/completions',identity:createHash('sha256').update(NINE_ROUTER_URL+r.provider+'/'+r.model).digest('hex')}));
  if (!routes.length) throw new Error('No 9Router model matches both its restricted catalog and verified upstream free catalogs. Check connections and exact model IDs.');
  return routes;
}
