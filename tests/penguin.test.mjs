import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {db,createWorkspace,updateWorkspace,saveCredential} from '../lib/server/store.ts';
import {runTeam,diagnoseProvider,budgetStatus} from '../lib/server/agent-team.ts';
import {FREERIDE_URL,freerideToken,providerFailure} from '../lib/server/freeride.ts';
import {vaultNotes,vaultNote,saveAgentMemory,generateVaultViews} from '../lib/server/vault.ts';
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
 const blocked=await runTeam(workspace(),context,'Daily limit',false,fetcher);assert.equal(blocked.status,'FAILED');assert.equal(calls,3);
 process.env.TEAM_DAILY_CALL_LIMIT='9';
 const billed=await runTeam(workspace(),context,'Charge audit',false,async()=>Response.json({usage:{cost:.2}}));assert.equal(billed.status,'FAILED');assert.match(billed.error,/nonzero charge/);
 await runTeam(workspace(),context,'Stop subsequent charged gateway calls',false,fetcher);assert.equal(calls,3);
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
