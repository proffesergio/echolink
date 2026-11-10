import test from 'node:test';
import assert from 'node:assert/strict';
import {generateNewsReport,newsSocialCaption,NEWS_COMMENT_CTA} from '../server/news-desk.mjs';
const page={name:'Noble Seek',language:'Bangla',niche:'News',website_publishing:true,creative_policy:{linkComments:{enabled:true}}},sentence='ঢাকার সড়ক সংস্কারের বিষয়ে সংশ্লিষ্ট কর্তৃপক্ষ বিস্তারিত নির্দেশনা দিয়েছে।';
test('news captions contain a first-comment invitation instead of a mandatory question and omit external URLs',()=>{
 const caption=newsSocialCaption('সড়কের বিষয়ে নির্দেশনা এসেছে। #ঢাকা',page);assert(caption.includes(NEWS_COMMENT_CTA));assert.equal((caption.match(/#/g)||[]).length,3);assert(!newsSocialCaption(sentence,{...page,website_publishing:false}).includes('প্রথম কমেন্ট'));
});
test('full reports keep paragraph checkpoints, assemble long website prose and only then request the short caption',async()=>{
 const post={type:'news',title:'সড়ক সংস্কার',body:sentence.repeat(100),seo:{}},connection={provider:'ollama',config:{model:'fixture'}};let saved,calls=0;
 const complete=async(_c,_s,_p,{purpose})=>{if(++calls===2)throw new Error('timeout');return 'শিরোনাম: সড়কের নির্দেশনা\n\n'+sentence.repeat(10);};
 await assert.rejects(()=>generateNewsReport({page,post,connection},{complete,onSection:async s=>{saved=structuredClone(s);}}),/timeout/);assert.equal(saved.reportSegments.length,1);
 let paragraphs=0,captionRequested=false;const result=await generateNewsReport({page,post,connection},{savedDraft:saved,complete:async(_c,_s,_p,{purpose})=>{if(purpose==='news_caption'){captionRequested=true;assert.equal(paragraphs,4);return sentence;}paragraphs++;return sentence.repeat(10);}});
 assert(captionRequested);assert(result.article.wordCount>=320);assert.equal(result.article.policyVersion,'news_desk_v3');assert(result.caption.includes(NEWS_COMMENT_CTA));assert(result.article.text.length>result.caption.length*5);
});
test('sparse evidence is held before inference instead of inventing newspaper-length reporting',async()=>{
 const result=await generateNewsReport({page,post:{title:'সংবাদ',body:sentence,seo:{}},connection:{}},{complete:async()=>{throw new Error('must not call');}});assert(result.hold);assert.match(result.message,/source evidence/);
});
test('Bengali report evidence stays bounded for small-context local models',async()=>{
 let calls=0;
 await assert.rejects(()=>generateNewsReport({page,post:{title:'সংবাদ',body:sentence.repeat(200),seo:{}},connection:{config:{contextTokens:4096}}},{complete:async(_c,_s,prompt)=>{calls++;assert(prompt.length<2800);throw Error('budget checked');}}),/budget checked/);
 assert.equal(calls,1);
});
