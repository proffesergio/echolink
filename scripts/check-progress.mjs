import '../src/env.mjs';
import assert from 'node:assert/strict';
import {query,closePools} from '../src/db.mjs';
import {startRun,updateProgress,finishRun,recoverExpiredRuns,runJob,reportProgress} from '../src/telemetry.mjs';
if(!process.env.ECHOLINK_TEST_BRANCH)throw new Error('Disposable test branch required');
try{
  const id=await startRun('preview','test');await updateProgress(id,2,5,'Local AI generating','Waiting for model output');
  await query("INSERT INTO echolink.job_schedule(job,lease_until) VALUES('preview',now()+interval '20 minutes') ON CONFLICT(job) DO UPDATE SET lease_until=EXCLUDED.lease_until");
  let row=(await query('SELECT * FROM echolink.job_runs WHERE id=$1',[id])).rows[0];assert.equal(row.progress,40);assert.equal(row.events.at(-1).phase,'Local AI generating');
  await query("UPDATE echolink.job_runs SET heartbeat_at=now()-interval '5 minutes' WHERE id=$1",[id]);await recoverExpiredRuns(true);
  row=(await query('SELECT * FROM echolink.job_runs WHERE id=$1',[id])).rows[0];assert.equal(row.status,'Interrupted');assert.equal(row.progress,40);
  assert.equal((await query("SELECT lease_until FROM echolink.job_schedule WHERE job='preview'")).rows[0].lease_until,null,'An interrupted task must release its orphaned scheduling lease');
  await finishRun(id,{late:true});assert.equal((await query('SELECT status FROM echolink.job_runs WHERE id=$1',[id])).rows[0].status,'Interrupted','Late completion cannot resurrect an expired run');
  const failed=await startRun('publish-now','test');await updateProgress(failed,3,5,'Sending to Facebook');await finishRun(failed,{pages:[{failed:'probe'}]});
  row=(await query('SELECT * FROM echolink.job_runs WHERE id=$1',[failed])).rows[0];assert.equal(row.status,'Needs attention');assert.equal(row.progress,60,'Failure must not become 100%');
  const partial=await startRun('publish-now','test');await updateProgress(partial,4,5,'Facebook confirmed');
  await finishRun(partial,{pages:[{posted:'probe',websiteWarning:'Optional website unavailable'}]});
  row=(await query('SELECT * FROM echolink.job_runs WHERE id=$1',[partial])).rows[0];assert.equal(row.status,'Needs attention');assert.equal(row.result.pages[0].posted,'probe');
  await runJob('progress-probe',async()=>{await reportProgress(1,2,'Preparing outputs');return {ok:true};},'n8n schedule');
  row=(await query("SELECT * FROM echolink.job_runs WHERE job='progress-probe'")).rows[0];assert.equal(row.progress,100);assert.equal(row.status,'Succeeded');assert.match(row.events[0].phase,/n8n/);assert.ok(row.events.some(e=>e.percent===50));
  console.log('PASS task progress: calculated stage percentages, event history, n8n initiation, failed-run percentage preserved, stale heartbeat interrupted, late completion ignored.');
}finally{await closePools();}
