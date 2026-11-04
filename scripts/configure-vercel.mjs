import '../src/env.mjs';
import path from 'node:path';
import {spawn} from 'node:child_process';

// Only these bridge settings leave this PC. Never upload .env.local.
const keys=['WORKER_ORIGIN','DASHBOARD_PUBLIC_ORIGIN','WORKER_BRIDGE_TOKEN'];
for(const key of keys)if(!process.env[key])throw new Error(`Missing ${key}`);
const childEnv={...process.env};
if(process.argv.includes('--use-cli-login'))delete childEnv.VERCEL_TOKEN;
for(const key of keys){
  const args=['env','add',key,'production','--sensitive','--force','--yes','--scope','omniteam1'];
  const windows=process.platform==='win32';
  const command=windows?process.execPath:'vercel';
  if(windows)args.unshift(path.join(process.env.APPDATA,'npm','node_modules','vercel','dist','index.js'));
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:'deploy/vercel',env:childEnv,stdio:['pipe','ignore','pipe'],windowsHide:true});
    // CLI output is intentionally discarded; variable values must never enter logs.
    child.stderr.resume();child.stdin.on('error',()=>{});child.stdin.end(process.env[key]);
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Vercel update failed for ${key} (exit ${code}); run vercel login`)));
  });
  console.log(`Configured encrypted production variable: ${key}`);
}
console.log('Configured three encrypted production bridge settings; no database, Facebook or model credentials uploaded.');
