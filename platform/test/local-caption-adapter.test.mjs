import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {textCompletion} from '../server/providers.mjs';
import {captionPrompt} from '../server/prompts.mjs';
import {formatInstagramCaption} from '../server/channel-captions.mjs';
import {productFingerprint} from '../server/product-preflight.mjs';
import {createLocalInferenceGate,localInferenceGate} from '../server/inference-resources.mjs';

test('native local captions enforce non-thinking, context/CPU caps and report real token metrics',async()=>{
 let payload;const oldURL=process.env.PLATFORM_OLLAMA_URL;
 const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');
  if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'fixture:4b',size:2e9}]}));
  if(req.url==='/api/ps')return res.end(JSON.stringify({models:[{name:'fixture:4b'}]}));
  let raw='';for await(const chunk of req)raw+=chunk;payload=JSON.parse(raw);
  res.end(JSON.stringify({message:{content:'A fixture caption with verified facts.'},done_reason:'stop',eval_count:20,eval_duration:2e9,prompt_eval_count:100,total_duration:3e9}));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));process.env.PLATFORM_OLLAMA_URL='http://127.0.0.1:'+server.address().port;
 // This exercises real HTTP framing against a fixture server, not this PC's
 // changing free RAM while an unrelated production model is running.
 const metrics=[],originalRun=localInferenceGate.run;localInferenceGate.run=createLocalInferenceGate({memory:()=>8*1024**3}).run;
 try{assert.match(await textCompletion({provider:'ollama',config:{model:'fixture:4b',contextTokens:32000,maxOutputTokens:2048}},{},'Fixture facts',{onMetrics:m=>metrics.push(m)}),/verified facts/);assert.equal(payload.think,false);assert.equal(payload.options.num_ctx,4096);assert.equal(payload.options.num_thread,2);assert.equal(payload.options.num_gpu,0);assert.equal(payload.options.num_predict,1800);assert.equal(payload.keep_alive,'30s');assert.equal(metrics[0].tokensPerSecond,10);}
 finally{localInferenceGate.run=originalRun;if(oldURL===undefined)delete process.env.PLATFORM_OLLAMA_URL;else process.env.PLATFORM_OLLAMA_URL=oldURL;server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('compact prompts bound source size without inventing facts; Instagram adaptation retains qualifications',()=>{
 const page={name:'Fixture',niche:'News',language:'Bangla',creative_policy:{channelCaptions:{instagram:{style:'concise'}}}},post={type:'news',title:'Fixture source',body:'Source details. '.repeat(1000)};
 const prompt=captionPrompt(page,post,null,null,'facebook',{compact:true});assert(prompt.facts.text.length<=2000);assert(prompt.prompt.length<5000);
 const caption='এটি একটি তথ্যভিত্তিক প্রতিবেদন। আরও তথ্য এখনও নিশ্চিত হয়নি।\n\n#সংবাদ';const adapted=formatInstagramCaption(caption,page);assert.equal(adapted.replace(/\s/g,''),caption.replace(/\s/g,''));
});
test('price changes do not invalidate a price-free product creative; changed facts and photos do',()=>{
 const p={title:'Fan',description:'Verified specification',image_url:'https://example.com/fan.jpg',attributes:{battery:'3000mAh'},price:100};
 assert.equal(productFingerprint(p),productFingerprint({...p,price:200}));assert.notEqual(productFingerprint(p),productFingerprint({...p,description:'Different specification'}));assert.notEqual(productFingerprint(p),productFingerprint({...p,image_url:'https://example.com/other.jpg'}));
});
