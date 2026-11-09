import test from 'node:test';
import assert from 'node:assert/strict';
import {generateContentBundle,splitContentBundle,NEWS_BUNDLE_PROMPT,COMMERCE_BUNDLE_PROMPT} from '../server/content-bundle.mjs';
import {normalizeProductCurrency} from '../server/prompts.mjs';
const sentence='ঢাকায় স্থানীয় সড়ক সংস্কারের বিষয়ে কর্তৃপক্ষ একটি নির্দেশনা দিয়েছে। কাজের বিস্তারিত তথ্য প্রতিবেদনে তুলে ধরা হয়েছে।';
const news={name:'Noble Seek',language:'Bangla',niche:'News',creative_policy:{contentFormat:'news_desk_v2'}};
const rawNews=`[Part 1: Website Article]\nশিরোনাম: সড়ক সংস্কার নিয়ে নির্দেশনা\n\n${sentence.repeat(5)}\n\n${sentence.repeat(5)}\n---\n[Part 2: Facebook Caption]\nসড়ক সংস্কারে নতুন নির্দেশনা এসেছে। আপনার এলাকার পরিস্থিতি কেমন?\n\n#ঢাকা #সড়ক #সংবাদ\n---\n[Part 3: First Comment Link Text]\nবিস্তারিত পড়তে ভিজিট করুন আমাদের ওয়েবসাইট:`;
test('three-part news output maps to website prose, caption and URL-free comment rather than leaking the whole answer',async()=>{
 let system;const result=await generateContentBundle({page:news,post:{type:'news',title:'সড়ক সংস্কার',body:sentence.repeat(15),seo:{}},connection:{}},{complete:async(_c,_s,_p,o)=>{system=o.systemPrompt;return rawNews;}});
 assert.equal(result.title,'সড়ক সংস্কার নিয়ে নির্দেশনা');assert.equal(result.article.paragraphCount,2);assert(result.article.wordCount>70);assert(!result.caption.includes('Part'));assert(!result.caption.includes('শিরোনাম'));assert(!result.commentText.includes('https'));assert.equal(result.warnings.length,0);assert(system.includes(NEWS_BUNDLE_PROMPT));
});
test('invalid structured replies get one format repair and never publish a partial bundle',async()=>{
 let calls=0;await assert.rejects(()=>generateContentBundle({page:news,post:{type:'news',title:'সড়ক',body:sentence,seo:{}},connection:{}},{complete:async()=>{calls++;return 'একটি অসম্পূর্ণ উত্তর';}}),e=>e.code==='content_format');assert.equal(calls,2);
 assert.throws(()=>splitContentBundle('[Part 1: Article]\na\n---\n[Part 3: Caption]\nb\n---\n[Part 2: Comment]\nc'),/mislabelled/);
});
test('commerce bundle preserves verified price, separate Instagram copy and image art direction, and flags invented scarcity',async()=>{
 const page={name:'Fabrything',language:'Bilingual-Mix',creative_policy:{contentFormat:'commerce_v2',commerce:{includePrice:true}}},product={title:'Cotton shirt',description:'Cotton fabric, regular fit, short sleeves.',price:500,currency:'BDT',available:true};
 const raw=`[Part 1: Image Graphic Design Text Brief]\nReal cotton shirt, soft studio light, warm background, short top-centred headline and original logo.\n---\n[Part 2: Facebook Post Caption]\n✨ আরামদায়ক Cotton shirt বেছে নিন।\n• Cotton fabric\n• Regular fit\n• Short sleeves\nমূল্য: 500 BDT\nস্টক সীমিত! অর্ডার করতে ইনবক্সে যোগাযোগ করুন।\n---\n[Part 3: Instagram Post Caption]\nনিত্যদিনের সহজ স্টাইলে Cotton shirt।\n\n#Fabrything #CottonShirt #Style #EverydayWear #Fashion`;
 const result=await generateContentBundle({page,post:{type:'product_sale'},product,connection:{}},{complete:async(_c,_s,_p,o)=>{assert(o.systemPrompt.includes(COMMERCE_BUNDLE_PROMPT));return raw;}});
 assert(result.caption.includes('500 BDT'));assert(result.instagramCaption.includes('#Fashion'));assert(result.designBrief.includes('studio'));assert(result.warnings.some(w=>w.startsWith('Urgency')));
});
test('Bangladesh catalogue prices correct the rupee label without converting or changing amounts or foreign-currency catalogues',()=>{
 for(const [input,expected]of [['₹ 1,250','৳ 1,250'],['INR 500','BDT 500'],['Rs. ৫০০','BDT ৫০০'],['500 INR','500 BDT'],['৳ ৫০০','৳ ৫০০']])assert.equal(normalizeProductCurrency(input,{currency:'BDT'}),expected);
 assert.equal(normalizeProductCurrency('₹ 500',{currency:'INR'}),'₹ 500');
});
test('CPU news saves a lead paragraph before a timeout and resumes remaining sections without repeating that completed call',async()=>{
 const args={page:news,post:{type:'news',title:'সড়ক সংস্কার',body:sentence.repeat(15),seo:{}},connection:{provider:'ollama',config:{model:'fixture'}}};let checkpoint,calls=0;
 const first='শিরোনাম: সড়ক সংস্কার নিয়ে নির্দেশনা\n\n'+sentence.repeat(3);
 await assert.rejects(()=>generateContentBundle(args,{complete:async(c)=>{assert(c.config.maxOutputTokens<=850);if(++calls===1)return first;throw new Error('bounded-timeout');},onSection:async draft=>{checkpoint=structuredClone(draft);}}),/bounded-timeout/);
 assert.equal(checkpoint.articleSegments.length,1);assert.equal(checkpoint.parts.length,0);
 const remaining=[sentence.repeat(3),'সড়ক সংস্কারে নির্দেশনা এসেছে। আপনার এলাকার পরিস্থিতি কেমন?\n#ঢাকা #সড়ক #সংবাদ','বিস্তারিত পড়তে ভিজিট করুন আমাদের ওয়েবসাইট:'];let resumed=0;
 const result=await generateContentBundle(args,{savedDraft:checkpoint,complete:async()=>remaining[resumed++],onSection:async()=>{}});
 assert.equal(resumed,2);assert.equal(result.article.paragraphCount,2);assert(result.article.text.includes(sentence));assert.equal(result.commentText,'বিস্তারিত পড়তে ভিজিট করুন আমাদের ওয়েবসাইট:');
});
