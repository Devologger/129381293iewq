import {readFileSync,existsSync} from 'node:fs';import {createInterface} from 'node:readline/promises';import {hiddenPassword} from './lib/private-input.mjs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
try{
 const prompt=createInterface({input:process.stdin,output:process.stdout});const id=(await prompt.question('Discord application ID (public number): ')).trim();prompt.close();if(!/^\d{5,25}$/.test(id))throw new Error('Use the application ID from Discord Developer Portal');
 const token=await hiddenPassword('Discord bot token (hidden; used once, never saved): ');if(!token.trim())throw new Error('A token is required for command registration');
 const command=JSON.parse(readFileSync(new URL('../discord-command.json',import.meta.url),'utf8'));
 const response=await fetch('https://discord.com/api/v10/applications/'+id+'/commands',{method:'POST',headers:{Authorization:'Bot '+token,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw new Error('Discord command registration failed (HTTP '+response.status+'). Check the application ID and token privately.');
 console.log('The /penguin command was registered. Other application commands were not removed.');
 console.log('Install this application using Discord Developer Portal → Installation with the applications.commands scope. Set its Interactions Endpoint URL to the account-specific URL shown in Penguin Account.');
}catch(error){console.error(error.message);process.exitCode=1;}
