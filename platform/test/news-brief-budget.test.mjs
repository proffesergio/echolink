import test from 'node:test';
import assert from 'node:assert/strict';
import {compactBriefEvidence} from '../server/news-brief-budget.mjs';
import {boundedNewsStage} from '../server/news-stage-budget.mjs';
import {researchLatestEligible,researchStory} from '../server/news-research.mjs';

const fact=(id,text,source=0)=>({id,source,text});
test('local brief scope bounds whole facts and retains late denials and both sides of a conflict',()=>{
 const facts=[fact('F1','নগরের সেবা সমন্বয়ের নতুন পরিকল্পনা প্রকাশ করা হয়েছে।'),fact('F2','কাজের দায়িত্ব সংশ্লিষ্ট বিভাগকে দেওয়া হয়েছে।'),fact('F3','এলাকার প্রয়োজন নির্ধারণ করে কাজ শুরু হবে।'),...Array.from({length:30},(_,i)=>fact('B'+i,'নথির অতিরিক্ত বিষয় '+i+' নিয়ে সংশ্লিষ্ট বিভাগ আলাদা নির্দেশনা ও বিস্তারিত তথ্য প্রকাশ করেছে।')),fact('Q1','নগরের সড়কে ৫ জন শ্রমিক কাজ করবেন বলে জানানো হয়েছে।'),fact('Q2','নগরের সড়কে ৬ জন শ্রমিক কাজ করবেন বলে জানানো হয়েছে।',1),fact('D','তবে সংশ্লিষ্ট দপ্তর অনিয়মের অভিযোগ অস্বীকার করেছে।',1)];
 const scoped=compactBriefEvidence(facts);assert(!scoped.hold);assert(scoped.evidence.length<facts.length);
 assert(scoped.evidence.reduce((n,f)=>n+f.text.length,0)<=2000);
 for(const id of ['F1','F2','F3','Q1','Q2','D'])assert(scoped.evidence.some(f=>f.id===id),id+' must remain whole');
 assert(scoped.omittedEvidenceIds.length);assert.deepEqual(scoped.conflicts.map(pair=>[...pair].sort()),[['Q1','Q2']]);
});
test('too many essential qualifications hold a source instead of silently truncating or overflowing context',()=>{
 const facts=Array.from({length:40},(_,i)=>fact('F'+i,'তবে সংশ্লিষ্ট ব্যক্তি '+i+' অভিযোগ অস্বীকার করে ঘটনার বিষয়টি এখনও নিশ্চিত নয় বলে জানিয়েছেন।'));
 const scope=compactBriefEvidence(facts);assert(scope.hold);assert.match(scope.message,/qualifications/);
});
test('bounded news timeouts are terminal for that source, while memory waits retain their recoverable identity',async()=>{
 let milliseconds;assert.equal(await boundedNewsStage(async ms=>{milliseconds=ms;return 'complete';},{deadlineMs:150000,purpose:'news_article'}),'complete');assert.equal(milliseconds,150000);
 await assert.rejects(()=>boundedNewsStage(async()=>{throw Object.assign(Error('deadline'),{status:504});},{deadlineMs:120000,purpose:'news_review'}),e=>e.status===422&&e.code==='news_stage_timeout');
 const memory=Object.assign(Error('reserve'),{status:503,code:'inference_resource_wait'});
 await assert.rejects(()=>boundedNewsStage(async()=>{throw memory;},{deadlineMs:150000,purpose:'news_article'}),e=>e===memory);
 let requested=false;await assert.rejects(()=>boundedNewsStage(async()=>{requested=true;},{deadlineMs:0,purpose:'news_article'}),{code:'news_stage_timeout'});assert.equal(requested,false);
});
test('aggregation skips unsupported teasers and already-used candidates within a bounded latest-first scan',async()=>{
 const stories=Array.from({length:5},(_,i)=>({primary:{id:i,title:'Candidate '+i,url:'https://example.com/'+i}})),checked=[],held=[];
 const selected=await researchLatestEligible(stories,{research:async selection=>{checked.push(selection.story.primary.id);return {article:selection.story.primary,research:{}};},qualify:({article})=>article.id===0?'Only a teaser':null,retain:async({article})=>held.push(article.id),accept:async({article})=>article.id===1?false:{id:'fresh-post'}});
 assert.deepEqual(checked,[0,1,2]);assert.deepEqual(held,[0]);assert.equal(selected.article.id,2);assert.equal(selected.accepted.id,'fresh-post');
 checked.length=0;assert.equal(await researchLatestEligible(stories,{research:async selection=>{checked.push(selection.story.primary.id);return {article:selection.story.primary};},qualify:()=> 'Insufficient reporting'}),null);assert.equal(checked.length,3);
});
test('complete research up to the extraction cache limit is retained instead of triggering another full read',async()=>{
 const article={title:'Cache fixture',url:'https://example.com/cache',body:'পূর্ণাঙ্গ সংবাদতথ্য। '.repeat(500)};
 const result=await researchStory({story:{primary:article,articles:[article],sourceCount:1},method:'latest'},{read:async a=>({...a,extraction:'article'})});
 assert(article.body.length>6000&&article.body.length<24000);assert.equal(result.research.sources[0].excerpt,article.body);assert(result.research.sources[0].completeBody);
});
