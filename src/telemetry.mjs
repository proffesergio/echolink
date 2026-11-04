import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {query} from './db.mjs';
const context=new AsyncLocalStorage(),timers=new Map();
let lastSweep=0;
export function stepProgress(completed,total){
  if(!Number.isFinite(completed)||!Number.isFinite(total)||total<=0||completed<0||completed>total)throw new Error('Invalid progress units');
  return Math.floor(completed/total*100);
}
export async function updateProgress(id,completed,total,phase,detail=''){
  const progress=stepProgress(completed,total),meta={completed,total,detail:String(detail).slice(0,500)};
  const event={at:new Date().toISOString(),percent:progress,phase:String(phase).slice(0,160),detail:meta.detail};
  await query(`UPDATE echolink.job_runs SET progress=GREATEST(progress,$2),phase=$3,progress_detail=$4,heartbeat_at=now(),
    events=(SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]') FROM
      (SELECT value,ord FROM jsonb_array_elements(events||$5::jsonb) WITH ORDINALITY AS e(value,ord) ORDER BY ord DESC LIMIT 40) recent)
    WHERE id=$1 AND status='Running'`,[id,progress,event.phase,JSON.stringify(meta),JSON.stringify([event])]);
}
export const reportProgress=(completed,total,phase,detail)=>context.getStore()?updateProgress(context.getStore(),completed,total,phase,detail):Promise.resolve();
export const withRun=(id,fn)=>context.run(id,fn);
export async function startRun(job,source='worker'){
  const id=randomUUID(),minutes=['preview','process'].includes(job)?30:job==='publish-now'?10:15;
  await query("INSERT INTO echolink.job_runs(id,job,trigger_source,deadline_at) VALUES($1,$2,$3,now()+($4::int*interval '1 minute'))",[id,job,source,minutes]);
  const timer=setInterval(()=>query("UPDATE echolink.job_runs SET heartbeat_at=now() WHERE id=$1 AND status='Running'",[id]).catch(()=>{}),15000);timer.unref();timers.set(id,timer);
  await updateProgress(id,0,1,source.startsWith('n8n')?'n8n initiated task':'Worker accepted task');
  return id;
}
export async function recoverExpiredRuns(force=false){
  if(!force&&Date.now()-lastSweep<30000)return;lastSweep=Date.now();
  const expired=await query("UPDATE echolink.job_runs SET status='Interrupted',finished_at=now(),phase='Interrupted — check results before retrying',error='Task heartbeat expired or its deadline passed. The worker may have restarted. Inspect publication state before retrying.' WHERE status='Running' AND (heartbeat_at<now()-interval '90 seconds' OR deadline_at<now()) RETURNING id,job");
  for(const {id} of expired.rows){clearInterval(timers.get(id));timers.delete(id);}
  if(expired.rowCount)await query("UPDATE echolink.job_schedule s SET lease_until=NULL,next_due=LEAST(next_due,now()),last_error='Prior task interrupted; inspect durable state' WHERE job=ANY($1::text[]) AND NOT EXISTS (SELECT 1 FROM echolink.job_runs r WHERE r.job=s.job AND r.status='Running')",[[...new Set(expired.rows.map(r=>r.job))]]);
}
export async function finishRun(id,result,error){
  clearInterval(timers.get(id));timers.delete(id);
  const blocked=!!result?.blocked||!!result?.reason||!!result?.busy;
  const failed=!!error||Number(result?.failedFeeds)>0||!!result?.sheets?.failed||(Array.isArray(result?.pages)&&result.pages.some(p=>p.failed||p.unknown||p.websiteWarning));
  const status=error?'Failed':failed?'Needs attention':blocked?'Blocked':'Succeeded';
  if(status==='Succeeded')await updateProgress(id,1,1,'Completed','Output saved; inspect the result below');
  const phase=status==='Succeeded'?'Completed':status==='Blocked'?'Stopped — rule or connection blocked this task':status==='Needs attention'?'Stopped — review task results':'Task failed';
  await query('UPDATE echolink.job_runs SET finished_at=now(),heartbeat_at=now(),status=$2,phase=$3,result=$4,error=$5 WHERE id=$1 AND status=\'Running\'',[id,status,phase,JSON.stringify(result||{}),error?'Job failed; check configuration and connection status':null]);
}
export async function runJob(job,fn,source){
  const id=await startRun(job,source);
  try{const result=await withRun(id,fn);await finishRun(id,result);return result;}
  catch(error){await finishRun(id,null,error).catch(()=>{});throw error;}
}
