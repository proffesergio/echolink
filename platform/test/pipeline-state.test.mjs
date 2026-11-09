import test from 'node:test';
import assert from 'node:assert/strict';
import {pipelineForPage} from '../client/pipeline-state.mjs';
const page={id:'news',kind:'news',website_publishing:true,creative_policy:{linkComments:{enabled:true}}};
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
