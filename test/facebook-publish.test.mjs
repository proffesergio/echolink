import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publish} from '../src/jobs.mjs';
import {HttpError} from '../src/net.mjs';
test('selected photos use photo publishing and rejected/ambiguous uploads never send a text-only replacement',async()=>{
  const before={FB_TOKENS_JSON:process.env.FB_TOKENS_JSON,META_GRAPH_VERSION:process.env.META_GRAPH_VERSION};
  process.env.FB_TOKENS_JSON=JSON.stringify({test:'test-page-token'});process.env.META_GRAPH_VERSION='v99.0';
  const page={fbSecret:'test',fbPageId:'12345'},article={caption:'Reviewed caption',image_url:'https://example.com/reviewed.jpg'},calls=[];
  try{
    const transport=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {post_id:'12345_678'};};
    assert.equal((await publish(page,article,transport)).post_id,'12345_678');
    assert.match(calls[0].url,/\/12345\/photos$/);assert.deepEqual(calls[0].body,{url:article.image_url,caption:article.caption});
    for(const failure of [new HttpError(400),new Error('Timed out')]){
      let attempts=0;await assert.rejects(publish(page,article,async()=>{attempts++;throw failure;}));assert.equal(attempts,1);
    }
    await publish(page,{...article,image_url:null},transport);assert.match(calls[1].url,/\/feed$/);
  }finally{for(const [key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
