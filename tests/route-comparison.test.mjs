import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {db,createWorkspace,saveCredential} from '../lib/server/store.ts';
import {compareRoutes,routeComparisons,budgetStatus,saveDailyCallLimit} from '../lib/server/agent-team.ts';
import {selectedAiProvider,saveAiRouting} from '../lib/server/free-cloud.ts';
import {nineRouterRoutes,NINE_ROUTER_URL} from '../lib/server/nine-router.ts';
const folder=mkdtempSync(join(tmpdir(),'penguin-compare-'));
process.env.TERMINAL_DATA_DIR=folder;process.env.TEAM_DAILY_CALL_LIMIT='100';process.env.FREERIDE_GROQ_FREE_CONFIRMED='1';
saveCredential('GROQ_API_KEY','synthetic-groq');saveAiRouting('free_cloud');
after(()=>{db().close();rmSync(folder,{recursive:true,force:true});});
function workspace(){const id=randomBytes(24).toString('hex');createWorkspace(id);return id;}
function catalog(){return Response.json({data:[{id:'llama-3.1-8b-instant'}]});}
function answer(model){return Response.json({model,choices:[{finish_reason:'stop',message:{content:'192 bars. Reward/risk is 2:1. Fees and future returns need validation.'}}],usage:{prompt_tokens:30,completion_tokens:20}});}
test('comparison uses the same small prompt and shared ledger without changing router',async()=>{
 const id=workspace(),prompts=[];let posts=0;const before=budgetStatus().calls;
 const result=await compareRoutes(id,['free_cloud','groq_free'],async(url,opts)=>{
  if(url.endsWith('/models'))return catalog();posts++;const body=JSON.parse(opts.body);assert.equal(body.max_tokens,512);prompts.push(body.messages[1].content);return answer(body.model);
 });
 assert.equal(posts,2);assert.equal(prompts[0],prompts[1]);assert.equal(selectedAiProvider(),'free_cloud');assert.equal(budgetStatus().calls-before,2);
 assert.ok(result.results.every(r=>r.status==='COMPLETE'&&r.checkPassed&&r.inputTokens===30));assert.equal(routeComparisons(id)[0].id,result.id);
});
test('uncertain comparison outcome consumes one reservation and never resends',async()=>{
 let posts=0;const result=await compareRoutes(workspace(),['groq_free'],async(url)=>{if(url.endsWith('/models'))return catalog();posts++;return Response.json({error:'synthetic'},{status:503});});
 assert.equal(posts,1);assert.equal(result.results[0].unknownCalls,1);assert.equal(result.results[0].status,'FAILED');
});
test('9Router stays unconfigured until free-only confirmation and rejects paid aliases',async()=>{
 let calls=0;await assert.rejects(nineRouterRoutes(async()=>{calls++;return catalog();}),/not configured/);assert.equal(calls,0);
 saveCredential('NINE_ROUTER_KEY','synthetic-restricted-key');process.env.NINE_ROUTER_FREE_ONLY_CONFIRMED='1';process.env.NINE_ROUTER_FREE_MODELS='best-auto';
 await assert.rejects(nineRouterRoutes(),/exact/);
 process.env.NINE_ROUTER_FREE_MODELS='openrouter/vendor/paid-model';await assert.rejects(nineRouterRoutes(),/exact/);
});
test('9Router only sends exact verified free targets and accounts gateway requests',async()=>{
 db().prepare('DELETE FROM free_model_cooldowns').run();process.env.NINE_ROUTER_FREE_MODELS='groq/llama-3.1-8b-instant';let posts=0;
 const result=await compareRoutes(workspace(),['nine_router'],async(url,opts)=>{
  if(url===NINE_ROUTER_URL+'/models')return Response.json({data:[{id:'groq/llama-3.1-8b-instant'},{id:'paid/auto'}]});
  if(url.endsWith('/models'))return catalog();assert.equal(url,NINE_ROUTER_URL+'/chat/completions');assert.equal(opts.headers.Authorization,'Bearer synthetic-restricted-key');const body=JSON.parse(opts.body);assert.equal(body.model,'groq/llama-3.1-8b-instant');posts++;return answer(body.model);
 });assert.equal(posts,1);assert.equal(result.results[0].status,'COMPLETE');assert.equal(result.results[0].calls,1);
});
test('exhausted allowance blocks probes before inference and rejects unsupported paid routes',async()=>{
 await assert.rejects(compareRoutes(workspace(),['openai']),/supported free/);
 saveDailyCallLimit(3);let posts=0;const result=await compareRoutes(workspace(),['groq_free'],async(url)=>{if(url.endsWith('/models'))return catalog();posts++;return answer('unexpected');});assert.equal(posts,0);assert.equal(result.results[0].status,'NOT_RUN');assert.match(result.results[0].error,/Daily call limit/);
});
