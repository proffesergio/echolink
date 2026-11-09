import test from 'node:test';
import assert from 'node:assert/strict';
import {generateNewsArticle,articleText,NEWS_DESK_RULES} from '../server/news-article.mjs';
import {criticalEditorialWarnings} from '../server/editorial.mjs';
import {writeNoble} from '../server/nobleseek.mjs';
const page={name:'NobleSeek',language:'Bangla',niche:'News',creative_policy:{}},sentence='স্থানীয় সড়কের বিষয়ে সংশ্লিষ্ট কর্তৃপক্ষ একটি নির্দেশনা দিয়েছে। সিদ্ধান্তের বিস্তারিত তথ্য প্রতিবেদনে তুলে ধরা হয়েছে।';
const post={id:'11111111-1111-4111-8111-111111111111',title:'স্থানীয় সড়ক নিয়ে নির্দেশনা',caption:'সংক্ষিপ্ত সামাজিক পোস্ট। #সংবাদ',body:sentence.repeat(30),source_url:'https://source.example/report',creative:{},seo:{research:{sources:[{url:'https://source.example/report',excerpt:sentence}]}}};
test('website prose uses separate bounded sections, no source links and the same evidence/factual checks',async()=>{
 const calls=[],phases=[];const article=await generateNewsArticle({page,post,connection:{},secret:{}},{complete:async(_c,_s,prompt,options)=>{calls.push({prompt,system:options.systemPrompt});return calls.length===1?sentence.repeat(9)+'\n\n'+sentence.repeat(4):'পরবর্তী তথ্য অনুযায়ী '+sentence.repeat(8);},onProgress:async(...args)=>phases.push(args)});
 assert.equal(calls.length,2);assert.equal(phases.length,2);assert(article.text.length>post.caption.length*10);assert(article.wordCount>80);assert(!article.text.includes('https://'));assert(calls[0].system.includes(NEWS_DESK_RULES));assert(calls[1].prompt.includes('Existing opening:'));assert.equal(article.needsReview,false);
});
test('short or unsupported articles are held instead of padding them or scheduling fabricated quantities',async()=>{
 const article=await generateNewsArticle({page,post:{...post,body:sentence},connection:{}},{complete:async()=> 'নির্দেশনার পর ৯৯টি সড়ক বদলে গেছে।'});
 assert.equal(article.needsReview,true);assert(criticalEditorialWarnings(article.warnings.map(w=>'Website article: '+w)).length);
 assert.equal(articleText('প্রতিবেদন [মূল লেখা](https://source.example/report)\n\nhttps://source.example/report #সংবাদ'),'প্রতিবেদন মূল লেখা');
});
test('a failed second section resumes from a private checkpoint; changed evidence invalidates it',async()=>{
 let saved,calls=0;await assert.rejects(()=>generateNewsArticle({page,post,connection:{}},{complete:async()=>{if(++calls===2)throw new Error('provider waiting');return sentence.repeat(12);},onSection:async draft=>{saved=draft;}}),/provider waiting/);
 assert.equal(saved.sections.length,1);calls=0;
 const resumed=await generateNewsArticle({page,post,connection:{}},{savedDraft:saved,complete:async()=>{calls++;return 'আরও তথ্য অনুযায়ী '+sentence.repeat(10);}});
 assert.equal(calls,1);assert(resumed.text.startsWith(saved.sections[0]));assert(resumed.wordCount>80);
 calls=0;await generateNewsArticle({page,post:{...post,title:'পরিবর্তিত সংবাদ'},connection:{}},{savedDraft:saved,complete:async()=>{calls++;return sentence.repeat(10);}});assert.equal(calls,2);
});
test('website publication sends full article text and empty public source metadata while private research is retained',async()=>{
 let inserted;const full={...post,seo:{...post.seo,article:{text:sentence.repeat(10)}}};
 await writeNoble({}, {},{url:'https://nobleseek.fabrything.com',config:{}},full,{database:async(_c,_s,fn)=>fn({query:async(sql,values)=>{if(sql.startsWith('SELECT column_name'))return {rows:[]};inserted=Object.fromEntries([...sql.matchAll(/"([a-z_]+)"/g)].map(m=>m[1]).filter(x=>!['public','nobleseek_article'].includes(x)).slice(0,values.length).map((name,i)=>[name,values[i]]));return {rowCount:1,rows:[{slug:'echolink-'+post.id,status:'PUBLISHED'}]};}},{schema:'public'})});
 assert.equal(inserted.source_url,'');assert.equal(inserted.source_name,'');assert(inserted.body_html.includes(sentence));assert(inserted.body_html.length>500);assert.equal(full.source_url,post.source_url);
});
