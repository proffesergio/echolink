import test from 'node:test';
import assert from 'node:assert/strict';
import {modelRoute,assertModelUse} from '../server/model-routing.mjs';
const connection={provider:'ollama',config:{model:'qwen3:4b',automaticRouting:true,simpleModel:'gemma2:2b',complexModel:'qwen3:4b',taskModels:{design_brief:'phi3:3.8b'}}};
test('task routing keeps complex Bengali writing on its configured engine and routes English design separately',()=>{
 assert.equal(modelRoute(connection,'news_article').connection.config.model,'qwen3:4b');assert.equal(modelRoute(connection,'research').connection.config.model,'gemma2:2b');assert.equal(modelRoute(connection,'design_brief').connection.config.model,'phi3:3.8b');assert.equal(modelRoute(connection,'general','x'.repeat(7000)).complexity,'complex');assert.equal(modelRoute({...connection,config:{...connection.config,automaticRouting:false}},'research').connection.config.model,'qwen3:4b');assert.equal(connection.config.model,'qwen3:4b');
});
test('the known Qwen2.5 3B research checkpoint cannot silently become a commercial publishing or fallback model',()=>{
 const previous=process.env.PLATFORM_QWEN25_3B_COMMERCIAL_LICENSED;delete process.env.PLATFORM_QWEN25_3B_COMMERCIAL_LICENSED;
 try{assert.throws(()=>assertModelUse({config:{model:'qwen2.5:3b'}}),e=>e.code==='model_licence');assert.throws(()=>assertModelUse({config:{model:'echotent:qwen2.5-3b'}}),e=>e.code==='model_licence');assert.doesNotThrow(()=>assertModelUse({config:{model:'qwen2.5:3b',researchEvaluation:true}}));assert.doesNotThrow(()=>assertModelUse({config:{model:'qwen2.5:1.5b'}}));}finally{if(previous===undefined)delete process.env.PLATFORM_QWEN25_3B_COMMERCIAL_LICENSED;else process.env.PLATFORM_QWEN25_3B_COMMERCIAL_LICENSED=previous;}
});
