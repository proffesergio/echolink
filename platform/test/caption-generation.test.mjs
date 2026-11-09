import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceNumbers,editorialWarnings} from '../server/editorial.mjs';
import {generateFactualCaption} from '../server/caption-generation.mjs';
import {sourceExcerpt} from '../server/prompts.mjs';
test('Bangla quantities normalize without accepting a different age or splitting one thousand into one',()=>{
 const source={text:'প্রথম ধাপে এক হাজার ইউনিয়নে ভোট হবে। ছয় বছর বয়সে তথ্য নিবন্ধনের পরিকল্পনা।'};
 assert.deepEqual(editorialWarnings('1,000 ইউনিয়নে ভোট হবে। নিবন্ধনের প্রস্তাবিত বয়স ৬ বছর।',source),[]);
 assert(editorialWarnings('নিবন্ধনের বয়স পাঁচ বছর।',source).some(w=>w.includes('5')));
 assert(!sourceNumbers('এক হাজার ইউনিয়ন').includes('1'));
});
test('an unsupported quantity is corrected once using the same source and remaining failures are held',async()=>{
 const options={page:{name:'News',niche:'news',language:'Bangla',creative_policy:{}},post:{type:'news',title:'তথ্য নিবন্ধনের পরিকল্পনা',body:'ছয় বছর বয়স থেকে তথ্য নিবন্ধনের পরিকল্পনা। সিদ্ধান্ত চূড়ান্ত নয়।'},connection:{},compact:true};
 let calls=0;const corrected=await generateFactualCaption(options,{complete:async()=>++calls===1?'তথ্য নিবন্ধনের প্রস্তাবিত বয়স ৫ বছর। সিদ্ধান্ত এখনও চূড়ান্ত হয়নি। #সংবাদ':'তথ্য নিবন্ধনের প্রস্তাবিত বয়স ৬ বছর। সিদ্ধান্ত এখনও চূড়ান্ত হয়নি। #সংবাদ'});assert.equal(calls,2);assert.equal(corrected.needsCorrection,false);assert(corrected.notes.some(n=>/correction/.test(n)));
 calls=0;const held=await generateFactualCaption(options,{complete:async()=>{calls++;return 'তথ্য নিবন্ধনের প্রস্তাবিত বয়স ৫ বছর। সিদ্ধান্ত এখনও চূড়ান্ত হয়নি। #সংবাদ';}});assert.equal(calls,2);assert.equal(held.needsCorrection,true);
});
test('short source excerpts retain complete sentences instead of a cut-off qualification',()=>{
 const body='তথ্য এখনও চূড়ান্ত নয়। '.repeat(100);const excerpt=sourceExcerpt(body,200);assert(excerpt.length<=200);assert(excerpt.endsWith('।'));
});
test('grounded bilingual product copy keeps real specs, one CTA and no repeated title',async()=>{
 const product={title:'Legion Shorts',description:'161 GSM, 93% polyester, athletic fit',attributes:{},available:true},page={name:'Fabrything',niche:'fashion',language:'Bilingual-Mix',creative_policy:{}};
 const result=await generateFactualCaption({page,product,post:{type:'product_sale',title:product.title,body:product.description},connection:{},compact:true},{complete:async()=> 'Legion Shorts: 93% polyester, 161 GSM, athletic fit.'});
 assert.equal(result.caption.split('Legion Shorts').length-1,1);assert(result.caption.includes('ইনবক্সে যোগাযোগ'));assert(!result.caption.includes('Message us for product details.'));assert.equal(result.needsCorrection,false);
});
