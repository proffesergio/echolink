import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightContent,crisisMatches,safetyFingerprint} from '../server/safety.mjs';
import {nichePresets,nicheDirection} from '../server/niches.mjs';
import {approvalPayload,deliverApproval} from '../server/notifications.mjs';
import {queueDelay,queueJobId} from '../server/redis-queue.mjs';
import {parseStoryboard,searchStockImage} from '../server/reels.mjs';
import {approve} from '../server/planner.mjs';
const post={id:'11111111-1111-4111-8111-111111111111',workspace_id:'22222222-2222-4222-8222-222222222222',title:'সড়ক দুর্ঘটনায় নিহত',body:'সংশ্লিষ্ট কর্তৃপক্ষের বিবৃতি।',type:'news',version:3,seo:{},creative:{}};
test('safety pre-pass checks the last fifty headlines and routes crisis evidence before inference',()=>{
 const result=preflightContent(post,[{id:'old',title:post.title}]);assert.equal(result.duplicateId,'old');assert.equal(result.highAlert,true);assert.equal(result.hold,true);
 const permitted={...post,seo:{safety:{permitGeneration:true,fingerprint:safetyFingerprint(post)}}};assert.equal(preflightContent(permitted).hold,false);assert.equal(preflightContent({...permitted,body:'Changed evidence'}).hold,true);
 const old=[...Array.from({length:50},(_,i)=>({id:String(i),title:'Unrelated '+i})),{id:'outside',title:post.title}];assert.equal(preflightContent(post,old).duplicateId,null);assert.equal(crisisMatches('Severe flooding affected the area.').length,1);
});
test('all nine niche presets provide specific factual direction without changing a Page brand',()=>{
 assert.equal(nichePresets.length,9);for(const p of nichePresets)assert(nicheDirection({creative_policy:{nichePreset:p.id}}).includes(p.rules));assert.equal(nicheDirection({creative_policy:{}}),'');
});
test('approval links require authenticated dashboard access and Telegram offers a review URL rather than approving by GET',async()=>{
 const payload=approvalPayload({name:'Desk',niche:'News'},post);assert.equal(new URL(payload.reviewUrl).searchParams.get('review'),post.id);assert.equal(new URL(payload.reviewUrl).searchParams.get('version'),'3');let sent;
 await deliverApproval({provider:'telegram',config:{chatId:'123'}},{token:'123:fixture'},payload,{request:async(url,options)=>{sent={url,...options};return {ok:true,result:{message_id:1}};}});assert.equal(sent.body.reply_markup.inline_keyboard[0][0].url,payload.reviewUrl);assert(!sent.body.reply_markup.inline_keyboard[0][0].callback_data);
});
test('Discord notifications suppress mentions; notification webhooks cannot target private hosts',async()=>{
 const payload=approvalPayload({name:'Desk',niche:'News'},post);let body;await deliverApproval({provider:'discord',config:{}},{webhookURL:'https://discord.com/api/webhooks/fixture/token'},payload,{request:async(_u,o)=>{body=o.body;return {id:'1'};}});assert.deepEqual(body.allowed_mentions,{parse:[]});
 await assert.rejects(()=>deliverApproval({provider:'approval_webhook',config:{}},{webhookURL:'http://127.0.0.1:9999'},payload),/HTTPS|public/);
});
test('high-alert content cannot be silently automatically approved even on an automatic Page',async()=>{
 await assert.rejects(()=>approve({},'w',null,{...post,caption:'A real caption.',seo:{safety:{requiresHuman:true}}},{automatic:true}),/human review/);
});
test('Redis jobs carry stable task IDs and enforce a minimum delay, rather than promising exact execution',()=>{
 const now=Date.now(),task={id:'abc',not_before:new Date(now+300000).toISOString()};assert.equal(queueDelay(task,now),300000);assert.equal(queueDelay(task,now+400000),0);assert.equal(queueJobId(task),queueJobId({...task}));assert(!queueJobId(task).includes(':'));assert.notEqual(queueJobId(task),queueJobId({...task,not_before:new Date(now+600000).toISOString()}));
});
test('storyboards require 30–60 seconds, Bengali narration, English asset queries and a constrained JSON shape',()=>{
 const scenes=Array.from({length:4},()=>({duration_seconds:8,voiceover_text_bengali:'আজকের কাজে মনোযোগ দিন।',visual_asset_search_query:'morning light workspace',text_overlay_style:'minimal high-contrast caption',text_overlay:'মনোযোগ দিন'}));assert.equal(parseStoryboard(JSON.stringify(scenes)).length,4);
 assert.throws(()=>parseStoryboard(JSON.stringify(scenes.slice(0,3))),/30–60/);assert.throws(()=>parseStoryboard(JSON.stringify(scenes.map(s=>({...s,voiceover_text_bengali:'English only'})))),/Bengali/);assert.throws(()=>parseStoryboard('[invalid]'),/invalid storyboard/);
});
test('stock media preserves provider attribution and obtains keys from encrypted connection secrets',async()=>{
 let headers;const image=await searchStockImage({provider:'pexels'},{apiKey:'private-fixture'},'morning light',{request:async(_u,o)=>{headers=o.headers;return {photos:[{src:{large2x:'https://images.pexels.com/photos/1/a.jpg'},photographer:'Test creator',url:'https://pexels.com/photo/1'}]};}});assert.equal(headers.authorization,'private-fixture');assert.equal(image.credit,'Test creator / Pexels');
});
