import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {db,createWorkspace,updateWorkspace,saveCredential} from '../lib/server/store.ts';
import {runTeam,diagnoseProvider,budgetStatus,budgetConfig} from '../lib/server/agent-team.ts';
import {FREERIDE_URL,freerideToken,providerFailure} from '../lib/server/freeride.ts';
import {vaultNotes,vaultNote,saveAgentMemory,generateVaultViews} from '../lib/server/vault.ts';
process.env.TEAM_KEEP_LEGACY_GATEWAY='1';
const folder=mkdtempSync(join(tmpdir(),'penguin-check-'));
process.env.TERMINAL_DATA_DIR=folder;process.env.TERMINAL_VAULT_DIR=join(folder,'vault');
after(()=>{db().close();rmSync(folder,{recursive:true,force:true});});
const context='binance:spot:BTC:15m:exchange';
function workspace(){const id=randomBytes(24).toString('hex');createWorkspace(id);updateWorkspace(id,ws=>({...ws,bots:[{key:context,exchange:'binance',market:'spot',symbol:'BTC',timeframe:'15m',source:'exchange',research:{as_of:1,studies:[]}}]}));return id;}
test('403 diagnostics distinguish privacy/region without exposing raw errors or keys',async()=>{
 const secret='sk-synthetic-private';
 const privacy=await providerFailure(Response.json({error:{message:'No endpoints match your data policy '+secret}},{status:403}));
 assert.match(privacy,/privacy/);assert.ok(!privacy.includes(secret));
 assert.match(await providerFailure(Response.json({error:{message:'Country not supported'}},{status:403})),/region/);
 assert.match(await providerFailure(Response.json({error:{message:secret}},{status:403})),/denied access/);
});
test('actual gateway path uses private auth, atomic limits, metadata and charge blocking',async()=>{
 process.env.TEAM_AI_PROVIDER='freeride';process.env.TEAM_DAILY_CALL_LIMIT='3';
 let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,FREERIDE_URL+'/chat/completions');assert.equal(options.headers.Authorization,'Bearer '+freerideToken());assert.equal(JSON.parse(options.body).model,'auto');return Response.json({model:'test:free',_freeride_provider:'openrouter',usage:{prompt_tokens:10,completion_tokens:5,cost:0},choices:[{message:{content:'Research only.'},finish_reason:'stop'}]});};
 assert.equal(freerideToken(),freerideToken());
 const run=await runTeam(workspace(),context,'Gateway team review',false,fetcher);assert.equal(run.status,'COMPLETE');assert.equal(calls,3);assert.equal(run.messages[0].model,'openrouter/test:free');
 const blocked=await runTeam(workspace(),context,'Daily limit',false,fetcher);assert.equal(blocked.status,'COMPLETE');assert.equal(calls,6);
 process.env.TEAM_DAILY_CALL_LIMIT='9';
 const billed=await runTeam(workspace(),context,'Charge audit',false,async()=>Response.json({usage:{cost:.2}}));assert.equal(billed.status,'FAILED');assert.match(billed.error,/nonzero charge/);
 await runTeam(workspace(),context,'Stop subsequent charged gateway calls',false,fetcher);assert.equal(calls,6);
 db().prepare('DELETE FROM provider_blocks').run();delete process.env.TEAM_AI_PROVIDER;delete process.env.TEAM_DAILY_CALL_LIMIT;
});
test('gateway diagnostics reject unsafe capabilities and require no inference call',async()=>{
 process.env.TEAM_AI_PROVIDER='freeride';
 const response=await diagnoseProvider(async(url,options)=>{assert.ok(url.endsWith('/penguin/capabilities'));assert.equal(options.headers.Authorization,'Bearer '+freerideToken());return Response.json({gateway:'penguin-freeride',providers:['openrouter'],localModels:false,paidFallback:false,maxUpstreamAttempts:2});});
 assert.match(response.message,/no inference/);
 await assert.rejects(diagnoseProvider(async()=>Response.json({gateway:'other'})),/mismatch/);delete process.env.TEAM_AI_PROVIDER;
});
test('Obsidian browser isolates notes, excludes symlinks and creates real linked Canvas/Base',()=>{
 const id=workspace(),other=workspace();saveAgentMemory(id,'# Memory\n[[Experiment]]\nBounded hypothesis.');
 const directory=join(folder,'vault','Research',id);writeFileSync(join(directory,'Experiment.md'),'# Experiment\n[[Agent Memory]]');
 assert.equal(vaultNotes(other).length,0);assert.equal(vaultNotes(id).length,2);
 assert.throws(()=>vaultNote(id,'../storage.key'),/Invalid/);
 assert.match(vaultNote(id,'Agent Memory.md').uri,/^obsidian:\/\/open\?path=/);
 generateVaultViews(id);const canvas=JSON.parse(readFileSync(join(directory,'Penguin Generated Map.canvas'),'utf8'));assert.equal(canvas.nodes.length,2);assert.equal(canvas.edges.length,2);
 assert.match(readFileSync(join(directory,'Penguin Research.base'),'utf8'),new RegExp(id));
 assert.throws(()=>saveAgentMemory(id,'x'.repeat(5001)),/5000/);
});

test('vault rejects symlinked notes', {skip:process.platform==='win32' ? 'Windows file symlinks require Developer Mode or administrator permission; validated on Linux' : false},()=>{
 const id=workspace();saveAgentMemory(id,'Private research context.');const directory=join(folder,'vault','Research',id);
 symlinkSync(join(folder,'freeride-gateway.token'),join(directory,'Secret.md'));assert.equal(vaultNotes(id).length,1);assert.throws(()=>vaultNote(id,'Secret.md'),/Unsafe/);
});

test('truncation and reasoning-only responses are accounted once and explain the failure',async()=>{
 process.env.TEAM_AI_PROVIDER='freeride';process.env.TEAM_DAILY_CALL_LIMIT='30';
 try {
  let calls=0;
  const fetcher=async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).max_tokens,2000);return Response.json({model:'reasoning/test:free',usage:{prompt_tokens:20,completion_tokens:2000,completion_tokens_details:{reasoning_tokens:1980}},choices:[{finish_reason:'length',message:{content:'Unfinished draft',reasoning:'Hidden reasoning must not become an answer'}}]});};
  const before=budgetStatus();const run=await runTeam(workspace(),context,'Truncation audit',false,fetcher);
  assert.equal(run.status,'FAILED');assert.equal(calls,1);assert.equal(run.messages.length,0);assert.equal(run.note,undefined);
  assert.match(run.error,/output limit reached/);assert.match(run.error,/cap 2000/);assert.match(run.error,/reasoning tokens 1980/);assert.ok(!run.error.includes('Hidden reasoning'));
  assert.equal(budgetStatus().outputTokens,before.outputTokens+2000);
  const empty=await runTeam(workspace(),context,'Empty answer audit',false,async()=>{calls++;return Response.json({model:'reasoning/test:free',usage:{prompt_tokens:10,completion_tokens:100},choices:[{finish_reason:'stop',message:{content:null,reasoning:'Do not display'}}]});});
  assert.match(empty.error,/no final answer/);assert.equal(calls,2);assert.equal(empty.messages.length,0);
 } finally {delete process.env.TEAM_AI_PROVIDER;delete process.env.TEAM_DAILY_CALL_LIMIT;}
});
test('bounded output allowance reaches the provider and completes reviews; invalid cap blocks calls',async()=>{
 process.env.TEAM_AI_PROVIDER='freeride';process.env.TEAM_DAILY_CALL_LIMIT='30';process.env.TEAM_MAX_OUTPUT_TOKENS='4000';
 try {let calls=0;const fetcher=async(url,options)=>{calls++;const request=JSON.parse(options.body);assert.equal(request.max_tokens,4000);assert.match(request.messages[0].content,/at most 220 words/);return Response.json({usage:{prompt_tokens:10,completion_tokens:40},choices:[{finish_reason:'stop',message:{content:'Complete bounded review.'}}]});};
 const run=await runTeam(workspace(),context,'Configured allowance',false,fetcher);assert.equal(run.status,'COMPLETE');assert.equal(calls,3);
 process.env.TEAM_MAX_OUTPUT_TOKENS='4001';assert.throws(()=>budgetConfig(),/256 to 4000/);await assert.rejects(runTeam(workspace(),context,'Invalid output cap',false,fetcher),/256 to 4000/);assert.equal(calls,3);
 } finally {delete process.env.TEAM_AI_PROVIDER;delete process.env.TEAM_DAILY_CALL_LIMIT;delete process.env.TEAM_MAX_OUTPUT_TOKENS;}
});
test('Groq diagnostics distinguish missing key, confirmation, stale gateway and old output cap',async()=>{
 process.env.TEAM_AI_PROVIDER='freeride';delete process.env.FREERIDE_GROQ_FREE_CONFIRMED;
 const info={gateway:'penguin-freeride',providers:['openrouter'],localModels:false,paidFallback:false,maxUpstreamAttempts:2,maxOutputTokens:4000};
 const fetcher=async()=>Response.json(info);
 try {assert.match((await diagnoseProvider(fetcher)).message,/Groq key is missing/);saveCredential('GROQ_API_KEY','synthetic-only-groq-key');
 assert.match((await diagnoseProvider(fetcher)).message,/confirmation is off/);process.env.FREERIDE_GROQ_FREE_CONFIRMED='1';
 assert.match((await diagnoseProvider(fetcher)).message,/gateway has not loaded Groq/);info.providers.push('groq');assert.ok(!(await diagnoseProvider(fetcher)).message.includes('Groq key'));
 info.maxOutputTokens=1000;assert.match((await diagnoseProvider(fetcher)).message,/older output cap/);
 } finally {delete process.env.TEAM_AI_PROVIDER;delete process.env.FREERIDE_GROQ_FREE_CONFIRMED;}
});

test('readiness diagnostics distinguish model availability and cooldown without inference',async()=>{
 process.env.TEAM_AI_PROVIDER='freeride';
 try {let ready=false;let gets=0;const fetcher=async(url,options)=>{assert.equal(options.method,undefined);gets++;return Response.json(url.endsWith('/capabilities')?{gateway:'penguin-freeride',providers:['openrouter','groq'],localModels:false,paidFallback:false,maxUpstreamAttempts:2,maxOutputTokens:4000,readinessVersion:1}:{ready,providers:[{provider:'openrouter',status:'cooldown',retryAfterSeconds:45},{provider:'groq',status:ready?'ready':'no_eligible_models',eligibleModels:ready?2:0}]});};await assert.rejects(diagnoseProvider(fetcher),/retry in 45 seconds/);ready=true;assert.match((await diagnoseProvider(fetcher)).message,/Groq: 2 eligible free models/);assert.equal(gets,4);
 }finally{delete process.env.TEAM_AI_PROVIDER;}
});
test('explicit private gateway no-inference rejection preserves count without uncertain reservation',async()=>{
 process.env.TEAM_AI_PROVIDER='freeride';process.env.TEAM_DAILY_CALL_LIMIT='100';
 try{const before=budgetStatus();const run=await runTeam(workspace(),context,'No provider ready fixture',false,async()=>Response.json({error:{type:'gateway_not_ready'}},{status:409}));assert.equal(run.status,'FAILED');assert.match(run.error,/no eligible provider/);assert.doesNotMatch(run.error,/reservation retained/);const after=budgetStatus();assert.equal(after.calls,before.calls+1);assert.equal(after.unknownCalls,before.unknownCalls);}finally{delete process.env.TEAM_AI_PROVIDER;delete process.env.TEAM_DAILY_CALL_LIMIT;}
});
