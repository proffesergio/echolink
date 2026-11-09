import test from 'node:test';
import assert from 'node:assert/strict';
import {inferenceSettings,memoryAdmission,createLocalInferenceGate} from '../server/inference-resources.mjs';
const GiB=1024**3,provider={base:'http://127.0.0.1:11434'};
test('operator profiles cap tenant requests and default to CPU-safe non-thinking captions',()=>{
 const settings=inferenceSettings({contextTokens:32768,maxOutputTokens:20000},{});
 assert.equal(settings.contextTokens,4096);assert.equal(settings.maxOutputTokens,1800);assert.equal(settings.thinking,false);assert.equal(settings.gpuLayers,0);assert.equal(settings.threads,2);
 const desktop=inferenceSettings({contextTokens:8192},{PLATFORM_INFERENCE_PROFILE:'ubuntu_amd8gb'});assert.equal(desktop.contextTokens,8192);assert.equal(desktop.gpuLayers,-1);
});
test('operator time budgets can increase for slow CPU writing without relaxing tenant memory or output safeguards',()=>{
 assert.equal(inferenceSettings({},{}).timeoutSeconds,1200);
 const configured=inferenceSettings({timeoutSeconds:999999},{PLATFORM_INFERENCE_TIMEOUT_SECONDS:'1800'});assert.equal(configured.timeoutSeconds,1800);assert.equal(configured.reserveMB,1536);assert.equal(configured.threads,2);
 assert.equal(inferenceSettings({},{PLATFORM_INFERENCE_TIMEOUT_SECONDS:'99999'}).timeoutSeconds,3600);
});
test('cold admission reserves Windows headroom; loaded models are not counted twice',()=>{
 const settings=inferenceSettings({},{});
 assert.equal(memoryAdmission({freeBytes:4*GiB,modelBytes:2.5e9,settings}).ok,false);
 assert.equal(memoryAdmission({freeBytes:6*GiB,modelBytes:2.5e9,settings}).ok,true);
 assert.equal(memoryAdmission({freeBytes:2*GiB,modelBytes:2.5e9,resident:true,settings}).ok,true);
 assert.equal(memoryAdmission({freeBytes:10*GiB,modelBytes:5.2e9,settings}).ok,false);
});
test('memory deferral reports the measured shortfall without lowering Windows headroom',async()=>{
 const gate=createLocalInferenceGate({memory:()=>4100*1024**2,request:async url=>({models:url.endsWith('/api/tags')?[{name:'fixture',size:2497293506}]:[]})});
 await assert.rejects(()=>gate.check(provider,'fixture',{}),error=>{
  assert.equal(error.code,'inference_resource_wait');assert.equal(error.admission.freeMB,4100);
  assert.ok(error.admission.requiredMB>5000);assert.equal(error.admission.shortfallMB,error.admission.requiredMB-4100);
  assert.match(error.message,/GiB available;.*GiB needed.*short/);return true;
 });assert.equal(gate.status().active,0);
});
test('a loaded checkpoint under another alias does not charge its weights twice',async()=>{
 const gate=createLocalInferenceGate({memory:()=>2*GiB,request:async url=>({models:[{name:url.endsWith('/api/tags')?'fixture':'other-alias',size:2.5e9,digest:'same-checkpoint'}]})});
 assert.equal(await gate.run(provider,'fixture',{},async()=> 'caption'),'caption');assert.equal(gate.status().lastAdmission.resident,true);
 const cold=createLocalInferenceGate({memory:()=>2*GiB,request:async url=>({models:[{name:url.endsWith('/api/tags')?'fixture':'other-alias',size:2.5e9}]})});
 await assert.rejects(()=>cold.check(provider,'fixture',{}),e=>e.code==='inference_resource_wait');
});
test('capacity preflight preserves a recoverable wait when the model host is offline',async()=>{
 const gate=createLocalInferenceGate({request:async()=>{throw Object.assign(new Error('offline'),{status:502});}});
 await assert.rejects(()=>gate.check(provider,'fixture',{}),e=>e.code==='inference_host_wait');
});
test('automatic fallback uses only an installed secondary checkpoint that passes admission',async()=>{
 const gate=createLocalInferenceGate({memory:()=>2*GiB,request:async url=>({models:url.endsWith('/api/tags')?[{name:'primary',size:2.5e9},{name:'secondary',size:3.4e9}]:[{name:'secondary'}]})});
 const selected=await gate.run(provider,'primary',{automaticFallback:true,fallbackModel:'secondary'},async({settings})=>settings);
 assert.equal(selected.selectedModel,'secondary');assert.equal(selected.fallbackFrom,'primary');
 const cold=createLocalInferenceGate({memory:()=>4*GiB,request:async url=>({models:url.endsWith('/api/tags')?[{name:'primary',size:2.5e9},{name:'secondary',size:3.4e9}]:[]})});
 let called=false;await assert.rejects(()=>cold.run(provider,'primary',{automaticFallback:true,fallbackModel:'secondary'},async()=>{called=true;}),e=>e.code==='inference_resource_wait');assert.equal(called,false);assert.equal(cold.status().lastAdmission.model,'primary');
});
test('enough memory retains the primary, and a cloud fallback can never be selected by the local router',async()=>{
 const requested=[];const gate=createLocalInferenceGate({memory:()=>8*GiB,request:async(url,options)=>{if(url.endsWith('/api/show'))requested.push(options.body.model);return {models:url.endsWith('/api/tags')?[{name:'primary',size:2.5e9}]:[]};}});
 assert.equal((await gate.check(provider,'primary',{automaticFallback:true,fallbackModel:'paid:cloud'})).selectedModel,'primary');assert.deepEqual(requested,['primary']);
});
test('local inference is serialized and low memory defers without calling the model',async()=>{
 let free=8*GiB,active=0,max=0;
 const gate=createLocalInferenceGate({memory:()=>free,request:async url=>({models:url.endsWith('/api/tags')?[{name:'fixture',size:2.5e9}]:[]})});
 const invoke=()=>gate.run(provider,'fixture',{},async()=>{max=Math.max(max,++active);await new Promise(r=>setTimeout(r,20));active--;return 'caption';});
 assert.deepEqual(await Promise.all([invoke(),invoke()]),['caption','caption']);assert.equal(max,1);
 free=500*1024**2;await assert.rejects(invoke,e=>e.code==='inference_resource_wait');assert.equal(gate.status().active,0);
 free=8*GiB;assert.equal(await invoke(),'caption');
});
test('the low-memory watchdog cancels an active request with a recoverable reason',async()=>{
 let free=8*GiB;
 const gate=createLocalInferenceGate({memory:()=>free,monitorMs:5,request:async url=>({models:url.endsWith('/api/tags')?[{name:'fixture',size:2.5e9}]:[]})});
 await assert.rejects(()=>gate.run(provider,'fixture',{},({signal})=>new Promise((resolve,reject)=>{free=100*1024**2;signal.addEventListener('abort',()=>reject(signal.reason));const timer=setTimeout(resolve,1000);signal.addEventListener('abort',()=>clearTimeout(timer));})),e=>e.code==='inference_resource_wait');
 assert.equal(gate.status().active,0);
});
test('thinking-only checkpoints are rejected before spending the caption token budget',async()=>{
 let called=false;const gate=createLocalInferenceGate({memory:()=>8*GiB,request:async url=>url.endsWith('/api/show')?{thinking:{values:[true],default:true}}:{models:[{name:'qwen3:4b',size:2.5e9}]}});
 await assert.rejects(()=>gate.run(provider,'qwen3:4b',{},async()=>{called=true;}),e=>e.status===400&&/Instruct/.test(e.message));assert.equal(called,false);
});
