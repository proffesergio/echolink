import test from 'node:test';
import assert from 'node:assert/strict';
import {publishGate} from '../server/scheduling.mjs';

test('approved content cannot bypass the current profile language policy',async()=>{
 const db={query(){throw new Error('Language rejection must precede booking reads.');}};
 const page={active:true,language:'Bangla',profile_config:{language_mode:'SINGLE_LANGUAGE',primary_language:'bn',languages:['bn']}};
 const post={type:'original',caption:'This is an entirely English caption with no Bengali prose.',version:2,approved_version:2,seo:{}};
 await assert.rejects(publishGate(db,'fixture',page,post),{code:'profile_language'});
 await assert.rejects(publishGate(db,'fixture',page,post,{execution:true}),{code:'profile_language'});
});
test('bilingual profile policy checks the stored Instagram variant too',async()=>{
 const db={query(){throw new Error('Language rejection must precede booking reads.');}};
 const page={active:true,language:'Bilingual-Mix',profile_config:{language_mode:'DUAL_BILINGUAL',primary_language:'bn',languages:['bn','en']}};
 const post={type:'original',caption:'শিক্ষার জন্য নতুন প্রযুক্তি সম্পর্কে জানুন। Learn about useful technology for education.',version:1,approved_version:1,seo:{channelCaptions:{instagram:'Only English is present in this separate channel caption.'}}};
 await assert.rejects(publishGate(db,'fixture',page,post),{code:'profile_language'});
});
