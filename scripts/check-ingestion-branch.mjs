import '../src/env.mjs';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
const branch=`dev-ingest-${Date.now()}`,file=`.codex/secrets/${branch}.env`;
function cli(args){const r=spawnSync('neon',args,{shell:process.platform==='win32',encoding:'utf8',timeout:180000});if(r.status!==0)throw new Error(`Neon ${args[0]} ${args[1]} failed`);return r.stdout;}
let created=false;
try{
  await mkdir('.codex/secrets',{recursive:true});
  cli(['branches','create','--name',branch,'--parent','production','--expires-at',new Date(Date.now()+86400000).toISOString(),'--no-secrets','--output','json']);created=true;
  cli(['env','pull','--branch',branch,'--service','postgres','--file',file]);
  const env={...process.env,...parseEnv(await readFile(file,'utf8')),ECHOLINK_INGESTION_PROBE:'true'};
  const result=spawnSync(process.execPath,['scripts/check-ingestion.mjs'],{env,encoding:'utf8',timeout:300000});
  console.log(result.stdout.trim());
  await writeFile('sources/INGESTION_VERIFICATION.txt',`${new Date().toISOString()}\n${result.stdout.trim()}\nExit: ${result.status}\n`);
  if(result.status!==0)throw new Error('Isolated ingestion probe failed; inspect sources/INGESTION_VERIFICATION.txt');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{
  await rm(file,{force:true});
  if(created){try{cli(['branches','delete',branch]);console.log('Removed disposable ingestion branch. Production credentials and rows unchanged.');}catch{console.error(`Cleanup pending for ${branch}; branch expires in 24 hours`);process.exitCode=1;}}
}
