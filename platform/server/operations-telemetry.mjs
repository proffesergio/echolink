import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {cpus,freemem,totalmem} from 'node:os';

const minute=60000,fields=['requests','errors','responseBytes','upstreamCalls','upstreamErrors','upstreamBytes','inputTokens','outputTokens','inferenceCalls','inferenceErrors','inferenceWaits','unknownTokenCalls'];
const safeNumber=n=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
const safeLabel=s=>String(s||'unknown').replace(/[^a-zA-Z0-9_.:/@-]/g,'').slice(0,160)||'unknown';
const routeParts=new Set('api health public state pulse posts pages tasks products websites feeds automations campaigns connections assets brand-assets brand-fonts owner operations inference report test databases workspaces accounts plans payments payment-methods contact billing checkout portal auth sign-in sign-up sign-out email get-session verify-email request-password-reset reset-password callback google generate creative publish schedule approve draft delete archive restore trash calendar dry-run reconcile manual insights branding instagram facebook link-comment run plan'.split(' '));
export function metricRoute(value){try{const path=new URL(value,'http://worker.invalid').pathname;if(!path.startsWith('/api/'))return null;return path.split('/').map(s=>!s||routeParts.has(s)?s:':id').join('/');}catch{return '/api/:id';}}
export function upstreamGroup(value,local=false){try{const u=new URL(value);if(local)return u.pathname.startsWith('/api/')?'local_inference':'local_service';const h=u.hostname;if(h==='graph.facebook.com')return 'meta';if(h.endsWith('openai.com'))return 'openai';if(h.endsWith('googleapis.com'))return 'google';if(h.endsWith('anthropic.com'))return 'anthropic';if(h.endsWith('huggingface.co'))return 'huggingface';return 'public_http';}catch{return 'invalid_destination';}}

export function createOperationsTelemetry({now=Date.now,retentionMinutes=1440,maxGroups=100}={}){
 const buckets=new Map(),http=new Map(),outgoing=new Map(),models=new Map();let activeRequests=0,revision=0;
 const prune=()=>{const floor=now()-retentionMinutes*minute;for(const k of buckets.keys())if(k<floor)buckets.delete(k);};
 const add=values=>{prune();const at=Math.floor(now()/minute)*minute;const b=buckets.get(at)||{at,...Object.fromEntries(fields.map(f=>[f,0]))};for(const f of fields)b[f]+=safeNumber(values[f]);buckets.set(at,b);revision++;};
 const group=(map,key)=>{if(!map.has(key)&&map.size>=maxGroups)key='other';const g=map.get(key)||{name:key,calls:0,errors:0,totalMs:0,responseBytes:0,durations:[]};map.set(key,g);return g;};
 const requestStarted=()=>{activeRequests++;};
 const requestFinished=({route,method,status,ms,bytes,aborted=false})=>{activeRequests=Math.max(0,activeRequests-1);if(!route)return;const error=aborted||status>=400;add({requests:1,errors:Number(error),responseBytes:bytes});const g=group(http,(String(method||'GET').match(/^(GET|HEAD|POST|PUT|DELETE|PATCH|OPTIONS)$/)?.[0]||'OTHER')+' '+metricRoute(route));g.calls++;g.errors+=Number(error);g.totalMs+=safeNumber(ms);g.responseBytes+=safeNumber(bytes);g.durations.push(safeNumber(ms));if(g.durations.length>128)g.durations.shift();};
 const upstream=({group:name,status,ms,bytes,error=false})=>{const failed=error||status>=400;add({upstreamCalls:1,upstreamErrors:Number(failed),upstreamBytes:bytes});const g=group(outgoing,safeLabel(name));g.calls++;g.errors+=Number(failed);g.totalMs+=safeNumber(ms);g.responseBytes+=safeNumber(bytes);g.durations.push(safeNumber(ms));if(g.durations.length>128)g.durations.shift();};
 const inference=({model,purpose,metrics,error,ms})=>{const waiting=['inference_resource_wait','inference_host_wait'].includes(error?.code),known=metrics&&Number.isFinite(metrics.inputTokens)&&Number.isFinite(metrics.outputTokens);add({inferenceCalls:waiting?0:1,inferenceWaits:Number(waiting),inferenceErrors:Number(!!error&&!waiting),unknownTokenCalls:waiting?0:Number(!known),inputTokens:known?metrics.inputTokens:0,outputTokens:known?metrics.outputTokens:0});const key=safeLabel(model)+' / '+safeLabel(purpose),g=group(models,key);g.calls+=Number(!waiting);g.waits=(g.waits||0)+Number(waiting);g.errors+=Number(!!error&&!waiting);g.inputTokens=(g.inputTokens||0)+(known?safeNumber(metrics.inputTokens):0);g.outputTokens=(g.outputTokens||0)+(known?safeNumber(metrics.outputTokens):0);g.unknownTokenCalls=(g.unknownTokenCalls||0)+(waiting?0:Number(!known));g.totalMs+=safeNumber(ms);g.lastAt=new Date(now()).toISOString();};
 const summaries=map=>[...map.values()].map(({durations=[],...g})=>({...g,averageMs:g.calls?Math.round(g.totalMs/g.calls):0,p95Ms:durations.length?Math.round([...durations].sort((a,b)=>a-b)[Math.max(0,Math.ceil(durations.length*.95)-1)]):null,totalMs:Math.round(g.totalMs)})).sort((a,b)=>b.calls-a.calls);
 return {requestStarted,requestFinished,upstream,inference,
  snapshot(){prune();const series=[...buckets.values()].sort((a,b)=>a.at-b.at).map(b=>({...b})),totals=Object.fromEntries(fields.map(f=>[f,series.reduce((n,b)=>n+b[f],0)]));return {at:new Date(now()).toISOString(),retentionHours:retentionMinutes/60,activeRequests,totals,series,http:summaries(http),upstream:summaries(outgoing),models:summaries(models),scope:'24-hour rollups survive worker restarts. Route/model tables and latency samples cover this worker process. Counts include dashboard polling; response bytes exclude protocol overhead. Unknown token usage is not estimated.'};},
  restore(data){if(data?.schema!==1||!Array.isArray(data.series))return;const min=now()-retentionMinutes*minute;for(const b of data.series.slice(-retentionMinutes-1)){if(!Number.isFinite(b.at)||b.at<min||b.at>now()||b.at%minute)continue;const clean={at:b.at};for(const f of fields)clean[f]=safeNumber(b[f]);buckets.set(b.at,clean);}revision++;},
  checkpoint:()=>({schema:1,series:[...buckets.values()]}),revision:()=>revision,
 };
}
export const operationsTelemetry=createOperationsTelemetry();
const metricsFile=new URL('../.local/operations-metrics.json',import.meta.url);let persistence;
export const operationsPersistence={enabled:false,lastSavedAt:null,error:false};
export async function startOperationsPersistence(){
 if(persistence||process.env.NODE_TEST_CONTEXT||process.env.PLATFORM_TEST_MODE==='true')return;
 try{operationsTelemetry.restore(JSON.parse(await readFile(metricsFile,'utf8')));}catch{}
 operationsPersistence.enabled=true;let writing=false,saved=-1;const flush=async()=>{if(writing||saved===operationsTelemetry.revision())return;writing=true;try{const version=operationsTelemetry.revision();await mkdir(new URL('../.local/',import.meta.url),{recursive:true});const tmp=new URL('../.local/operations-metrics.tmp',import.meta.url);await writeFile(tmp,JSON.stringify(operationsTelemetry.checkpoint()),{mode:0o600});await rename(tmp,metricsFile);saved=version;operationsPersistence.lastSavedAt=new Date().toISOString();operationsPersistence.error=false;}catch{operationsPersistence.error=true;}finally{writing=false;}};
 persistence=setInterval(flush,30000);persistence.unref();
}
export function createMachineSampler(){
 const started=Date.now(),history=[];let prior=process.cpuUsage(),at=performance.now(),sample=null;const loop=monitorEventLoopDelay({resolution:20});loop.enable();
 const take=()=>{const clock=performance.now(),cpu=process.cpuUsage(prior),elapsed=clock-at;prior=process.cpuUsage();at=clock;sample={at:new Date().toISOString(),rssMB:Math.round(process.memoryUsage().rss/1024**2),freeMB:Math.round(freemem()/1024**2),totalMB:Math.round(totalmem()/1024**2),processCpuPercent:elapsed>0?Math.round((cpu.user+cpu.system)/1000/elapsed/Math.max(1,cpus().length)*1000)/10:0,eventLoopP95Ms:Number.isFinite(loop.percentile(95))?Math.round(loop.percentile(95)/1e6*10)/10:null};loop.reset();history.push(sample);if(history.length>120)history.shift();return sample;};
 take();const timer=setInterval(take,30000);timer.unref();return {snapshot:()=>({...sample,uptimeSeconds:Math.round(process.uptime()),observedSince:new Date(started).toISOString(),threads:cpus().length,history:[...history]}),stop:()=>{clearInterval(timer);loop.disable();}};
}
