import '../src/env.mjs';
import {readFile} from 'node:fs/promises';

// Only these bridge settings leave this PC. Never upload .env.local.
const keys=['WORKER_ORIGIN','DASHBOARD_PUBLIC_ORIGIN','WORKER_BRIDGE_TOKEN',...(process.env.WORKER_REGISTRY_URL?['WORKER_REGISTRY_URL']:[])];
for(const key of keys)if(!process.env[key])throw new Error(`Missing ${key}`);
if(!process.env.VERCEL_TOKEN)throw new Error('Save VERCEL_TOKEN in local .env.local first');
const project=JSON.parse(await readFile('deploy/vercel/.vercel/project.json','utf8'));
const endpoint=`https://api.vercel.com/v10/projects/${encodeURIComponent(project.projectId)}/env?teamId=${encodeURIComponent(project.orgId)}&upsert=true`;
const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${process.env.VERCEL_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(keys.map(key=>({key,value:process.env[key],type:'encrypted',target:['production']}))),signal:AbortSignal.timeout(30000)});
const result=await response.json();
// Responses can contain encrypted values/metadata: never print their contents.
if(!response.ok||result.failed?.length)throw new Error(`Vercel environment update failed (HTTP ${response.status}); check project token permissions`);
for(const key of keys)console.log(`Configured encrypted production variable: ${key}`);
console.log('Configured encrypted bridge settings and optional read-only routing credentials; no tenant, Facebook or model credentials uploaded.');
