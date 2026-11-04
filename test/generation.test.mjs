import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../src/jobs.mjs';
import {candidateGenerationBody} from '../src/core.mjs';

test('candidate generation corrects invalid analysis once using feedback and preserves configured model parameters',async()=>{
  const fetchOriginal=globalThis.fetch,allowed=process.env.ALLOWED_AI_HOSTS,calls=[],retries=[];
  const caption='সূত্রের প্রতিবেদনে অনুষ্ঠানটির স্থান ও সময় উল্লেখ করা হয়েছে। ঘোষণার তথ্য অনুযায়ী মূল ঘটনাটি নিজের ভাষায় সংক্ষেপে তুলে ধরা হলো। '.repeat(2);
  try{
    process.env.ALLOWED_AI_HOSTS='127.0.0.1';
    globalThis.fetch=async(url,options)=>{assert.equal(String(url),'http://127.0.0.1:11434/v1/chat/completions');calls.push(JSON.parse(options.body));return Response.json({choices:[{message:{content:JSON.stringify({caption,analysis:calls.length===1?'The article needs further verification.':'সূত্রের ঘোষণায় অনুষ্ঠানের স্থান ও সময় দেওয়া হয়েছে; অন্য কোনো দাবি করা হয়নি।',image_prompt:'Symbolic books illustration'})}}]});};
    const result=await generate({endpoint:'http://127.0.0.1:11434/v1/chat/completions',infrastructure:'Ollama',model:'fixture-local',temperature:0.6,language:'Bangla'},{title:'অনুষ্ঠান',body:'সূত্রের অনুষ্ঠানের ঘোষণা।'},{bodyBuilder:candidateGenerationBody,checkAnalysisLanguage:true,onRetry:async(error,attempt)=>retries.push({message:error.message,attempt})});
    assert.equal(calls.length,2);assert.equal(result.caption,caption.trim());assert.match(result.analysis,/সূত্রের/);
    assert.deepEqual(retries,[{message:'Analysis does not use the requested Bangla language',attempt:1}]);
    assert.match(calls[1].messages[0].content,/Analysis does not use/);
    assert.equal(calls[1].model,'fixture-local');assert.equal(calls[1].temperature,0.6);assert.equal(calls[1].response_format.type,'json_object');
    assert.equal(JSON.parse(calls[1].messages[1].content).article,'সূত্রের অনুষ্ঠানের ঘোষণা।');
  }finally{globalThis.fetch=fetchOriginal;if(allowed===undefined)delete process.env.ALLOWED_AI_HOSTS;else process.env.ALLOWED_AI_HOSTS=allowed;}
});
