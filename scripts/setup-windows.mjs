// Configure only the local runtime path and missing owner password; preserve keys.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(process.platform!=='win32')throw new Error('Run this helper in Windows PowerShell, from the app folder.');
const file='.env.local';let text=readFileSync(existsSync(file)?file:'.env.example','utf8');
function set(name,value){const pattern=new RegExp('^'+name+'=.*$','m');text=pattern.test(text)?text.replace(pattern,()=>name+'='+value):text+'\n'+name+'='+value+'\n';}
let python;
const current=text.match(/^TERMINAL_PYTHON=(.*)$/m)?.[1].trim().replace(/^"|"$/g,'');
if(current && current!=='python3')try{execFileSync(current,['-c','import sys; assert sys.version_info >= (3,12)'],{stdio:'pipe',timeout:5000});python=current;}catch{}
if(!python)for(const version of ['-3.14','-3.13','-3.12','-3'])try{python=execFileSync('py',[version,'-c','import sys; assert sys.version_info >= (3,12); print(sys.executable)'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:5000}).trim();break;}catch{}
if(!python)throw new Error('Python 3.12 or newer was not found by the Windows py launcher. Install a supported Python runtime first.');
set('TERMINAL_PYTHON',JSON.stringify(python.replaceAll('\\','/')));
const password=text.match(/^TERMINAL_ADMIN_PASSWORD=(.*)$/m)?.[1].trim();
if(!password || password==='""')set('TERMINAL_ADMIN_PASSWORD',randomBytes(24).toString('base64url'));
if(!/^TEAM_AI_PROVIDER=(openrouter_free|free_remote|freeride)$/m.test(text))set('TEAM_AI_PROVIDER','openrouter_free');
writeFileSync(file,text,{mode:0o600});
console.log('Local Python configured. Private settings preserved in .env.local.');
console.log('Open .env.local privately in Notepad to read your settings password. No keys were displayed or sent.');
