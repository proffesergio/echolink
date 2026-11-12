import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveProfileSettings} from '../server/profile-settings-merge.mjs';
import {validate} from '../server/validation.mjs';
test('workflow saves retain all dashboard instructions and other profile configuration',()=>{
 const prior={creative_policy:{captionInstructions:'আমার নির্দেশনা',imageInstructions:'My design',postTypePrompts:{original:{caption:'Personal voice',image:'Grid'}},channelCaptions:{instagram:{instructions:'My IG voice'}},editorial:{styleNotes:'My style',articleStyleNotes:'My article',referenceNotes:'My sources',designNotes:'My layout'}},profile_config:{content_workflow:'VIDEO_REELS',language_mode:'DUAL_BILINGUAL'},brand:{color:'#123456'}};
 const before=structuredClone(prior);
 const merged=preserveProfileSettings({name:'Personal',niche:'Education',kind:'creator',language:'Bilingual-Mix',profile_config:{content_workflow:'TEXT'},creative_policy:{goal:'engagement'}},prior);
 const saved=validate('page',merged);
 assert.equal(saved.creative_policy.captionInstructions,prior.creative_policy.captionInstructions);
 assert.equal(saved.creative_policy.postTypePrompts.original.caption,'Personal voice');
 assert.equal(saved.creative_policy.channelCaptions.instagram.instructions,'My IG voice');
 for(const key of ['styleNotes','articleStyleNotes','referenceNotes','designNotes'])assert.equal(saved.creative_policy.editorial[key],prior.creative_policy.editorial[key]);
 assert.equal(saved.profile_config.content_workflow,'TEXT');assert.equal(saved.profile_config.language_mode,'DUAL_BILINGUAL');assert.equal(saved.brand.color,'#123456');assert.deepEqual(prior,before);
});
test('explicit prompt edits and intentional clearing are respected',()=>{
 const prior={creative_policy:{captionInstructions:'Old',imageInstructions:'Keep',editorial:{styleNotes:'Old',referenceLinks:['https://example.com']}}};
 const next=preserveProfileSettings({creative_policy:{captionInstructions:'',editorial:{styleNotes:'New',referenceLinks:[]}}},prior);
 assert.equal(next.creative_policy.captionInstructions,'');assert.equal(next.creative_policy.imageInstructions,'Keep');assert.equal(next.creative_policy.editorial.styleNotes,'New');assert.deepEqual(next.creative_policy.editorial.referenceLinks,[]);
});
