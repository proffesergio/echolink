import '../platform/server/env.mjs';
import {readFile,access} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
async function run(file,args){return new Promise((resolve,reject)=>{const c=spawn(process.execPath,[file,...args],{cwd:root,windowsHide:true,stdio:'inherit'});c.on('error',()=>reject(Error('The local service command could not start.')));c.on('exit',code=>code===0?resolve():reject(Error('The local service command failed. Check platform:status.')));});}
async function health(url,headers={}){try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(3000)});return r.ok&&(await r.json()).ok===true;}catch{return false;}}
try{
 if(process.platform!=='win32')throw Error('Use npm run platform:serve on this host; the background launcher currently supports Windows.');
 let operator={};try{operator=parseEnv(await readFile(new URL('../.env.local',import.meta.url),'utf8'));}catch{}
 let local=false;try{const u=new URL(process.env.DATABASE_URL);local=['localhost','127.0.0.1'].includes(u.hostname)&&u.port==='55432';}catch{}
 if(local){await access(new URL('../platform/.env.postgres.local',import.meta.url));await run('scripts/local-postgres.mjs',['start']);}
 const worker=await health('http://127.0.0.1:'+(process.env.PLATFORM_PORT||8790)+'/api/health'),bridge=await health('http://127.0.0.1:'+(process.env.BRIDGE_PORT||8788)+'/api/health',{'x-echolink-bridge-key':operator.WORKER_BRIDGE_TOKEN||''});
 if(worker&&bridge)console.log('Worker and bridge are already running. No service was interrupted. The supervisor checks Ollama and the public tunnel automatically.');
 else await run('scripts/restart-platform-gracefully.mjs',[]);
 console.log('Inspect health with npm run platform:status. Keep this PC awake and connected for automatic publishing.');
}catch(error){console.error(error.code==='ENOENT'?'Prepared local PostgreSQL settings are missing. Restore this PC’s operator configuration before starting.':error.message);process.exitCode=1;}
