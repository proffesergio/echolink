import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCaption} from '../server/prompts.mjs';
test('local model chat framing is removed without losing caption or hashtags',()=>{
 const result=prepareCaption('এখানে আপনার জন্য ক্যাপশনটি দেওয়া হলো:\n\n"পণ্যটির বিস্তারিত জানতে আমাদের ইনবক্সে যোগাযোগ করুন।" #Product',{},null);
 assert.equal(result.caption,'পণ্যটির বিস্তারিত জানতে আমাদের ইনবক্সে যোগাযোগ করুন। #Product');
});
test('unsupported sanitizer claims become catalog-grounded bilingual copy',()=>{
 const result=prepareCaption('এই ছোট স্যানিটাইজারটিতে রয়েছে সতেজ সুবাস।',{language:'Bilingual-Mix'},{title:'Godrej AER Power Pocket Sea Breeze 10g',description:'Bathroom air freshener',price:'123.7000',currency:'BDT'});
 assert.doesNotMatch(result.caption,/স্যানিটাইজার/);assert.match(result.caption,/Godrej AER/);assert.match(result.caption,/BDT 123.7/);assert.match(result.caption,/Message us for product details\./);assert.equal(result.notes.length,1);
});
test('supported sanitizer terminology and existing bilingual lines are retained',()=>{
 const raw='এই স্যানিটাইজারটি সম্পর্কে জানতে ইনবক্সে প্রশ্ন করুন।\n\nMessage us for product details.';
 const result=prepareCaption(raw,{language:'Bilingual-Mix'},{title:'Hand sanitizer',description:''});assert.equal(result.caption,raw);assert.equal(result.notes.length,0);
});
