import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {operationsTelemetry,operationsPersistence,createMachineSampler} from './operations-telemetry.mjs';
import {databasePoolStatus,transaction} from './db.mjs';
import {databaseTelemetry} from './database-telemetry.mjs';
import {inferenceHost} from './inference-host.mjs';
import {localInferenceGate,inferenceSettings} from './inference-resources.mjs';

let cached,pending,sampler;
async function probe(name,url,headers={}){const start=performance.now();try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(3500),redirect:'error',cache:'no-store'});let body={};try{body=await r.json();}catch{}return {name,status:r.ok&&(!name.includes('Ollama')?body.ok===true:Array.isArray(body.models))?'healthy':'unavailable',httpStatus:r.status,latencyMs:Math.round(performance.now()-start),checkedAt:new Date().toISOString(),...(name.includes('Ollama')&&r.ok?{installedModels:body.models?.length||0}:{})};}catch{return {name,status:'unavailable',latencyMs:Math.round(performance.now()-start),checkedAt:new Date().toISOString()};}}
export async function collectOperationsHealth({external=true}={}){
 const services=[],started=performance.now();let queue=[],connections=[],dbStats=null;
 try{await transaction(null,async db=>{
  await db.query("SET LOCAL statement_timeout='3000'");await db.query('SELECT 1');
  queue=(await db.query("SELECT kind,status,count(*)::int AS count,count(*) FILTER(WHERE status='queued' AND not_before<=now())::int AS due,min(created_at) AS oldest, max(heartbeat_at) AS last_heartbeat FROM creator.tasks WHERE status IN ('queued','running','failed','unknown') GROUP BY kind,status ORDER BY kind,status")).rows;
  connections=(await db.query('SELECT provider,name,status,last_test_at FROM creator.connections ORDER BY last_test_at DESC NULLS LAST LIMIT 100')).rows;
  dbStats=(await db.query('SELECT numbackends,xact_commit,xact_rollback,deadlocks,temp_bytes FROM pg_stat_database WHERE datname=current_database()')).rows[0]||null;
 },{owner:true});services.push({name:'Primary database',status:'healthy',latencyMs:Math.round(performance.now()-started),checkedAt:new Date().toISOString()});}
 catch{services.push({name:'Primary database',status:'unavailable',latencyMs:Math.round(performance.now()-started),checkedAt:new Date().toISOString()});}
 const host=inferenceHost();const jobs=[probe('Ollama inference',host.url+'/api/tags')];
 if(external&&process.env.PLATFORM_TEST_MODE!=='true'&&!process.env.NODE_TEST_CONTEXT){
  let operator={};try{operator=parseEnv(await readFile(new URL('../../.env.local',import.meta.url),'utf8'));}catch{}
  const token=operator.WORKER_BRIDGE_TOKEN||process.env.WORKER_BRIDGE_TOKEN;
  if(token){jobs.push(probe('Protected bridge','http://127.0.0.1:'+(process.env.BRIDGE_PORT||8788)+'/api/health',{'x-echolink-bridge-key':token}));if(operator.WORKER_ORIGIN)jobs.push(probe('Public tunnel',operator.WORKER_ORIGIN+'/api/health',{'x-echolink-bridge-key':token}));else services.push({name:'Public tunnel',status:'not_configured'});}else services.push({name:'Protected bridge',status:'not_configured'},{name:'Public tunnel',status:'not_configured'});
  const dashboard=operator.DASHBOARD_PUBLIC_ORIGIN||process.env.PLATFORM_ORIGIN;if(dashboard?.startsWith('https://'))jobs.push(probe('Public dashboard',dashboard+'/api/health'));else services.push({name:'Public dashboard',status:'not_configured'});
 }
 services.push(...await Promise.all(jobs));
 return {services,queue,connections,dbStats,checkedAt:new Date().toISOString()};
}
export async function operationsSnapshot({refresh=false}={}){
 if(!sampler)sampler=createMachineSampler();
 if(!cached||Date.now()-cached.at>15000||refresh){if(!pending)pending=collectOperationsHealth().then(data=>cached={at:Date.now(),data}).finally(()=>pending=null);await pending;}
 const settings=inferenceSettings(),gate=localInferenceGate.status();
 let supervisor={name:'Supervisor',status:'not_measured'};try{const heartbeat=JSON.parse(await readFile(new URL('../.local/supervisor-status.json',import.meta.url),'utf8')),age=Date.now()-new Date(heartbeat.at);supervisor={name:'Supervisor',status:age>=0&&age<90000?'healthy':'stale',checkedAt:heartbeat.at};}catch{}
 return {...cached.data,services:[{name:'Worker',status:'healthy',checkedAt:new Date().toISOString()},supervisor,...cached.data.services],metrics:{...operationsTelemetry.snapshot(),persistence:operationsPersistence},machine:sampler.snapshot(),database:{pool:databasePoolStatus(),traffic:databaseTelemetry()},inference:{profile:settings.name,remote:settings.remote,active:gate.active,concurrency:1,reserveMB:settings.reserveMB,abortMB:settings.abortMB,contextLimit:settings.contextTokens,outputLimit:settings.maxOutputTokens,threads:settings.threads,remoteMemoryMeasured:false},capacity:{workerTopology:'single_host',loadBalancingEnabled:false,automaticDatabaseFailover:false,localInferenceConcurrency:1,deliveryLane:'independent',note:'This deployment has one persistent worker host. Database task leases coordinate claims; they do not provide host redundancy or an inference load balancer. Keep one local model/request at a time on this PC.'}};
}
