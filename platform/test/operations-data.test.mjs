import test from 'node:test';import assert from 'node:assert/strict';
import {operationBuckets,operationsQueueSummary} from '../client/operations-data.mjs';
test('monitor charts sum counts into labelled time intervals without inventing throughput',()=>{
 const now=Date.UTC(2026,10,12,10),result=operationBuckets([{at:now-60000,requests:6,inputTokens:100,outputTokens:20},{at:now-120000,requests:3,inputTokens:40},{at:now+60000,requests:900},{at:now-86400000,requests:900}],60,now);
 assert.equal(result.stepMinutes,3);assert.equal(result.buckets.reduce((n,b)=>n+b.requests,0),9);assert.equal(result.buckets.reduce((n,b)=>n+b.inputTokens,0),140);assert.equal(result.buckets.reduce((n,b)=>n+b.outputTokens,0),20);
 assert.equal(operationBuckets([],1440,now).buckets.length,24);
});
test('due work is distinct from booked/deferred and failed retained tasks',()=>{assert.deepEqual(operationsQueueSummary([{status:'queued',count:10,due:2},{status:'running',count:1},{status:'failed',count:3}]),{queued:10,due:2,running:1,failed:3});});
