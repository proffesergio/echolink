import test from 'node:test';
import assert from 'node:assert/strict';
import {inferenceHost,validateInferenceHost} from '../server/inference-host.mjs';
test('isolated tests use their fixture inference URL, never the saved production host',()=>{
 const oldURL=process.env.PLATFORM_OLLAMA_URL,oldProfile=process.env.PLATFORM_INFERENCE_PROFILE;
 try{process.env.PLATFORM_OLLAMA_URL='http://127.0.0.1:12345';process.env.PLATFORM_INFERENCE_PROFILE='windows_safe';assert.equal(inferenceHost().url,'http://127.0.0.1:12345');assert.equal(inferenceHost().profile,'windows_safe');}
 finally{for(const [key,value]of [['PLATFORM_OLLAMA_URL',oldURL],['PLATFORM_INFERENCE_PROFILE',oldProfile]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('local Windows quality mode is supported without allowing a tenant-defined profile',()=>{
 assert.equal(validateInferenceHost({url:'http://127.0.0.1:11434',profile:'windows_quality'}).profile,'windows_quality');
 assert.throws(()=>validateInferenceHost({url:'http://127.0.0.1:11434',profile:'unbounded'}),/profile/);
});
