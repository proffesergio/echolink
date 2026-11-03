import '../src/env.mjs';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
if(!process.env.VERCEL_TOKEN)throw new Error('Save a persistent VERCEL_TOKEN in local .env.local first');
const project=JSON.parse(await readFile('deploy/vercel/.vercel/project.json','utf8'));
for(const [key,value] of Object.entries({VERCEL_TOKEN:process.env.VERCEL_TOKEN,VERCEL_ORG_ID:project.orgId,VERCEL_PROJECT_ID:project.projectId})){
  await new Promise((resolve,reject)=>{
    const child=spawn('gh',['secret','set',key,'--repo','proffesergio/echolink'],{stdio:['pipe','ignore','pipe'],windowsHide:true});
    child.stderr.resume();child.stdin.on('error',()=>{});child.stdin.end(value);
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Could not save ${key}; check gh auth status and repository access`)));
  });
  console.log(`Saved GitHub Actions secret ${key}; value hidden.`);
}
