import test from 'node:test';
import assert from 'node:assert/strict';
import {isPreparationWait,selectStatusTask,retrySeconds} from '../client/task-state.mjs';
const clock=Date.parse('2026-11-09T06:32:00Z');
const waiting={id:'prepare',status:'queued',kind:'aggregate',not_before:new Date(clock+300000).toISOString(),result:{waiting:{code:'inference_resource_wait'}}};
test('a deferred preparation stays visible during its retry delay, then stops being a wait when resumed',()=>{
 assert.equal(selectStatusTask([waiting],clock),waiting);assert.equal(retrySeconds(waiting,clock),300);
 assert.equal(retrySeconds(waiting,clock+301000),0);assert.equal(isPreparationWait({...waiting,status:'running'}),false);
 assert.equal(isPreparationWait({...waiting,status:'succeeded'}),false);
 assert.equal(isPreparationWait({...waiting,result:null,phase:'Memory reserve protected. Generation will retry after resources are available; publishing continues.'}),true);
 assert.equal(isPreparationWait({...waiting,result:null,phase:'The local model exceeded its response time budget. Preparation stays queued for retry; booked publishing continues.'}),true);
});
test('a running delivery takes priority over a deferred generator; future calendar tasks are not active work',()=>{
 const publish={id:'publish',status:'running',kind:'publish'},generate={id:'generate',status:'running',kind:'generate'};
 assert.equal(selectStatusTask([waiting,generate,publish],clock),publish);
 assert.equal(selectStatusTask([{status:'queued',kind:'publish',not_before:waiting.not_before}],clock),undefined);
 const due={status:'queued',kind:'creative',not_before:new Date(clock).toISOString()};
 assert.equal(selectStatusTask([waiting,due],clock),due);
});
