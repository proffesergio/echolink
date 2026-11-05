import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepProgress,runOutcome} from '../src/telemetry.mjs';
test('progress is calculated from completed units rather than timers',()=>{
  assert.equal(stepProgress(0,6),0);assert.equal(stepProgress(2,5),40);assert.equal(stepProgress(1,3),33);assert.equal(stepProgress(20,20),100);
  for(const [done,total]of [[-1,2],[3,2],[1,0],[NaN,4]])assert.throws(()=>stepProgress(done,total));
});
test('blocked Page delivery cannot appear as completed; mixed delivery needs attention',()=>{
  assert.equal(runOutcome({pages:[{queued:'Facebook token expired (190/463)'}]}),'Blocked');
  assert.equal(runOutcome({pages:[{held:'id',reason:'Review required'}]}),'Blocked');
  assert.equal(runOutcome({pages:[{posted:'one'},{queued:'daily cap'}]}),'Needs attention');
  assert.equal(runOutcome({pages:[{pending:'draft',reason:'Top ranked today'}]}),'Succeeded');
  assert.equal(runOutcome({pages:[{dryRun:'draft'}]}),'Succeeded');
  assert.equal(runOutcome({pages:[{posted:'one',websiteWarning:'Unknown website outcome'}]}),'Needs attention');
  assert.equal(runOutcome({},new Error('failure')),'Failed');
});
