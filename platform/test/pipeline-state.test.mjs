import test from 'node:test';
import assert from 'node:assert/strict';
import {pipelineForPage} from '../client/pipeline-state.mjs';
import {nextDelivery} from '../client/next-delivery.mjs';
test('an overdue product delivery counts down to the recorded retry rather than freezing at zero',()=>{
 const now=Date.parse('2026-11-11T10:00Z'),state={calendar:[{id:'p',page_id:'shop',status:'scheduled',scheduled_at:'2026-11-11T09:00Z'}],tasks:[{post_id:'p',kind:'publish',status:'queued',not_before:'2026-11-11T10:05Z'}]};
 const next=nextDelivery(state,'shop',now);assert.equal(next.delivery_retry,true);assert.equal(+new Date(next.next_delivery_at)-now,300000);assert.equal(next.scheduled_at,'2026-11-11T09:00Z');assert.equal(nextDelivery(state,'other',now),undefined);
});
const page={id:'news',kind:'news',website_publishing:true,creative_policy:{linkComments:{enabled:true}}};
test('next scheduled post comes from the full Page calendar even outside the recent-post list',()=>{
 const state={posts:[{id:'recent',page_id:'news',status:'draft'}],tasks:[],calendar:[{id:'other',page_id:'store',status:'scheduled',scheduled_at:'2026-11-11T01:00:00Z'},{id:'booked',page_id:'news',status:'scheduled',scheduled_at:'2026-11-11T02:00:00Z'}]};
 assert.equal(pipelineForPage(state,page).next.id,'booked');
});
test('pipeline stays scoped to its Page and selected content and never invents a delivery receipt',()=>{
 const state={posts:[{id:'a',page_id:'news',body:'facts',caption:'caption',seo:{article:{wordCount:100}},creative:{assetId:'image'},status:'scheduled',scheduled_at:'2030-01-01T00:00Z'}],tasks:[{id:'one',page_id:'news',post_id:'a',kind:'publish',status:'running',progress:20,phase:'Publishing website',events:[{phase:'Publishing website',progress:20,at:'2026-11-09T08:00Z'}]},{id:'two',page_id:'store',kind:'generate',status:'running',progress:99}],social_destinations:[]};
 const model=pipelineForPage(state,page);assert.equal(model.active.length,1);assert.equal(model.stages.find(s=>s.id==='website').status,'running');assert.equal(model.stages.find(s=>s.id==='facebook').status,'pending');assert.equal(model.stages.find(s=>s.id==='instagram').status,'off');assert.equal(model.stages.find(s=>s.id==='write').status,'done');assert.equal(model.events.length,1);
 state.tasks[0].status='unknown';assert.equal(pipelineForPage(state,page).stages.find(s=>s.id==='facebook').status,'unknown');
});
test('actual saved URL and Facebook ID are evidence of completed delivery; disabled website is distinct from success',()=>{
 const state={posts:[{id:'a',page_id:'news',status:'published',website_url:'https://news.example/a',fb_post_id:'1_2',creative:{},seo:{}}],tasks:[]};
 const model=pipelineForPage(state,page);assert.equal(model.stages.find(s=>s.id==='website').status,'done');assert.equal(model.stages.find(s=>s.id==='facebook').status,'done');assert.equal(model.stages.find(s=>s.id==='design').status,'pending');assert.equal(pipelineForPage(state,{...page,website_publishing:false}).stages.find(s=>s.id==='website').status,'off');
});
test('a delayed model retry follows the waiting draft and preserves its real checkpoint instead of showing an idle pipeline',()=>{
 const now=Date.parse('2026-11-09T13:00:00Z'),task={id:'retry',page_id:'news',post_id:'waiting',kind:'generate',status:'queued',progress:38,not_before:new Date(now+300000),phase:'The local model exceeded its response time budget.',result:{waiting:{code:'inference_host_wait'}}};
 const state={posts:[{id:'old',page_id:'news',status:'published'},{id:'waiting',page_id:'news',status:'draft'}],tasks:[task]};
 const model=pipelineForPage(state,page,{now});assert.equal(model.post.id,'waiting');assert.equal(model.retry.id,'retry');const writing=model.stages.find(s=>s.id==='write');assert.equal(writing.status,'waiting');assert.equal(writing.progress,38);assert.equal(writing.retrySeconds,300);
 assert.equal(pipelineForPage(state,page,{now,postId:'old'}).retry,undefined);
});
