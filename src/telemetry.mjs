import {randomUUID} from 'node:crypto';
import {query} from './db.mjs';
export async function startRun(job,source='worker'){
  const id=randomUUID();
  await query('INSERT INTO echolink.job_runs(id,job,trigger_source) VALUES($1,$2,$3)',[id,job,source]);
  return id;
}
export async function finishRun(id,result,error){
  const blocked=!!result?.blocked||!!result?.reason||!!result?.busy;
  const failed=!!error||Number(result?.failedFeeds)>0||!!result?.sheets?.failed||(Array.isArray(result?.pages)&&result.pages.some(p=>p.failed||p.unknown));
  await query('UPDATE echolink.job_runs SET finished_at=now(),status=$2,result=$3,error=$4 WHERE id=$1',[id,error?'Failed':failed?'Needs attention':blocked?'Blocked':'Succeeded',JSON.stringify(result||{}),error?'Job failed; check configuration and connection status':null]);
}
export async function runJob(job,fn,source){
  const id=await startRun(job,source);
  try{const result=await fn();await finishRun(id,result);return result;}
  catch(error){await finishRun(id,null,error).catch(()=>{});throw error;}
}
