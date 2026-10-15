import test,{after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {signupAccount,loginAccount,accountFromRequest,logoutAccount,changeAccountPassword,renameAccount,withAccount,rateLimitAuth,runAllAccounts} from '../lib/server/accounts.ts';
import {accountContext,currentAccount,accountDataDirectory,vaultDirectory} from '../lib/server/account-context.ts';
import {db,credential,saveCredential,updateWorkspace,readWorkspace,dataDirectory} from '../lib/server/store.ts';
import {workspaceSession,ownerSession} from '../lib/server/session.ts';import {saveAiRouting,selectedAiProvider} from '../lib/server/free-cloud.ts';import {budgetStatus,diagnoseProvider} from '../lib/server/agent-team.ts';
const folder=mkdtempSync(join(tmpdir(),'penguin-accounts-'));process.env.TERMINAL_DATA_DIR=folder;process.env.PENGUIN_SIGNUP_CODE='synthetic-invitation';process.env.PENGUIN_ACCOUNT_MODE='1';process.env.TEAM_AI_PROVIDER='freeride';process.env.TEAM_REMOTE_KEY='synthetic-host-private-key';
const password='synthetic-customer-password';let alice,bob;
after(()=>{for(const account of [alice?.account,bob?.account,undefined])accountContext.run(account,()=>db().close());rmSync(folder,{recursive:true,force:true});});
const request=token=>new Request('https://penguin.test/api/terminal/workspace',{headers:{cookie:'penguin_session='+token}});
test('invitation registration hashes passwords, authenticates persistent sessions and rejects guesses',async()=>{
 await assert.rejects(signupAccount({name:'A',email:'a@example.test',password,invitation:'wrong'}),/Invitation/);
 alice=await signupAccount({name:'Alice',email:'alice@example.test',password,invitation:'synthetic-invitation'});bob=await signupAccount({name:'Bob',email:'bob@example.test',password,invitation:'synthetic-invitation'});
 assert.equal(accountFromRequest(request(alice.token)).email,'alice@example.test');assert.equal(accountFromRequest(request(alice.token.slice(1)+'0')),null);
 await assert.rejects(loginAccount('alice@example.test','incorrect-password'),/incorrect/);
 const login=await loginAccount('ALICE@example.test',password);assert.equal(login.account.id,alice.account.id);
 assert.equal(accountFromRequest(request(login.token)).id,alice.account.id);logoutAccount(request(login.token));assert.equal(accountFromRequest(request(login.token)),null);
});
test('customer requests cannot use anonymous/owner cookies or access host credentials and ledgers',async()=>{
 const handler=withAccount(req=>{const session=workspaceSession(req);return Response.json({id:session.id,owner:ownerSession(req),key:credential('TEAM_REMOTE_KEY')||null,path:dataDirectory()});});
 assert.equal((await handler(new Request('https://penguin.test/api/terminal/workspace'))).status,401);
 const a=await (await handler(request(alice.token))).json(),b=await (await handler(request(bob.token))).json();assert.equal(a.id,alice.account.workspaceId);assert.equal(a.owner,true);assert.equal(a.key,null);assert.notEqual(a.id,b.id);assert.notEqual(a.path,b.path);assert.equal(credential('TEAM_REMOTE_KEY'),'synthetic-host-private-key');
 await accountContext.run(alice.account,async()=>{saveCredential('TEAM_REMOTE_KEY','synthetic-alice-key');assert.equal(credential('TEAM_REMOTE_KEY'),'synthetic-alice-key');assert.equal(selectedAiProvider(),'free_cloud');saveAiRouting('groq_free');updateWorkspace(alice.account.workspaceId,ws=>({...ws,watchlist:['DOGE']}));assert.equal(budgetStatus().calls,0);await assert.rejects(diagnoseProvider(undefined,'freeride'),/shared host gateways/);assert.throws(()=>saveAiRouting('nine_router'),/shared host gateways/);assert.ok(vaultDirectory().startsWith(accountDataDirectory(alice.account.id)));});
 accountContext.run(bob.account,()=>{assert.equal(credential('TEAM_REMOTE_KEY'),undefined);assert.deepEqual(readWorkspace(bob.account.workspaceId).watchlist,['BTC','ETH','SOL','XRP']);assert.equal(selectedAiProvider(),'free_cloud');assert.throws(()=>readWorkspace(alice.account.workspaceId),/not found/);});
});
test('asynchronous account contexts remain isolated and workers visit each tenant',async()=>{
 const paths=await Promise.all([alice.account,bob.account].map(account=>accountContext.run(account,async()=>{await new Promise(r=>setTimeout(r,5));return dataDirectory();})));assert.notEqual(paths[0],paths[1]);assert.equal(currentAccount(),undefined);
 const visited=[];await runAllAccounts(async()=>{visited.push(currentAccount()?.id||'host');});assert.deepEqual(visited,['host',alice.account.id,bob.account.id]);
});
test('profile changes persist, password changes revoke all sessions and limits survive repeated attempts',async()=>{
 renameAccount(alice.account,'Alice updated');assert.equal(accountFromRequest(request(alice.token)).name,'Alice updated');
 await changeAccountPassword(alice.account,password,'new-synthetic-customer-password');assert.equal(accountFromRequest(request(alice.token)),null);await assert.rejects(loginAccount('alice@example.test',password),/incorrect/);const login=await loginAccount('alice@example.test','new-synthetic-customer-password');assert.equal(login.account.name,'Alice updated');
 for(let i=0;i<10;i++)rateLimitAuth('synthetic-client');assert.throws(()=>rateLimitAuth('synthetic-client'),/Too many/);
});
