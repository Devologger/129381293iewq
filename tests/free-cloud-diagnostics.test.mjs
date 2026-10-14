import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {db,saveCredential} from '../lib/server/store.ts';
import {freeCloudRoutes,inspectFreeCloud,coolFreeRoute} from '../lib/server/free-cloud.ts';
import {diagnoseProvider} from '../lib/server/agent-team.ts';
const folder=mkdtempSync(join(tmpdir(),'penguin-catalog-'));process.env.TERMINAL_DATA_DIR=folder;
after(()=>{db().close();rmSync(folder,{recursive:true,force:true});});
test('saved key with disabled confirmation explains the current process and makes no request',async()=>{
 saveCredential('GROQ_API_KEY','synthetic-confirmation-test');delete process.env.FREERIDE_GROQ_FREE_CONFIRMED;let gets=0;
 const check=await inspectFreeCloud(async()=>{gets++;throw new Error('unexpected');},'groq');
 assert.equal(check.checks[0].status,'confirmation_off');assert.match(check.checks[0].message,/not loaded by this Penguin process/);assert.equal(gets,0);
 await assert.rejects(freeCloudRoutes(undefined,'groq'),/A separately running FreeRide may have different settings/);
});
test('catalog 403 and network errors remain specific without echoing private response bodies',async()=>{
 process.env.FREERIDE_GROQ_FREE_CONFIRMED='1';saveCredential('TEAM_REMOTE_KEY','synthetic-metadata-test');
 const result=await inspectFreeCloud(async url=>url.includes('groq')?Response.json({error:'private key value should never appear'},{status:403}):Promise.reject(new Error('secret-url-value')));
 assert.equal(result.checks[0].status,'catalog_rejected');assert.match(result.checks[0].message,/HTTP 403/);assert.equal(result.checks[1].status,'network_error');assert.doesNotMatch(JSON.stringify(result.checks),/private key value|secret-url-value/);
});
test('cooldown remains enforced and reports the remaining wait rather than suggesting missing keys',async()=>{
 const catalog=async()=>Response.json({data:[{id:'openai/gpt-oss-20b'}]});
 const ready=await inspectFreeCloud(catalog,'groq');assert.equal(ready.routes.length,1);coolFreeRoute(ready.routes[0],90);
 const paused=await inspectFreeCloud(catalog,'groq');assert.equal(paused.routes.length,0);assert.equal(paused.checks[0].status,'paused');assert.match(paused.checks[0].message,/Cooldown: retry in \d+ seconds/);assert.doesNotMatch(paused.checks[0].message,/key missing/);
 await assert.rejects(diagnoseProvider(catalog,'groq_free'),/Cooldown/);
});
test('successful Groq diagnostics expose only safe checks while another provider can be rejected',async()=>{
 db().prepare('DELETE FROM free_model_cooldowns').run();
 const response=await diagnoseProvider(async url=>url.includes('groq')?Response.json({data:[]}):Response.json({error:'private'},{status:403}),'free_cloud');
 assert.match(response.message,/OpenRouter: Catalog HTTP 403/);assert.equal(response.checks[0].status,'ready');assert.doesNotMatch(JSON.stringify(response),/synthetic-|Bearer|api.groq.com/);
});
test('ineligible and malformed catalogs are distinguished, with zero inference requests',async()=>{
 saveCredential('GROQ_API_KEY','synthetic-ineligible');
 const empty=await inspectFreeCloud(async()=>Response.json({data:[{id:'paid-or-unknown-model'}]}),'groq');assert.equal(empty.checks[0].status,'no_eligible_models');
 saveCredential('GROQ_API_KEY','synthetic-malformed');const invalid=await inspectFreeCloud(async()=>Response.json({error:{secret:'never shown'}}),'groq');assert.equal(invalid.checks[0].status,'invalid_catalog');assert.doesNotMatch(JSON.stringify(invalid),/never shown/);
});
