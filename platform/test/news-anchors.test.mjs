import test from 'node:test';
import assert from 'node:assert/strict';
import {factAnchors,factRewriteSchema} from '../server/news-anchors.mjs';
test('source anchors constrain numerals, ordinals and negation without quoting entire articles',()=>{
 const source='পঞ্চম দিনে ৮০ ওভারে ৩৬৯ রান তোলার চেষ্টা করেননি স্বাগতিকরা।',schema=factRewriteSchema([{id:'F1',text:source}]),pattern=new RegExp(schema.properties.facts.properties.F1.pattern,'u');
 assert(pattern.test(source));assert(!pattern.test(source.replace('পঞ্চম','চতুর্থ')));assert(!pattern.test(source.replace('৮০','৭০')));assert(!pattern.test(source.replace('চেষ্টা করেননি','চেষ্টা করেছেন')));assert(factAnchors(source).length<8);assert.deepEqual(schema.properties.facts.required,['F1']);
});

test('sentence constraints reject embedded JSON fragments and rewritten quotation marks',()=>{
 const pattern=new RegExp(factRewriteSchema([{id:'F1',text:'অধিনায়ক সংবাদ সম্মেলনে দলের পরিকল্পনা জানিয়েছেন।'}]).properties.facts.properties.F1.pattern,'u');
 assert(pattern.test('সংবাদ সম্মেলনে অধিনায়ক দলের পরিকল্পনা তুলে ধরেছেন।'));
 assert(!pattern.test('পরিকল্পনা জানিয়েছেন। “},{'));
 assert(!pattern.test('তিনি বলেন, “নতুন কথা।”'));
});
