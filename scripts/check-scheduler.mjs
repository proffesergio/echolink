import '../src/env.mjs';
import assert from 'node:assert/strict';
import {runScheduled,planTick} from '../src/scheduler.mjs';
import {query,closePools} from '../src/db.mjs';
if(!process.env.ECHOLINK_TEST_BRANCH)throw new Error('Run only on a temporary validation branch');
try{
  await query("DELETE FROM echolink.job_schedule WHERE job='analytics'");
  let calls=0;
  const results=await Promise.all(Array.from({length:5},()=>runScheduled('analytics',async()=>{calls++;return {tested:true};})));
  assert.equal(calls,1);assert.equal(results.filter(r=>r.skipped).length,4);
  assert.equal((await planTick()).due.analytics,false);
  assert.equal((await planTick(true)).due.analytics,true);
  await query("UPDATE echolink.job_schedule SET next_due=now() WHERE job='analytics'");
  await assert.rejects(runScheduled('analytics',async()=>{throw new Error('test failure');}));
  const row=(await query("SELECT lease_until,last_error FROM echolink.job_schedule WHERE job='analytics'")).rows[0];
  assert.equal(row.lease_until,null);assert.ok(row.last_error);
  console.log('PASS scheduler: five concurrent claims execute once; cadence skips, forced plan, failure releases lease.');
}finally{await closePools();}
