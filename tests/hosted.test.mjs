import {hostedAccountAction} from '../lib/server/hosted-auth.ts';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHmac} from 'node:crypto';
import {sealSecret,openSecret,hostedIdentity,loadHostedSecrets,saveHostedSecret,remoteSecrets,supabase} from '../lib/server/hosted.ts';
import {rememberHosted,resolveHostedAccount,withAccount,runAllAccounts,accountFromRequest,revokeAccountSessions} from '../lib/server/accounts.ts';
import {accountContext} from '../lib/server/account-context.ts';
import {credential,db,savePrivateCredential} from '../lib/server/store.ts';
import {verifyStripeSignature,applyBillingEvent,requireTradingPlan} from '../lib/server/billing.ts';
const folder=mkdtempSync(join(tmpdir(),'penguin-hosted-'));process.env.TERMINAL_DATA_DIR=folder;process.env.PENGUIN_SECRET_MASTER_KEY='37'.repeat(32);process.env.SUPABASE_URL='https://synthetic-project.supabase.co';process.env.SUPABASE_ANON_KEY='synthetic-anon';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';
const user={id:'12345678-1234-1234-1234-123456789abc',email:'hosted@example.test',email_confirmed_at:'2026-10-16T00:00:00Z',user_metadata:{name:'Hosted'}};
const other={...user,id:'87654321-1234-1234-1234-123456789abc',email:'other@example.test'};
const tokens={access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600};
let session,second;const realFetch=global.fetch;
after(()=>{global.fetch=realFetch;delete process.env.PENGUIN_AUTH_PROVIDER;for(const a of [session?.account,second?.account,undefined])accountContext.run(a,()=>db().close());rmSync(folder,{recursive:true,force:true});});
const request=s=>new Request('https://penguin.test/api/terminal/workspace',{headers:{cookie:'penguin_session='+s.token}});
test('encryption authenticates user, setting, key, and ciphertext; database stores no plaintext',()=>{
 const encrypted=sealSecret(user.id,'GROQ_API_KEY','synthetic-secret');assert.equal(openSecret(user.id,'GROQ_API_KEY',encrypted),'synthetic-secret');assert.throws(()=>openSecret(other.id,'GROQ_API_KEY',encrypted));assert.throws(()=>openSecret(user.id,'TEAM_REMOTE_KEY',encrypted));const parts=encrypted.split('.');parts[2]=Buffer.from('tampered').toString('base64');assert.throws(()=>openSecret(user.id,'GROQ_API_KEY',parts.join('.')));assert.throws(()=>hostedIdentity({...user,email_confirmed_at:undefined}),/Verify/);
});
test('hosted credential transport uses service role, exact tenant filter, ciphertext-only writes and empty responses',async()=>{
 const identity=hostedIdentity(user);const encrypted=sealSecret(user.id,'GROQ_API_KEY','tenant-secret');const fetcher=async(url,options)=>{assert.equal(options.headers.apikey,'synthetic-service');assert.equal(options.redirect,'error');if(options.method==='POST'){const body=JSON.parse(options.body);assert.equal(body.user_id,user.id);assert.equal(openSecret(user.id,body.name,body.ciphertext),'replacement');assert.doesNotMatch(options.body,/replacement/);return new Response(null,{status:201});}assert.equal(new URL(url).searchParams.get('user_id'),'eq.'+user.id);return Response.json([{name:'GROQ_API_KEY',ciphertext:encrypted}]);};
 const map=await loadHostedSecrets(identity.id,fetcher);assert.equal(map.get('GROQ_API_KEY'),'tenant-secret');await remoteSecrets.run(map,()=>saveHostedSecret(identity.id,'GROQ_API_KEY','replacement',fetcher));assert.equal(map.get('GROQ_API_KEY'),'replacement');
});
test('opaque hosted sessions validate against Auth, never accept local-only cookies, and isolate requests and workers',async()=>{
 process.env.PENGUIN_AUTH_PROVIDER='supabase';session=rememberHosted(user,tokens);second=rememberHosted(other,tokens);
 const disk=readFileSync(join(folder,'accounts.sqlite-wal'),'utf8');assert.doesNotMatch(disk,/synthetic-access|synthetic-refresh/);
 let seen=[];global.fetch=async(url,options)=>{if(url.endsWith('/auth/v1/user')){assert.equal(options.headers.Authorization,'Bearer synthetic-access');return Response.json(user);}if(url.includes('/integration_secrets')){const target=new URL(url).searchParams.get('user_id').slice(3);seen.push(target);return Response.json([{name:'GROQ_API_KEY',ciphertext:sealSecret(target,'GROQ_API_KEY',target===user.id?'alice-key':'bob-key')}]);}throw new Error('Unexpected request');};
 assert.equal((await resolveHostedAccount(request(session))).id,session.account.id);
 const handler=withAccount(()=>Response.json({key:credential('GROQ_API_KEY'),host:credential('TEAM_REMOTE_KEY')||null}));process.env.TEAM_REMOTE_KEY='private-host';
 assert.equal((await handler(new Request('https://penguin.test/api/terminal/workspace'))).status,401);
 assert.deepEqual(await (await handler(request(session))).json(),{key:'alice-key',host:null});
 const observed=[];await runAllAccounts(async()=>observed.push(credential('GROQ_API_KEY')));assert.deepEqual(observed,['alice-key','bob-key']);assert.equal(seen.length,3);
 global.fetch=async()=>Response.json(other);await assert.rejects(resolveHostedAccount(request(session)),/mismatch/);
 revokeAccountSessions(session.account.id);assert.equal(accountFromRequest(request(session)),null);delete process.env.TEAM_REMOTE_KEY;
});
test('hosted request refuses unavailable secret storage instead of using host keys',async()=>{
 global.fetch=async url=>url.endsWith('/user')?Response.json(other):Response.json({error:'unavailable'},{status:503});const handler=withAccount(()=>Response.json({executed:true}));const response=await handler(request(second));assert.equal(response.status,503);assert.equal((await response.json()).executed,undefined);
 await assert.rejects(accountContext.run(second.account,()=>savePrivateCredential('JARVIS_TTS_APP_KEY','obsolete')),/Unsupported/);
});
test('Stripe validates raw payload signatures, timestamps, and key rotation signatures',()=>{
 const body=JSON.stringify({id:'evt_test'}),now=Date.now(),stamp=Math.floor(now/1000),secret='synthetic-webhook';const sig=createHmac('sha256',secret).update(stamp+'.'+body).digest('hex');assert.doesNotThrow(()=>verifyStripeSignature(body,`t=${stamp},v1=${'0'.repeat(64)},v1=${sig}`,secret,now));assert.throws(()=>verifyStripeSignature(body+' ',`t=${stamp},v1=${sig}`,secret,now));assert.throws(()=>verifyStripeSignature(body,`t=${stamp},v1=${sig}`,secret,now+301000));
});
test('billing events fetch current subscription and send scoped state to transactional RPC',async()=>{
 process.env.STRIPE_SECRET_KEY='synthetic-stripe';let rpc;
 await applyBillingEvent({id:'evt_test123',created:123,type:'customer.subscription.updated',data:{object:{id:'sub_test123'}}},async(url,options)=>{if(url.startsWith('https://api.stripe.com/'))return Response.json({id:'sub_test123',created:100,customer:'cus_test',metadata:{penguin_user:user.id},status:'active',current_period_end:Math.floor(Date.now()/1000)+3600,items:{data:[{price:{id:'price_configured'}}]}});rpc=JSON.parse(options.body);assert.equal(options.headers.apikey,'synthetic-service');return Response.json(null);});assert.equal(rpc.p_user,user.id);assert.equal(rpc.p_subscription_created,100);assert.equal(rpc.p_status,'active');assert.equal(rpc.p_event,'evt_test123');
});

test('hosted refresh is serialized and never exposes provider tokens in the browser session',async()=>{
 const fresh=rememberHosted(user,{...tokens,expires_in:1});let refreshes=0;
 global.fetch=async(url,options)=>{if(url.includes('grant_type=refresh_token')){refreshes++;assert.equal(JSON.parse(options.body).refresh_token,'synthetic-refresh');await new Promise(r=>setTimeout(r,5));return Response.json({...tokens,access_token:'rotated-access'});}assert.equal(options.headers.Authorization,'Bearer rotated-access');return Response.json(user);};
 const results=await Promise.all([resolveHostedAccount(request(fresh)),resolveHostedAccount(request(fresh))]);assert.equal(refreshes,1);assert.equal(results[0].id,results[1].id);assert.match(fresh.token,/^[a-f0-9]{64}$/);assert.notEqual(fresh.token,'rotated-access');
});
test('hosted signup enforces invitation and enrollment; verification, reset and outage logout work',async()=>{
 process.env.PENGUIN_OPEN_SIGNUP='0';process.env.PENGUIN_SIGNUP_CODE='synthetic-invite';
 const identity={...user,id:'99999999-1234-1234-1234-123456789abc',email:'invited@example.test'};let calls=0;
 global.fetch=async(url)=>{calls++;if(url.endsWith('/signup'))return Response.json({user:identity});if(url.endsWith('/verify')||url.includes('grant_type=password'))return Response.json({...tokens,user:identity});if(url.includes('/logout')||url.endsWith('/recover'))return new Response(null,{status:204});if(url.endsWith('/user'))return Response.json(identity);throw new Error('Unexpected request');};
 const req=new Request('https://penguin.test/api/account');
 await assert.rejects(hostedAccountAction(req,{action:'signup',email:identity.email,name:'Invited',password:'synthetic-password',acceptedTerms:true,invitation:'wrong'}),/Invitation/);assert.equal(calls,0);
 await assert.rejects(hostedAccountAction(req,{action:'login',email:identity.email,password:'synthetic-password'}),/through this application/);
 assert.equal((await (await hostedAccountAction(req,{action:'signup',email:identity.email,name:'Invited',password:'synthetic-password',acceptedTerms:true,invitation:'synthetic-invite'})).json()).verificationRequired,true);
 const confirmation=await hostedAccountAction(req,{action:'confirm',type:'signup',tokenHash:'a'.repeat(64)});assert.equal((await confirmation.json()).verified,true);assert.equal(confirmation.headers.get('set-cookie'),null);
 const verified=await hostedAccountAction(req,{action:'login',email:identity.email,password:'synthetic-password'}),body=await verified.json();assert.equal(body.account.email,identity.email);assert.doesNotMatch(JSON.stringify(body),/synthetic-access|synthetic-refresh/);const cookie=verified.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
 assert.equal((await (await hostedAccountAction(req,{action:'recover',email:identity.email})).json()).recoveryRequired,true);
 await assert.rejects(hostedAccountAction(req,{action:'reset',newPassword:'new-synthetic-password'}),/recovery link/);
 const recovery=await hostedAccountAction(req,{action:'confirm',type:'recovery',tokenHash:'b'.repeat(64)});
 const recoveryRequest=new Request(req.url,{headers:{cookie:recovery.headers.get('set-cookie')}});
 await hostedAccountAction(recoveryRequest,{action:'reset',newPassword:'new-synthetic-password'});
 await assert.rejects(hostedAccountAction(recoveryRequest,{action:'reset',newPassword:'new-synthetic-password'}),/expired/);assert.equal(accountFromRequest(new Request(req.url,{headers:{cookie}})),null);
 global.fetch=async()=>{throw new Error('Provider offline');};assert.equal((await (await hostedAccountAction(req,{action:'logout'})).json()).signedOut,true);
});
test('subscription gate rejects suspended and unpaid accounts before new-entry authorization',async()=>{
 process.env.PENGUIN_REQUIRE_SUBSCRIPTION='1';process.env.STRIPE_PRICE_ID='price_configured';process.env.STRIPE_WEBHOOK_SECRET='synthetic-webhook';
 global.fetch=async url=>url.includes('/admin/users/')?Response.json(user):Response.json([{status:'past_due',price_id:'price_configured',access_until:Math.floor(Date.now()/1000)+3600}]);await assert.rejects(requireTradingPlan(session.account.id),/active subscription/);
 global.fetch=async()=>Response.json({...user,banned_until:new Date(Date.now()+86400000).toISOString()});await assert.rejects(requireTradingPlan(session.account.id),/suspended/);
 global.fetch=async url=>url.includes('/admin/users/')?Response.json(user):Response.json([{status:'active',price_id:'price_configured',access_until:Math.floor(Date.now()/1000)+3600}]);await assert.doesNotReject(requireTradingPlan(session.account.id));delete process.env.PENGUIN_REQUIRE_SUBSCRIPTION;
});
