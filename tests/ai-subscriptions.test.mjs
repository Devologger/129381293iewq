import {remoteSecrets} from '../lib/server/hosted.ts';
import {saveAiRouting} from '../lib/server/free-cloud.ts';
import test,{after} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {accountContext} from '../lib/server/account-context.ts';import {bindAdmin,isAdmin,ADMIN_EMAIL} from '../lib/server/admin.ts';
import {requireAiAccess,aiAccess,AiSubscriptionError} from '../lib/server/ai-access.ts';
import {askAppHelper,runTeam,compareRoutes,diagnoseProvider,budgetStatus,runScheduledTeams} from '../lib/server/agent-team.ts';
import {db,createWorkspace,saveCredential,updateWorkspace} from '../lib/server/store.ts';
const folder=mkdtempSync(join(tmpdir(),'penguin-entitlements-'));process.env.TERMINAL_DATA_DIR=folder;process.env.TERMINAL_VAULT_DIR=join(folder,'vault');const realFetch=global.fetch;
const account={id:'1'.repeat(32),workspaceId:'a'.repeat(48),email:'customer@example.test',name:'Customer'};
after(()=>{global.fetch=realFetch;for(const value of [account,undefined])accountContext.run(value,()=>db().close());rmSync(folder,{recursive:true,force:true});});
test('unsubscribed customer cannot invoke help, council, diagnostics, comparisons, cache or scheduled inference',async()=>{
 await accountContext.run(account,async()=>{
 createWorkspace(account.workspaceId);saveCredential('TEAM_REMOTE_KEY','synthetic-free-key');let calls=0;const fetcher=async()=>{calls++;throw new Error('No provider access expected');};
 const context='binance:spot:BTC:15m:exchange';updateWorkspace(account.workspaceId,ws=>({...ws,bots:[{key:context,exchange:'binance',market:'spot',symbol:'BTC',timeframe:'15m',source:'exchange',research:{as_of:123,studies:[],decision:'keep_baseline'}}]}));
 for(const action of [()=>askAppHelper(account.workspaceId,'How does research work?',fetcher),()=>runTeam(account.workspaceId,context,'Review the setup',false,fetcher),()=>compareRoutes(account.workspaceId,['free_cloud'],fetcher),()=>diagnoseProvider(fetcher)])await assert.rejects(action(),e=>e instanceof AiSubscriptionError&&e.status===402);
 db().prepare('INSERT INTO team_settings VALUES (?,?)').run(account.workspaceId,JSON.stringify({enabled:true,contextKey:context,nextAt:0,intervalMinutes:480}));await runScheduledTeams(fetcher);assert.equal(calls,0);assert.equal(budgetStatus().calls,0);assert.equal(db().prepare('SELECT COUNT(*) AS n FROM team_runs').get().n,0);
 });
});
test('only active configured-price subscriptions unlock AI; outage and trial stay closed',async()=>{
 process.env.PENGUIN_AUTH_PROVIDER='supabase';process.env.SUPABASE_URL='https://synthetic-project.supabase.co';process.env.SUPABASE_ANON_KEY='anon';process.env.SUPABASE_SERVICE_ROLE_KEY='service';process.env.STRIPE_SECRET_KEY='synthetic-stripe';process.env.STRIPE_WEBHOOK_SECRET='synthetic-webhook';process.env.STRIPE_PRICE_ID='price_test';
 await accountContext.run(account,async()=>{for(const status of ['inactive','trialing','past_due','unpaid','canceled','incomplete']){global.fetch=async()=>Response.json([{status,price_id:'price_test',access_until:Math.floor(Date.now()/1000)+3600}]);await assert.rejects(requireAiAccess(),e=>e.status===402);}global.fetch=async()=>Response.json([{status:'active',price_id:'price_test',access_until:Math.floor(Date.now()/1000)-1}]);await assert.rejects(requireAiAccess(),e=>e.status===402);global.fetch=async()=>Response.json([{status:'active',price_id:'price_other'}]);await assert.rejects(requireAiAccess(),e=>e.status===402);global.fetch=async()=>{throw new Error('Synthetic outage');};await assert.rejects(requireAiAccess(),e=>e.status===503);global.fetch=async()=>Response.json([{status:'active',price_id:'price_test',access_until:Math.floor(Date.now()/1000)+3600}]);await assert.doesNotReject(requireAiAccess());});
});
test('subscribed help sends concise grounded instructions once and reuses only authorized cache',async()=>{
 global.fetch=async()=>Response.json([{status:'active',price_id:'price_test',access_until:Math.floor(Date.now()/1000)+3600}]);
 await accountContext.run(account,()=>remoteSecrets.run(new Map([['TEAM_REMOTE_KEY','synthetic-free-key']]),async()=>{
 saveAiRouting('openrouter_free');let requests=0;
 const fetcher=async(url,options)=>{if(url.endsWith('/models'))return Response.json({data:[{id:'test/chat:free',context_length:32768,architecture:{output_modalities:['text']},pricing:{prompt:'0',completion:'0'}}]});requests++;const body=JSON.parse(options.body);assert.match(body.messages[0].content,/Answer the actual question directly/);assert.match(body.messages[0].content,/No nested lists/);assert.match(body.messages[0].content,/no agent grants final approval/i);assert.equal(body.tools,undefined);return Response.json({usage:{prompt_tokens:20,completion_tokens:25,cost:0},choices:[{finish_reason:'stop',message:{content:'The team reviews evidence.\n\n- **Analyst:** studies the report.\n- **Risk:** challenges it.\n- **Curator:** saves the briefing.'}}]});};
 const answer=await askAppHelper(account.workspaceId,'What does the team actually do?',fetcher);assert.equal(answer.cached,false);assert.equal(requests,1);assert.equal((await askAppHelper(account.workspaceId,'What does the team actually do?',fetcher)).cached,true);
 global.fetch=async()=>Response.json([{status:'canceled',price_id:'price_test',access_until:Math.floor(Date.now()/1000)+3600}]);await assert.rejects(askAppHelper(account.workspaceId,'What does the team actually do?',fetcher),e=>e.status===402);assert.equal(requests,1);
 }));
});
test('reserved email alone never grants admin; binding requires exact UUID and hosted identity',async()=>{
 const fake={...account,email:ADMIN_EMAIL};assert.equal(isAdmin(fake),false);bindAdmin('2'.repeat(32));assert.equal(isAdmin(fake),false);assert.equal(isAdmin({...fake,id:'2'.repeat(32)}),true);assert.equal(isAdmin({...fake,id:'2'.repeat(32),email:'other@example.test'}),false);assert.throws(()=>bindAdmin('3'.repeat(32)),/already bound/);
 global.fetch=async()=>{throw new Error('Admin should not call Stripe for its exception');};await accountContext.run({...fake,id:'2'.repeat(32)},async()=>{assert.equal((await aiAccess()).admin,true);await assert.doesNotReject(requireAiAccess());});
 delete process.env.PENGUIN_AUTH_PROVIDER;assert.equal(isAdmin({...fake,id:'2'.repeat(32)}),false);
});
