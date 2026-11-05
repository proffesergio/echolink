import '../server/env.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
if(!process.argv[2])throw new Error('Pass the legacy .env.local path to read the local n8n API configuration privately.');
const config=parseEnv(await readFile(process.argv[2],'utf8')),url=new URL(config.N8N_BASE_URL||'http://localhost:5678');
if(!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('This setup script only changes the local n8n server.');
const headers={'X-N8N-API-KEY':config.N8N_API_KEY||'','content-type':'application/json'};
async function api(path,{method='GET',body}={}){const r=await fetch(url.origin+'/api/v1/'+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('n8n API rejected '+method+' '+path.split('?')[0]+' (HTTP '+r.status+'). Existing workflows were not changed.');return r.json();}
const manifest=JSON.parse(await readFile(new URL('../workflows/creator-platform.json',import.meta.url),'utf8')),all=await api('workflows?limit=100'),existing=all.data.find(w=>w.name===manifest.name),stateFile=new URL('../.local/n8n.json',import.meta.url);let credential;
try{credential=JSON.parse(await readFile(stateFile,'utf8')).credential;}catch{}
if(existing?.active)throw new Error('The creator workflow is already active. Review it in n8n before changing its configuration.');
if(!credential){const saved=await api('credentials',{method:'POST',body:{name:'EchoLink creator worker · local',type:'httpHeaderAuth',data:{name:'X-EchoLink-Worker-Key',value:process.env.PLATFORM_WORKER_TOKEN}}});credential={id:saved.id,name:saved.name};}
for(const node of manifest.nodes.filter(n=>['platform-dispatch','platform-webhook'].includes(n.id)))node.credentials={httpHeaderAuth:credential};const payload={name:manifest.name,nodes:manifest.nodes,connections:manifest.connections,settings:manifest.settings};
const saved=await api('workflows'+(existing?'/'+existing.id:''),{method:existing?'PUT':'POST',body:payload});await mkdir(new URL('../.local/',import.meta.url),{recursive:true});await writeFile(stateFile,JSON.stringify({credential,workflowId:saved.id},null,2));console.log(JSON.stringify({workflow:saved.name,id:saved.id,active:saved.active,existingLiveWorkflowsChanged:false,canvas:url.origin+'/workflow/'+saved.id}));
