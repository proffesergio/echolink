import test from 'node:test';
import assert from 'node:assert/strict';
import {compositionSchema,parseComposition,newsroomWritingSettings} from '../server/news-composition.mjs';
const group=[{id:'F1'},{id:'F2'}],paragraph='সংবাদ সম্মেলনে সংশ্লিষ্ট কর্তৃপক্ষ পরিকল্পনার বিস্তারিত তুলে ধরেছে এবং এলাকার প্রয়োজনের বিষয়টি ব্যাখ্যা করেছে।';
test('paragraph composition permits reordered prose but requires every assigned fact ID',()=>{
 assert.equal(compositionSchema(group).properties.paragraphs.minItems,2);
 assert.equal(parseComposition(JSON.stringify({paragraphs:[paragraph,paragraph],coveredIds:['F2','F1']}),group),paragraph+'\n\n'+paragraph);
 assert.throws(()=>parseComposition(JSON.stringify({paragraphs:[paragraph,paragraph],coveredIds:['F1','F999']}),group),/every assigned/);
 assert.throws(()=>parseComposition(JSON.stringify({paragraphs:[paragraph],coveredIds:['F1','F2']}),group),/two or three/);
});
test('writing variation is independent of strict evidence review and bounded per Page',()=>{
 assert.deepEqual(newsroomWritingSettings({}),{mode:'anchored',temperature:0.7});
 assert.deepEqual(newsroomWritingSettings({creative_policy:{editorial:{articleWritingMode:'composed',articleTemperature:0.8}}}),{mode:'composed',temperature:0.8});
 assert.equal(newsroomWritingSettings({creative_policy:{editorial:{articleTemperature:99}}}).temperature,1);
});
