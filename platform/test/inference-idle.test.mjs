import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createInferenceIdleManager} from '../server/inference-idle.mjs';
const provider={id:'ollama',base:'http://127.0.0.1:11434'};
test('idle release never unloads an active request and leaves publishing independent',async()=>{
 let now=0,releases=0,finish;const manager=createInferenceIdleManager({idleMs:30000,clock:()=>now,unload:async()=>{releases++;}});
 try{const pending=manager.run(provider,'fixture',()=>new Promise(r=>finish=r));now=40000;await manager.releaseIdle();assert.equal(releases,0);finish('caption');assert.equal(await pending,'caption');now=70001;await manager.releaseIdle();assert.equal(releases,1);assert.equal(manager.status().managedModels,0);}finally{manager.stop();}
});
test('a new generation waits for an in-progress unload rather than racing it',async()=>{
 let now=0,finishUnload,called=false;const manager=createInferenceIdleManager({idleMs:10,clock:()=>now,unload:()=>new Promise(r=>finishUnload=r)});
 try{await manager.run(provider,'fixture',async()=>{});now=20;const releasing=manager.releaseIdle();await Promise.resolve();const next=manager.run(provider,'fixture',async()=>{called=true;return 'new';});await Promise.resolve();assert.equal(called,false);finishUnload({});await releasing;assert.equal(await next,'new');assert.equal(manager.status().activeRequests,0);}finally{manager.stop();}
});
test('remote providers are unaffected and failed unloads remain recoverable',async()=>{
 let now=0,releases=0;const manager=createInferenceIdleManager({idleMs:10,clock:()=>now,unload:async()=>{if(++releases===1)throw new Error('offline');}});
 try{assert.equal(await manager.run({id:'openai'},'remote',async()=>123),123);assert.equal(manager.status().managedModels,0);await manager.run(provider,'fixture',async()=>{});now=20;await manager.releaseIdle();assert.equal(manager.status().managedModels,1);now=40;await manager.releaseIdle();assert.equal(manager.status().managedModels,0);assert.equal(releases,2);}finally{manager.stop();}
});

test('Ollama cloud aliases never enter local model unloading or send an extra generation request',async()=>{
 let now=0,releases=0;const manager=createInferenceIdleManager({idleMs:10,clock:()=>now,unload:async()=>{releases++;}});
 try{for(const model of ['deepseek-v4.1-flash:cloud','deepseek-v4.1-flash:1017-cloud'])assert.equal(await manager.run(provider,model,async()=>123),123);now=40;await manager.releaseIdle();assert.equal(releases,0);assert.equal(manager.status().managedModels,0);}finally{manager.stop();}
});

test('idle release uses Ollama native JSON unload over the configured local transport',async()=>{
 let now=0,request;
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;request={method:req.method,path:req.url,type:req.headers['content-type'],body:JSON.parse(body)};res.writeHead(200,{'content-type':'application/json'});res.end('{"done":true}');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const manager=createInferenceIdleManager({idleMs:10,clock:()=>now});
 try{await manager.run({id:'ollama',base:'http://127.0.0.1:'+server.address().port},'fixture-model',async()=>{});now=20;await manager.releaseIdle();assert.deepEqual(request,{method:'POST',path:'/api/generate',type:'application/json',body:{model:'fixture-model',keep_alive:0}});assert.equal(manager.status().managedModels,0);}
 finally{manager.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
