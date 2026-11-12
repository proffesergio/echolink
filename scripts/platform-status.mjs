import '../platform/server/env.mjs';
import {operationsSnapshot,collectOperationsHealth} from '../platform/server/operations-monitor.mjs';
import {closeDatabase} from '../platform/server/db.mjs';
const json=process.argv.includes('--json'),watch=process.argv.includes('--watch');
async function status(){
 let report,worker=true;try{const r=await fetch('http://127.0.0.1:'+(process.env.PLATFORM_PORT||8790)+'/internal/platform/operations',{headers:{'x-echolink-worker-key':process.env.PLATFORM_WORKER_TOKEN||''},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();report=await r.json();}catch{worker=false;report=await collectOperationsHealth();}
 const result={workerReachable:worker,...report};
 if(json)console.log(JSON.stringify(result,null,2));else{
  console.log('\nEchoLink operations · '+new Date().toLocaleString());console.log('Worker monitoring: '+(worker?'connected':'unavailable / worker update required'));
  for(const s of report.services)console.log(s.name.padEnd(22)+' '+s.status.padEnd(14)+(s.latencyMs==null?'':s.latencyMs+' ms'));
  if(report.machine)console.log('Worker RSS '+report.machine.rssMB+' MB · host free '+report.machine.freeMB+' MB · pool waiting '+report.database.pool.waiting);
  if(report.metrics){const t=report.metrics.totals;console.log('24h HTTP '+t.requests+' · errors '+t.errors+' · native tokens '+t.inputTokens+' in / '+t.outputTokens+' out');}
  if(report.queue){const total=status=>report.queue.filter(q=>q.status===status).reduce((n,q)=>n+q.count,0),due=report.queue.reduce((n,q)=>n+(q.due||0),0);console.log('Queue: '+total('queued')+' queued ('+due+' due now) · '+total('running')+' running · '+total('failed')+' failed retained');}
  if(report.inference)console.log('Inference concurrency '+report.inference.concurrency+' · reserve '+report.inference.reserveMB+' MiB · emergency '+report.inference.abortMB+' MiB · load balancing not configured');
  console.log('Start: npm run platform:up   |   Graceful restart: npm run platform:restart');
 }
 if(!watch)process.exitCode=worker&&report.services.every(s=>s.status==='healthy')?0:1;
}
try{await status();if(watch){let active=false;const tick=setInterval(async()=>{if(active)return;active=true;try{await status();}finally{active=false;}},30000);await new Promise(resolve=>{const stop=()=>{clearInterval(tick);resolve();};process.once('SIGINT',stop);process.once('SIGTERM',stop);});}}finally{await closeDatabase();}
