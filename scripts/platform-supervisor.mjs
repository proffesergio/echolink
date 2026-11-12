import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {registerWorkerRoute} from './worker-route.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),logs=resolve(root,'.codex/logs');await mkdir(logs,{recursive:true});
// Only operator-owned runner settings are inherited by Ollama; tenant JSON
// cannot choose a host, parallelism or GPU backend.
const inferenceEnvironment=parseEnv(await readFile(resolve(root,'platform/.env.local'),'utf8').catch(()=>''));
const ollamaEnvironment={...process.env,...Object.fromEntries(Object.entries(inferenceEnvironment).filter(([key])=>key.startsWith('OLLAMA_')))};
const children=new Map();let shuttingDown=false,tunnelRecovering=false,lastRepair=0;
async function heartbeat(){try{await mkdir(resolve(root,'platform/.local'),{recursive:true});await writeFile(resolve(root,'platform/.local/supervisor-status.json'),JSON.stringify({at:new Date().toISOString(),pid:process.pid}));}catch{}}
await heartbeat();const heartbeatTimer=setInterval(heartbeat,30000);heartbeatTimer.unref();
function keepAlive(name,args,cwd=root){
 const child=spawn(process.execPath,args,{cwd,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});children.set(name,child);
 child.stdout.pipe(createWriteStream(resolve(logs,name+'.stdout.log'),{flags:'a'}));child.stderr.pipe(createWriteStream(resolve(logs,name+'.stderr.log'),{flags:'a'}));
 child.on('error',()=>console.error(name+' could not start.'));child.on('exit',()=>{children.delete(name);if(!shuttingDown)setTimeout(()=>keepAlive(name,args,cwd),5000);});
}
// Start the prepared loopback cluster without booting Docker or WSL. This does
// not select it as primary; the worker still follows its configured DATABASE_URL.
try{await readFile(resolve(root,'platform/.env.postgres.local'));await command(['scripts/local-postgres.mjs','start']);}catch{console.error('Prepared local database was not started; check its operator setup.');}
keepAlive('platform-worker',['server/index.mjs'],resolve(root,'platform'));keepAlive('bridge',['src/bridge.mjs']);
// n8n does not start Ollama. Supervise it separately when the operator has it installed.
async function ensureOllama(){
 try{if((await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)})).ok)return;}catch{}
 if(children.has('ollama'))return;
 const executable=process.env.PLATFORM_OLLAMA_EXECUTABLE||(process.platform==='win32'?resolve(process.env.LOCALAPPDATA||'','Programs/Ollama/ollama.exe'):'ollama');
 const child=spawn(executable,['serve'],{cwd:root,env:ollamaEnvironment,windowsHide:true,stdio:['ignore','pipe','pipe']});children.set('ollama',child);
 child.stdout.pipe(createWriteStream(resolve(logs,'ollama.stdout.log'),{flags:'a'}));child.stderr.pipe(createWriteStream(resolve(logs,'ollama.stderr.log'),{flags:'a'}));
 child.on('error',()=>children.delete('ollama'));child.on('exit',()=>children.delete('ollama'));
}
async function command(args){return new Promise(resolveExit=>{const c=spawn(process.execPath,args,{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});c.stdout.pipe(createWriteStream(resolve(logs,'platform-repair.stdout.log'),{flags:'a'}));c.stderr.pipe(createWriteStream(resolve(logs,'platform-repair.stderr.log'),{flags:'a'}));c.on('error',()=>resolveExit(false));c.on('exit',code=>resolveExit(code===0));});}
async function healthy(url,key){try{const r=await fetch(url,{headers:key?{'x-echolink-bridge-key':key}:{},signal:AbortSignal.timeout(10000)});const d=await r.json();return r.ok&&d.version===2;}catch{return false;}}
async function repairTunnel(){
 if(tunnelRecovering||Date.now()-lastRepair<20000)return;tunnelRecovering=true;lastRepair=Date.now();
 try{
  const environment=parseEnv(await readFile(resolve(root,'.env.local'),'utf8'));
  if(!await healthy('http://127.0.0.1:8790/api/health'))return;
  if(environment.WORKER_ORIGIN&&await healthy(environment.WORKER_ORIGIN+'/api/health',environment.WORKER_BRIDGE_TOKEN)){await registerWorkerRoute(environment.WORKER_ORIGIN);return;}
  const executable=process.env.PLATFORM_CLOUDFLARED_PATH||inferenceEnvironment.PLATFORM_CLOUDFLARED_PATH||(process.platform==='win32'?resolve(root,'.codex/tools/cloudflared.exe'):'cloudflared');let reported=false,buffer='';
  children.get('tunnel')?.kill();
  const tunnel=spawn(executable,['tunnel','--url','http://127.0.0.1:8788','--protocol','http2','--no-autoupdate'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});children.set('tunnel',tunnel);
  tunnel.stdout.pipe(createWriteStream(resolve(logs,'platform-tunnel.stdout.log'),{flags:'a'}));tunnel.stderr.pipe(createWriteStream(resolve(logs,'platform-tunnel.stderr.log'),{flags:'a'}));
  await new Promise((done,reject)=>{const deadline=setTimeout(()=>reject(new Error('tunnel timeout')),55000);tunnel.once('error',reject);tunnel.once('exit',()=>{children.delete('tunnel');if(!reported)reject(new Error('tunnel exited'));});tunnel.stderr.on('data',async chunk=>{buffer=(buffer+chunk).slice(-20000);const origin=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];if(!origin||reported)return;reported=true;try{
   let ready=false;for(let i=0;i<8;i++){if(await healthy(origin+'/api/health',environment.WORKER_BRIDGE_TOKEN)){ready=true;break;}await new Promise(r=>setTimeout(r,1500));}if(!ready)throw new Error('tunnel not ready');
   let text=await readFile(resolve(root,'.env.local'),'utf8');text=text.replace(/^WORKER_ORIGIN=.*\r?\n?/gm,'').trimEnd()+'\nWORKER_ORIGIN='+origin+'\n';await writeFile(resolve(root,'.env.local'),text);await writeFile(resolve(logs,'tunnel.pid'),String(tunnel.pid));await registerWorkerRoute(origin);
   if(!environment.WORKER_REGISTRY_URL){if(!await command(['scripts/configure-vercel.mjs']))throw new Error('settings');if(!await command(['scripts/deploy-dashboard.mjs']))throw new Error('deployment');}
   clearTimeout(deadline);console.log(new Date().toISOString()+' Protected tunnel reconnected; live routing updated.');done();}catch{clearTimeout(deadline);reject(new Error('repair failed'));}});});
 }catch{console.error(new Date().toISOString()+' Public worker reconnect failed; retrying shortly.');}finally{tunnelRecovering=false;}
}
setTimeout(repairTunnel,3000);ensureOllama();const modelTimer=setInterval(ensureOllama,30000);const timer=setInterval(repairTunnel,30000);
const stop=()=>{shuttingDown=true;clearInterval(timer);clearInterval(modelTimer);clearInterval(heartbeatTimer);for(const child of children.values())child.kill();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
console.log('Creator worker and bridge supervision active. Public tunnel checks run every 30 seconds.');
