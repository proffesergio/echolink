import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),logs=resolve(root,'.codex/logs');await mkdir(logs,{recursive:true});
const children=new Map();let shuttingDown=false,tunnelRecovering=false,lastRepair=0;
function keepAlive(name,args,cwd=root){
 const child=spawn(process.execPath,args,{cwd,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});children.set(name,child);
 child.stdout.pipe(createWriteStream(resolve(logs,name+'.stdout.log'),{flags:'a'}));child.stderr.pipe(createWriteStream(resolve(logs,name+'.stderr.log'),{flags:'a'}));
 child.on('error',()=>console.error(name+' could not start.'));child.on('exit',()=>{children.delete(name);if(!shuttingDown)setTimeout(()=>keepAlive(name,args,cwd),5000);});
}
keepAlive('platform-worker',['server/index.mjs'],resolve(root,'platform'));keepAlive('bridge',['src/bridge.mjs']);
async function command(args){return new Promise(resolveExit=>{const c=spawn(process.execPath,args,{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});c.stdout.pipe(createWriteStream(resolve(logs,'platform-repair.stdout.log'),{flags:'a'}));c.stderr.pipe(createWriteStream(resolve(logs,'platform-repair.stderr.log'),{flags:'a'}));c.on('error',()=>resolveExit(false));c.on('exit',code=>resolveExit(code===0));});}
async function healthy(url,key){try{const r=await fetch(url,{headers:key?{'x-echolink-bridge-key':key}:{},signal:AbortSignal.timeout(10000)});const d=await r.json();return r.ok&&d.version===2;}catch{return false;}}
async function repairTunnel(){
 if(tunnelRecovering||Date.now()-lastRepair<120000)return;tunnelRecovering=true;lastRepair=Date.now();
 try{
  const environment=parseEnv(await readFile(resolve(root,'.env.local'),'utf8'));
  if(!await healthy('http://127.0.0.1:8790/api/health'))return;
  if(environment.WORKER_ORIGIN&&await healthy(environment.WORKER_ORIGIN+'/api/health',environment.WORKER_BRIDGE_TOKEN))return;
  const executable=resolve(root,'.codex/tools/cloudflared.exe');let reported=false,buffer='';
  const tunnel=spawn(executable,['tunnel','--url','http://127.0.0.1:8788','--no-autoupdate'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});children.set('tunnel',tunnel);
  tunnel.stdout.pipe(createWriteStream(resolve(logs,'platform-tunnel.stdout.log'),{flags:'a'}));tunnel.stderr.pipe(createWriteStream(resolve(logs,'platform-tunnel.stderr.log'),{flags:'a'}));
  await new Promise((done,reject)=>{const deadline=setTimeout(()=>reject(new Error('tunnel timeout')),45000);tunnel.once('error',reject);tunnel.stderr.on('data',async chunk=>{buffer=(buffer+chunk).slice(-20000);const origin=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];if(!origin||reported)return;reported=true;clearTimeout(deadline);try{let text=await readFile(resolve(root,'.env.local'),'utf8');text=text.replace(/^WORKER_ORIGIN=.*\r?\n?/gm,'').trimEnd()+'\nWORKER_ORIGIN='+origin+'\n';await writeFile(resolve(root,'.env.local'),text);await writeFile(resolve(logs,'tunnel.pid'),String(tunnel.pid));await new Promise(r=>setTimeout(r,5000));if(!await command(['scripts/configure-vercel.mjs']))throw new Error('settings');if(!await command(['scripts/deploy-dashboard.mjs']))throw new Error('deployment');console.log('Protected tunnel and public deployment reconnected.');done();}catch{reject(new Error('repair failed'));}});});
 }catch{console.error('Public worker reconnect failed. See platform-repair logs; retrying in two minutes.');}finally{tunnelRecovering=false;}
}
setTimeout(repairTunnel,15000);const timer=setInterval(repairTunnel,30000);
const stop=()=>{shuttingDown=true;clearInterval(timer);for(const child of children.values())child.kill();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
console.log('Creator worker and bridge supervision active. Public tunnel checks run every 30 seconds.');
