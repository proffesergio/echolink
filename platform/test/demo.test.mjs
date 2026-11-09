import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,readDemoState,demoDraft,updateDemoPost} from '../client/demo-data.mjs';
const now=new Date('2026-11-08T10:00:00Z');
test('restored demo data excludes credential, tenant and unknown Page fields',()=>{
 const state=createDemoState(now);state.posts[0].token='must-not-survive';state.workspaceId='production';state.posts.push({...state.posts[0],id:'injected',pageId:'real-page'});
 const restored=readDemoState(JSON.stringify(state),now);assert.equal(restored.posts.length,3);assert.equal(restored.workspaceId,undefined);assert.equal(restored.posts[0].token,undefined);
 assert.equal(readDemoState('{invalid',now).posts.length,3);assert.equal(readDemoState('{"version":2}',now).posts.length,3);
});
test('a draft cannot replace its Page identity or reserve a past demo date',()=>{
 const state=createDemoState(now),id=state.posts[0].id;
 assert.throws(()=>updateDemoPost(state,id,{status:'scheduled',scheduledAt:'2026-11-08T09:00:00Z'},now),/future/);
 const next=updateDemoPost(state,id,{pageId:'other',workspaceId:'production',status:'scheduled',scheduledAt:'2026-11-09T10:00:00Z'},now);
 assert.equal(next.posts[0].pageId,'forma');assert.equal(next.posts[0].workspaceId,undefined);assert.equal(state.posts[0].status,'draft');
 assert.equal(next.posts[1].status,state.posts[1].status);
});
test('corrupt schedules return to Draft and stored content is bounded',()=>{
 const state=createDemoState(now);state.posts[0].status='scheduled';state.posts[0].scheduledAt='invalid';state.posts[0].facebook='x'.repeat(10000);state.connections={forma:{facebook:true,secret:'not-public'}};
 const restored=readDemoState(JSON.stringify(state),now);assert.equal(restored.posts[0].status,'draft');assert.equal(restored.posts[0].facebook.length,5000);assert.deepEqual(restored.connections.forma,{facebook:true,instagram:false,website:false});
});
test('sample captions remain explicitly fictional for news and adapt by product and language',()=>{
 const news=demoDraft({pageId:'daily',brief:'A community reading day'},now);assert.match(news.facebook,/SAMPLE STORY/);
 const product=demoDraft({pageId:'forma',brief:'A desk refresh',productId:'lamp',language:'English'},now);assert.match(product.facebook,/Adjustable arm/);assert(!product.facebook.includes('Cotton'));assert.notEqual(product.facebook,product.instagram);
 const bangla=demoDraft({pageId:'forma',brief:'A desk refresh',productId:'lamp',language:'Bangla'},now);assert.match(bangla.facebook,/[\u0980-\u09FF]/);
 assert.throws(()=>demoDraft({pageId:'real-page',brief:'hello'},now),/demo Page/);
});
