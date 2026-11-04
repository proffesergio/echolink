import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepProgress} from '../src/telemetry.mjs';
test('progress is calculated from completed units rather than timers',()=>{
  assert.equal(stepProgress(0,6),0);assert.equal(stepProgress(2,5),40);assert.equal(stepProgress(1,3),33);assert.equal(stepProgress(20,20),100);
  for(const [done,total]of [[-1,2],[3,2],[1,0],[NaN,4]])assert.throws(()=>stepProgress(done,total));
});
