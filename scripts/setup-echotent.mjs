import {writeFile} from 'node:fs/promises';
import {EDITOR_SYSTEM} from '../platform/server/prompts.mjs';
const base='http://127.0.0.1:11434';
const available=await (await fetch(base+'/api/tags')).json();
for(const [name,from] of [['echotent:gemma2-2b','gemma2:2b'],['echotent:phi3-3.8b','phi3:3.8b'],['echotent:qwen2.5-3b','qwen2.5:3b'],['echotent:qwen2.5-1.5b','qwen2.5:1.5b'],['echotent:qwen3-4b','qwen3:4b-instruct-2507-q4_K_M'],['echotent:gemma3-4b','gemma3:4b-it-q4_K_M']]){
 if(!available.models?.some(m=>m.name===from||m.model===from)){console.log('Skipped unavailable base: '+from);continue;}
 const file='models/'+name.replace(':','-')+'.Modelfile';
 await writeFile(file,`# Echotent configuration; original base weights and license are retained.\nFROM ${from}\nSYSTEM """${EDITOR_SYSTEM}"""\nPARAMETER num_ctx 4096\nPARAMETER num_predict 1800\nPARAMETER num_thread 2\nPARAMETER num_batch 64\nPARAMETER num_gpu 0\nPARAMETER temperature 0.4\n`);
 const r=await fetch(base+'/api/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:name,from,system:EDITOR_SYSTEM,parameters:{num_ctx:4096,num_predict:1800,num_thread:2,num_batch:64,num_gpu:0,temperature:0.4},stream:false}),signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw new Error('Echotent alias creation failed; finish downloading '+from+' first.');
 console.log(JSON.stringify({model:name,base:from,status:(await r.json()).status}));
}
