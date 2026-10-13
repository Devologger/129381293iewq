import nextEnv from '@next/env';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
nextEnv.loadEnvConfig(process.cwd());
const {credential,dataDirectory}=await import('../lib/server/store.ts');
const {freerideToken,FREERIDE_URL}=await import('../lib/server/freeride.ts');
const children=[];
let stopping=false;
function stop(code=0){
  if(stopping)return;stopping=true;
  for(const child of children){
    if(child.exitCode!==null)continue;
    if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});
    else child.kill('SIGTERM');
  }
  process.exitCode=code;
}
function start(args){
  const child=spawn(process.execPath,args,{stdio:'inherit'});children.push(child);
  child.on('error',()=>{console.error('Penguin service could not start.');stop(1);});
  child.on('exit',code=>{if(!stopping){console.error('A Penguin service stopped. Restart with npm run launch.');stop(code||1);}});
  return child;
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
try{
  if(!existsSync('.next/BUILD_ID'))throw new Error('Build Penguin once with npm run build, then npm run launch.');
  if(process.env.TEAM_AI_PROVIDER==='freeride'){
    const eligible=credential('TEAM_REMOTE_KEY')||(credential('GROQ_API_KEY')&&process.env.FREERIDE_GROQ_FREE_CONFIRMED==='1');
    if(eligible){
      const url=FREERIDE_URL.replace(/\/v1$/,'')+'/penguin/capabilities';
      async function ready(){try{const r=await fetch(url,{headers:{Authorization:`Bearer ${freerideToken()}`},signal:AbortSignal.timeout(700)});if(!r.ok)return false;const d=await r.json();return d.gateway==='penguin-freeride'&&d.localModels===false&&d.paidFallback===false&&d.maxUpstreamAttempts===2;}catch{return false;}}
      if(await ready())console.log('Reusing your authenticated FreeRide gateway.');
      else{
        const python=join(dataDirectory(),'freeride-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
        if(!existsSync(python))throw new Error('Install the optional router once: npm run freeride:install. Then npm run launch.');
        start([resolve('scripts/freeride.mjs'),'start']);
        let online=false;
        for(let i=0;i<40&&!stopping;i++){if(await ready()){online=true;break;}await new Promise(r=>setTimeout(r,250));}
        if(!online)throw new Error('FreeRide did not become ready. Review startup output; no inference was made.');
      }
    }else console.log('No eligible AI key yet. Starting paper/research; add keys privately in Connections and restart this launcher to enable the council.');
  }
  if(!stopping){console.log('Starting Penguin. Ctrl+C stops only services started by this launcher.');start([resolve('node_modules/next/dist/bin/next'),'start','--port',process.env.PORT||'3000']);}
}catch(error){console.error(error.message);stop(1);}
