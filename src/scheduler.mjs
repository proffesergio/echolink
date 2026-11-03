import {query} from './db.mjs';
import {jobNames,intervals} from './runtime.mjs';
export async function planTick(force=false){
  const rows=(await query('SELECT job,next_due,lease_until,last_success,last_error FROM echolink.job_schedule')).rows;
  const now=Date.now(),due={};
  for(const job of jobNames){const row=rows.find(r=>r.job===job);due[job]=(!row?.lease_until||new Date(row.lease_until).getTime()<=now)&&(force||!row||new Date(row.next_due).getTime()<=now);}
  return {ok:true,dryRun:process.env.DRY_RUN!=='false',due,intervals:intervals(),jobs:rows};
}
export async function runScheduled(job,fn){
  if(!jobNames.includes(job))throw new Error('Unknown scheduled job');
  await query('INSERT INTO echolink.job_schedule(job) VALUES($1) ON CONFLICT DO NOTHING',[job]);
  const acquired=await query("UPDATE echolink.job_schedule SET lease_until=now()+interval '20 minutes',last_started=now() WHERE job=$1 AND next_due<=now() AND (lease_until IS NULL OR lease_until<=now()) RETURNING job",[job]);
  if(!acquired.rowCount)return {skipped:true,reason:'not due or already running'};
  try{
    const result=await fn(),minutes=result?.busy?1:intervals()[job];
    await query("UPDATE echolink.job_schedule SET lease_until=NULL,next_due=now()+($2::double precision*interval '1 minute'),last_success=CASE WHEN $3 THEN last_success ELSE now() END,last_error=NULL,last_result=$4 WHERE job=$1",[job,minutes,!!result?.busy,JSON.stringify(result)]);
    return result;
  }catch(error){
    await query("UPDATE echolink.job_schedule SET lease_until=NULL,next_due=now()+interval '1 minute',last_error='Job failed; inspect local worker logs' WHERE job=$1",[job]);
    throw error;
  }
}
