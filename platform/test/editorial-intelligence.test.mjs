import {editorialWarnings,criticalEditorialWarnings} from '../server/editorial.mjs';
import {productDesignVariant} from '../server/product-design.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPublicCopy,hasOperationalCopy} from '../server/public-copy.mjs';
import {addEditorialFeedback,recordEditorialQuality,editorialContext,preserveEditorialState,referenceFingerprint} from '../server/editorial-memory.mjs';
import {clusterStories,shortlistStories,parseRankedChoice,rankStories,researchStory,createFeedCollector} from '../server/news-research.mjs';
import {analyzeReferences} from '../server/reference-analysis.mjs';
import {generateFactualCaption,captionLanguageWarnings} from '../server/caption-generation.mjs';
import {validate} from '../server/validation.mjs';
test('audience copy removes Bengali/English delivery instructions without touching real news facts',()=>{
 const text='ঢাকায় নতুন প্রকল্পের কাজ শুরু হয়েছে।\n৫ মিনিট পর ওয়েবসাইটে লিঙ্কসহ প্রথম কমেন্ট অটোমেটিক হবে।\nবিস্তারিত প্রথম কমেন্টে 👇';
 const clean=cleanPublicCopy(text);assert.equal(clean.caption,'ঢাকায় নতুন প্রকল্পের কাজ শুরু হয়েছে।\n\nবিস্তারিত প্রথম কমেন্টে 👇');assert.equal(clean.removed.length,1);
 assert(!hasOperationalCopy('এআই প্রযুক্তি নিয়ে গবেষণা চলছে।'));assert(!hasOperationalCopy('The government announced a new technology policy.'));
 assert.equal(cleanPublicCopy('Facts. #News').caption,'Facts. #News');assert(hasOperationalCopy('The source link will automatically be posted in a comment after 5 minutes.'));
});
test('Bangla product generation has one natural language, catalog specs and no second English summary',async()=>{
 const page={name:'Fabrything',language:'Bangla',niche:'commerce',creative_policy:{}},product={title:'Legion Shorts',description:'161 GSM, 93% polyester, athletic fit',attributes:{},available:true};
 const result=await generateFactualCaption({page,post:{type:'product_sale'},product,compact:true,connection:{}},{complete:async()=> 'লিজিয়ন শর্টসের কাপড় ও ফিটের তথ্য জেনে পছন্দ করুন।'});
 assert.match(result.caption,/পলিয়েস্টার/);assert.match(result.caption,/ইনবক্সে/);assert.doesNotMatch(result.caption,/Message us|for your|with the/);assert.equal(result.needsCorrection,false);
});
test('style feedback is bounded, versioned, language/type scoped and not replaceable through Page saves',()=>{
 let policy={};for(let i=0;i<25;i++)policy=addEditorialFeedback(policy,{id:'p'+i,version:2,type:'news',caption:'A clear example of a useful source-grounded news caption.',seo:{language:'English'}},{outcome:'prefer',note:'Clear pacing',version:2},'actor');
 assert.equal(policy.editorialMemory.examples.length,20);assert.equal(policy.editorialMemory.revision,25);
 assert.throws(()=>addEditorialFeedback(policy,{version:3},{outcome:'prefer',version:2},'actor'),/changed/);
 const page={language:'Bangla',creative_policy:policy};assert.equal(editorialContext(page,{type:'news'}).examples.length,0);
 page.language='English';assert.equal(editorialContext(page,{type:'product_sale'}).examples.length,0);assert(editorialContext(page,{type:'news'}).examples.length>0);
 assert.equal(preserveEditorialState({},policy).editorialMemory.revision,25);
 const input=validate('page',{name:'Page',niche:'News',kind:'news',language:'Bangla',creative_policy:{editorialMemory:{examples:[{caption:'injected'}]}}});assert.equal(input.creative_policy.editorialMemory,undefined);
});
const now=Date.now(),article=(title,url,category='world')=>({title,url,body:'An attributed report with useful factual details.',date:new Date(now-3600000).toISOString(),category});
test('news research groups related coverage, removes stale/seen stories and validates model IDs',async()=>{
 const a=article('River restoration project opens in northern city','https://first.example/story'),b=article('River restoration project opens in northern city today','https://second.example/story'),c=article('National school examination schedule announced today','https://third.example/school','education');
 const clusters=clusterStories([a,b,c,{...a,url:'https://first.example/old',date:new Date(now-2*86400000).toISOString()}],now);assert.equal(clusters.length,2);
 const options=shortlistStories(clusters,{now,recent:[]});assert.equal(options[0].sourceCount,2);
 assert.equal(shortlistStories(clusters,{now,recent:[{title:a.title}]}).length,1);
 assert.equal(parseRankedChoice('{"pick":99}',2),null);
 const selected=await rankStories(options,{page:{niche:'education'},connection:{config:{}},complete:async()=>'{"pick":2,"reason":"Useful school update"}'});assert.equal(selected.method,'model');assert.equal(selected.story.primary.title,c.title);
 const fallback=await rankStories(options,{page:{},connection:{},complete:async()=>'{"pick":500}'});assert.equal(fallback.method,'balanced_fallback');
 const evidence=await researchStory({story:options[0],method:'model',reason:'coverage'},{read:async a=>({...a,body:'Longer verified report text.'})});assert.equal(evidence.research.sources.length,2);assert.equal(evidence.research.coverageCount,2);
});
test('feed caching respects tenant/Page/feed edits and never refetches per generated draft',async()=>{
 let calls=0,clock=0;const collect=createFeedCollector({clock:()=>clock,ttl:10,read:async()=>{calls++;return [article('News headline','https://first.example/news')];}}),feeds=[{id:'f',url:'https://first.example/rss'}];
 await collect('a','p',feeds);await collect('a','p',feeds);assert.equal(calls,1);await collect('b','p',feeds);assert.equal(calls,2);await collect('a','p',[{...feeds[0],url:'https://other.example/rss'}]);assert.equal(calls,3);clock=20;await collect('a','p',feeds);assert.equal(calls,4);
});
test('reference analysis labels social access limits and uses permitted notes without copying facts',async()=>{
 const page={creative_policy:{editorial:{referenceLinks:['https://www.facebook.com/example'],referenceNotes:'Short openings, clear context and quiet colors.'}}};let reads=0;
 const result=await analyzeReferences(page,{config:{}},{read:async()=>{reads++;},complete:async()=>'{"voice":"Clear and measured","layout":"Quiet colors if described","avoid":"Copied slogans"}'});
 assert.equal(reads,0);assert.equal(result.sources[0].status,'manual_notes_required');assert.equal(result.fingerprint,referenceFingerprint(page.creative_policy));
 const changed={...page.creative_policy,editorial:{...page.creative_policy.editorial,referenceNotes:'Different notes'}};assert.notEqual(referenceFingerprint(changed),result.fingerprint);
 assert.throws(()=>validate('page',{name:'p',niche:'n',kind:'news',language:'Bangla',creative_policy:{editorial:{referenceLinks:Array(9).fill('https://example.com')}}}));
});

test('product variation is repeatable per post and can be pinned to the category signature',()=>{const post={id:'sample-post'};assert.equal(productDesignVariant(post),productDesignVariant(post));assert.equal(productDesignVariant(post,{editorial:{designVariation:'fixed'}}),'signature');assert(new Set(Array.from({length:30},(_,i)=>productDesignVariant({id:String(i)}))).size===3);});

test('automatic quality memory learns only bounded check categories, including corrected mistakes',()=>{const policy=recordEditorialQuality({},{type:'news',language:'Bangla',warnings:[],observedWarnings:['Check numbers absent from the supplied facts: 2024'],corrected:true});const group=policy.editorialQuality.groups['news:Bangla'];assert.equal(group.corrected,1);assert.equal(group.held,0);assert.equal(group.issues.quantities,1);assert(!JSON.stringify(policy).includes('2024'));const context=editorialContext({language:'Bangla',creative_policy:policy},{type:'news'});assert(context.avoidChecks[0].includes('quantity'));});

test('mixed-script corruption cannot pass Bangla publication checks even when quantities match',()=>{assert(captionLanguageWarnings('সৌদি আরবের রিॲদে ক্ষেপণাস্ত্র। হুঁশিophobic আক্রমণের খবর পাওয়া গেছে।',{language:'Bangla'}).length);assert.equal(captionLanguageWarnings('প্রযুক্তিপণ্য iPhone নিয়ে নতুন তথ্য জানা গেছে। তথ্য এখনও চূড়ান্ত নয়।',{language:'Bangla'}).length,0);});

test('estimated quantities cannot silently become exact counts',()=>{const source={text:'প্রায় এক হাজার ইউনিয়নে ভোট গ্রহণের প্রস্তুতি চলছে।'};assert(criticalEditorialWarnings(editorialWarnings('এক হাজার ইউনিয়নে ভোট গ্রহণের প্রস্তুতি চলছে।',source)).some(w=>w.startsWith('Source qualification')));assert.equal(editorialWarnings('প্রায় এক হাজার ইউনিয়নে ভোট গ্রহণের প্রস্তুতি চলছে।',source).length,0);});


test('a fresh operational epoch excludes older stories while retaining newly published reports',()=>{
 const now=Date.now(),epoch=new Date(now-3600000).toISOString();const stories=clusterStories([{title:'Earlier unrelated public report',url:'https://example.com/old',date:new Date(now-7200000).toISOString()},{title:'Fresh specific science discovery',url:'https://example.com/new',date:new Date(now-600000).toISOString()}],now);const picked=shortlistStories(stories,{now,notBefore:epoch});assert.equal(picked.length,1);assert.equal(picked[0].primary.url,'https://example.com/new');
 const page=validate('page',{name:'Fresh Page',kind:'news',niche:'News',language:'Bangla',creative_policy:{editorial:{sourceNotBefore:epoch}}});assert.equal(page.creative_policy.editorial.sourceNotBefore,epoch);
});
