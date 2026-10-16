// Run only on your trusted application server. Never put passwords in CLI arguments.
import {existsSync} from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
if(process.env.PENGUIN_AUTH_PROVIDER!=='supabase')throw new Error('Configure Supabase hosted mode first. See docs/LAUNCH-GUIDE.md.');
import {hiddenPassword} from './lib/private-input.mjs';
try{
 console.log('Secure administrator setup for info@penguin.com.cy. This creates a hosted user and binds its UUID to this server. No keys or password will be printed.');
 const password=await hiddenPassword('New private administrator password (16+ characters): '),again=await hiddenPassword('Repeat password: ');if(password!==again)throw new Error('Passwords do not match');
 const {provisionAdmin}=await import('../lib/server/admin-provision.ts');const result=await provisionAdmin(password,process.env.PENGUIN_ADMIN_EXISTING_USER_ID);
 console.log(result.created?'Administrator created. Sign in using your email and chosen password.':'Existing administrator securely bound. Its password was not changed.');
 console.log('Keep admin-identity.json in your protected runtime backup. Public signup cannot claim this administrator.');
}catch(error){console.error(error.message);process.exitCode=1;}
