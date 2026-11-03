import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {pipeline} from './workflows.mjs';
import '../src/env.mjs';
const db=new DatabaseSync(join(process.env.USERPROFILE,'.n8n','database.sqlite'),{readOnly:true});
const rows=db.prepare('SELECT id,name,active FROM workflow_entity').all().filter(r=>r.name.startsWith('EchoLink'));
if(rows.length!==9||rows.some(r=>r.active))throw new Error('Expected nine inactive EchoLink workflows');
db.close();console.log('PASS n8n: nine workflows installed, all inactive.');
for(const [id,name]of [['echolinkPipeline01','single complete pipeline']]){
  const r=spawnSync('n8n',['execute',`--id=${id}`,'--rawOutput'],{shell:process.platform==='win32',encoding:'utf8',timeout:180000,env:{...process.env,N8N_DIAGNOSTICS_ENABLED:'false',N8N_RUNNERS_BROKER_PORT:'5689'}});
  if(r.status!==0)throw new Error(`n8n ${name} failed`);
  const start=r.stdout.search(/\{\s*"data"\s*:/);if(start<0)throw new Error('No n8n execution data');
  const result=JSON.parse(r.stdout.slice(start));if(result.status!=='success')throw new Error(`n8n ${name} did not succeed`);
  const data=result.data.resultData.runData;
  for(const node of ['Load page & feed settings','Fetch feeds & deduplicate','Read review decisions','Quiet hours → AI → publish gate','Delayed source comments','Update dashboard & review queue','Refresh engagement analytics'])if(!data[node])throw new Error('Stage was not executed: '+node);
  console.log(`PASS n8n ${name}: ${result.status} (dry-run configuration)`);
}
// Exercise the scheduled branches without publishing a permanent schedule.
const origin=process.env.ECHOLINK_WORKER_URL||'http://127.0.0.1:8787';
const ticket=await(await fetch(origin+'/admin/api/ticket',{method:'POST',headers:{Authorization:'Bearer '+process.env.WORKER_API_KEY}})).json();
const login=await fetch(origin+'/admin/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(ticket)});
const state=await(await fetch(origin+'/admin/api/state',{headers:{Cookie:login.headers.get('set-cookie').split(';')[0]}})).json();
if(!state.dryRun||state.pages.some(p=>p.fields['Active Status'])||state.feeds.some(f=>f.fields['Active Status']))throw new Error('Scheduled acceptance requires inactive pages/feeds and dry run');
if(!process.env.N8N_API_KEY)throw new Error('Scheduled probe requires n8n API key for a temporary inactive workflow');
const apiBase=process.env.N8N_BASE_URL||'http://localhost:5678';
const apiHeaders={'X-N8N-API-KEY':process.env.N8N_API_KEY,'Content-Type':'application/json',Connection:'close'};
let probeId;
try{
  const workflow=pipeline();workflow.nodes.find(n=>n.name==='Execution context').parameters.jsCode='return [{json:{scheduled:true}}];';
  const created=await fetch(apiBase+'/api/v1/workflows',{method:'POST',headers:apiHeaders,body:JSON.stringify({name:'EchoLink acceptance — scheduled probe',nodes:workflow.nodes,connections:workflow.connections,settings:workflow.settings})});
  if(!created.ok)throw new Error('Temporary workflow creation failed (HTTP '+created.status+')');
  probeId=(await created.json()).id;
  for(let tick=0;tick<2;tick++){
    const r=spawnSync('n8n',['execute',`--id=${probeId}`,'--rawOutput'],{shell:process.platform==='win32',encoding:'utf8',timeout:180000,env:{...process.env,N8N_DIAGNOSTICS_ENABLED:'false',N8N_RUNNERS_BROKER_PORT:'5689'}});
    if(r.status!==0)throw new Error('Scheduled workflow probe failed');
    const start=r.stdout.search(/\{\s*"data"\s*:/),result=JSON.parse(r.stdout.slice(start));
    if(result.status!=='success')throw new Error('Scheduled tick failed');
    const data=result.data.resultData.runData,plan=data['Plan this tick'][0].data.main[0][0].json;
    for(const [job,name]of [['sync','Load page & feed settings'],['ingest','Fetch feeds & deduplicate'],['approvals','Read review decisions'],['process','Quiet hours → AI → publish gate'],['comments','Delayed source comments'],['mirror','Update dashboard & review queue'],['analytics','Refresh engagement analytics']]){
      if(!!data[name]!==!!plan.due[job])throw new Error('Incorrect due branch: '+job);
    }
    console.log('PASS n8n scheduled tick '+(tick+1)+': due jobs executed, non-due jobs skipped on the same canvas.');
  }
}finally{if(probeId){let removed;for(let attempt=0;attempt<2;attempt++){try{removed=await fetch(apiBase+'/api/v1/workflows/'+probeId,{method:'DELETE',headers:apiHeaders,signal:AbortSignal.timeout(15000)});break;}catch(error){if(attempt===1)throw error;}}if(!removed.ok&&removed.status!==404)throw new Error('Temporary workflow cleanup failed');console.log('PASS temporary workflow removed; original nine workflows preserved.');}}
