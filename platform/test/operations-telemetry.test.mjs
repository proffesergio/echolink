import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationsTelemetry,metricRoute,upstreamGroup} from '../server/operations-telemetry.mjs';

test('operations metrics never retain query strings, dynamic paths, secrets or prompt text',()=>{
 const m=createOperationsTelemetry({now:()=>600000});
 const url='/api/posts/7be6da16-4198-48db-8fc0-d2bfb5eb581f?token=private-secret';
 m.requestStarted();m.requestFinished({route:url,method:'GET',status:200,ms:20,bytes:80});
 m.upstream({group:upstreamGroup('https://graph.facebook.com/v25.0/private?access_token=secret'),status:401,ms:5,bytes:12});
 const data=m.snapshot(),encoded=JSON.stringify(data);
 assert.equal(data.http[0].name,'GET /api/posts/:id');assert.equal(data.activeRequests,0);
 assert(!encoded.includes('private-secret'));assert(!encoded.includes('7be6da16'));assert(!encoded.includes('access_token'));
 assert.equal(data.upstream[0].name,'meta');assert.equal(data.totals.upstreamErrors,1);
 assert.equal(metricRoute('/api/auth/callback/google?code=private'),'/api/auth/callback/google');
 assert.equal(metricRoute('/api/secret-model-name'),'/api/:id');
});
test('native token counts include failed completions; waits and missing usage are distinguished',()=>{
 const m=createOperationsTelemetry({now:()=>600000});
 m.inference({model:'gemma3:4b',purpose:'news',metrics:{inputTokens:100,outputTokens:25},error:{code:'invalid_output'},ms:1000});
 m.inference({model:'gemma3:4b',purpose:'news',error:{code:'inference_host_wait'},ms:50});
 m.inference({model:'cloud-model',purpose:'caption',ms:100});
 const {totals}=m.snapshot();assert.equal(totals.inputTokens,100);assert.equal(totals.outputTokens,25);assert.equal(totals.inferenceCalls,2);assert.equal(totals.inferenceErrors,1);assert.equal(totals.inferenceWaits,1);assert.equal(totals.unknownTokenCalls,1);
});
test('24-hour checkpoints restore aggregate counts only and discard stale/future buckets',()=>{
 let clock=600000;const a=createOperationsTelemetry({now:()=>clock,retentionMinutes:2});a.requestStarted();a.requestFinished({route:'/api/state',method:'GET',status:503,ms:20,bytes:80});
 const b=createOperationsTelemetry({now:()=>clock,retentionMinutes:2});b.restore({...a.checkpoint(),secrets:'never copied',series:[...a.checkpoint().series,{at:clock+60000,requests:900},{at:clock-600000,requests:900}]});
 assert.equal(b.snapshot().totals.requests,1);assert.equal(b.snapshot().http.length,0);assert(!JSON.stringify(b.snapshot()).includes('never copied'));
 clock+=180000;assert.equal(b.snapshot().totals.requests,0);
});
test('route and model cardinality and latency sample storage remain bounded',()=>{
 const m=createOperationsTelemetry({now:()=>600000,maxGroups:2});for(let i=0;i<1000;i++){m.inference({model:'model'+i,purpose:'news',ms:1});m.upstream({group:'provider'+i,status:200,ms:i,bytes:1});}
 assert.equal(m.snapshot().models.length,3);assert.equal(m.snapshot().upstream.length,3);assert.equal(m.snapshot().totals.upstreamCalls,1000);
 assert(!JSON.stringify(m.snapshot()).includes('durations'));
});
