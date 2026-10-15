import nextEnv from '@next/env';
import {execFileSync, spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
nextEnv.loadEnvConfig(process.cwd());
const {credential, dataDirectory} = await import('../lib/server/store.ts');
const {freerideToken} = await import('../lib/server/freeride.ts');
const directory = join(dataDirectory(), 'freeride-venv');
const python = join(directory, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const mode = process.argv[2];
if (mode === 'install') {
  const bootstrap = process.env.TERMINAL_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  if (!existsSync(python)) execFileSync(bootstrap, ['-m', 'venv', directory], {stdio:'inherit'});
  // Reviewed upstream revision, not a moving branch or a curl installer.
  execFileSync(python, ['-m','pip','install','freeride-gateway @ git+https://github.com/Shaivpidadi/FreeRideV3.git@3811c8e29ef41d96eea2fe37d0219c1790e530b1'], {stdio:'inherit'});
  console.log('FreeRide installed. Run npm run freeride:start in a separate terminal.');
} else if (mode === 'start') {
  if (!existsSync(python)) throw new Error('Run npm run freeride:install first.');
  const openrouter = credential('TEAM_REMOTE_KEY'), groq = credential('GROQ_API_KEY');
  if (!openrouter && !(groq && process.env.FREERIDE_GROQ_FREE_CONFIRMED === '1')) throw new Error('Add an OpenRouter key in Connections, or a Groq free-tier key and confirmation.');
  console.log(`OpenRouter key: ${openrouter ? 'present' : 'missing'}. Groq key: ${groq ? 'present' : 'missing'}. Groq free-plan confirmation: ${process.env.FREERIDE_GROQ_FREE_CONFIRMED === '1' ? 'on' : 'off'}.`);
  if (groq && process.env.FREERIDE_GROQ_FREE_CONFIRMED !== '1') console.log('Groq is disabled: confirm your free plan and set FREERIDE_GROQ_FREE_CONFIRMED=1, then restart this gateway.');
  // Do not hand exchange keys, owner credentials, alternate accounts or local-model settings to FreeRide.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|TOKEN|SECRET|PASSWORD|^PENGUIN_|^TEAM_|^TRADE_|^BINANCE_|^DISCORD_|^OLLAMA|^FREERIDE|^GROQ|^OPENROUTER|^NVIDIA|^NIM_|^HF_|^HUGGING|^CEREBRAS|^CLOUDFLARE/i.test(name)));
  Object.assign(env, {PENGUIN_GATEWAY_TOKEN:freerideToken(), PENGUIN_GATEWAY_STATE:join(dataDirectory(),'freeride'), FREERIDE_EVENTS:'0', PYTHONUNBUFFERED:'1'});
  env.PENGUIN_ALLOW_REASONING=process.env.FREERIDE_ALLOW_REASONING_MODELS === '1' ? '1' : '0';
  if(process.env.FREERIDE_OPENROUTER_MODEL)env.PENGUIN_OPENROUTER_MODEL=process.env.FREERIDE_OPENROUTER_MODEL;
  console.log(`Research routing: ${env.PENGUIN_ALLOW_REASONING === '1' ? 'reasoning models explicitly allowed' : 'concise chat models; reasoning models excluded'}.`);
  if(openrouter)env.OPENROUTER_API_KEY=openrouter;
  if(groq && process.env.FREERIDE_GROQ_FREE_CONFIRMED === '1') { env.GROQ_API_KEY=groq; env.PENGUIN_GROQ_FREE_CONFIRMED='1'; }
  const child = spawn(python, [resolve('scripts/freeride_gateway.py')], {env, stdio:'inherit'});
  child.on('error', () => { console.error('FreeRide failed to start. Check installation and Python path.'); process.exitCode=1; });
  child.on('exit', code => {process.exitCode=code ?? 1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
} else throw new Error('Use freeride:install or freeride:start.');
