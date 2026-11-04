// Safe CI diagnostics: never print headers, credentials or full API responses.
import '../src/env.mjs';
import {readFile} from 'node:fs/promises';
let local={};try{local=JSON.parse(await readFile('deploy/vercel/.vercel/project.json','utf8'));}catch{}
const token=process.env.VERCEL_TOKEN,project=process.env.VERCEL_PROJECT_ID||local.projectId,team=process.env.VERCEL_ORG_ID||local.orgId;
if(!token||!project||!team)throw new Error('Missing Vercel token/project/team configuration');
let failed=false;
for(const [name,endpoint] of [['Project',`/v9/projects/${encodeURIComponent(project)}?teamId=${encodeURIComponent(team)}`],['Deployment settings',`/v9/projects/${encodeURIComponent(project)}/link?teamId=${encodeURIComponent(team)}`]]){
  const response=await fetch('https://api.vercel.com'+endpoint,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  const data=await response.json();console.log(`${name} authentication: HTTP ${response.status}${response.ok?'':' — '+(data.error?.code||'request rejected')}`);
  if(!response.ok)failed=true;
}
if(failed){console.error('Vercel rejected project/deployment access. Check the saved token scope and project/team IDs.');process.exitCode=1;}
