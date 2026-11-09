import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {databaseSettings} from './configure-databases.mjs';
// Only runtime credentials. Migration/admin URLs and registry writer stay on the PC.
const s=await databaseSettings();
const values={WORKER_ORIGIN:s.main.WORKER_ORIGIN,DASHBOARD_PUBLIC_ORIGIN:s.main.DASHBOARD_PUBLIC_ORIGIN,WORKER_BRIDGE_TOKEN:s.main.WORKER_BRIDGE_TOKEN,NEON_DATABASE_URL:s.values.NEON_DATABASE_URL,AIVEN_DATABASE_URL:s.values.AIVEN_DATABASE_URL,AIVEN_CA_CERT_BASE64:s.values.AIVEN_CA_CERT_BASE64,LOCAL_POSTGRES_DATABASE_URL:s.values.LOCAL_POSTGRES_DATABASE_URL,WORKER_REGISTRY_URL:s.main.WORKER_REGISTRY_URL,WORKER_REGISTRY_PROVIDER:s.main.WORKER_REGISTRY_PROVIDER,WORKER_REGISTRY_CA_CERT_BASE64:s.main.WORKER_REGISTRY_CA_CERT_BASE64};
const directory=resolve(process.env.APPDATA,'npm/node_modules/vercel'),manifest=JSON.parse(await readFile(resolve(directory,'package.json'),'utf8')),cli=resolve(directory,typeof manifest.bin==='string'?manifest.bin:manifest.bin.vercel);
try{for(const [key,value]of Object.entries(values)){
 if(!value)throw new Error('Missing private setting '+key);
 await new Promise((resolveRun,reject)=>{const child=spawn(process.execPath,[cli,'env','add',key,'--environment','production','--force','--sensitive','--yes'],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',()=>reject(new Error('Vercel CLI unavailable.')));child.on('exit',code=>code===0?resolveRun():reject(new Error('Vercel rejected '+key+' (exit '+code+'). Check CLI authentication and project access.')));child.stdin.end(value);});
 console.log('Saved sensitive production variable: '+key);
}console.log('Production secrets saved. Deployment DATABASE_URL unchanged. Vercel cannot connect directly to the PC’s loopback database.');
}catch(error){console.error(error.message);process.exitCode=1;}
