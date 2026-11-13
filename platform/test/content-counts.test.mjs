import test from 'node:test';
import assert from 'node:assert/strict';
import {contentCount} from '../client/content-status-counts.mjs';
import {scopeState} from '../client/scope.mjs';

test('content counts use complete canonical aggregates rather than the dashboard sample',()=>{
 const state={contentStatusCounts:{NEED_ATTENTION:420,FAILED:3,PREPARING:0},posts:[{content_status:'PREPARING'}]};
 assert.equal(contentCount(state,'attention'),423);
 assert.equal(contentCount(state,'review'),420);
 assert.equal(contentCount(state,'preparing'),0);
});
test('switching profiles selects its own canonical counts and preserves explicit zeros',()=>{
 const state={pages:[{id:'n'},{id:'f'}],websites:[],connections:[],posts:[],tasks:[],feeds:[],products:[],automation_rules:[],campaigns:[],
 pageContentStatusCounts:[{page_id:'n',status:'NEED_ATTENTION',count:401},{page_id:'f',status:'PREPARING',count:7}],pagePostCounts:[]};
 assert.equal(contentCount(scopeState(state,'n'),'attention'),401);
 assert.equal(contentCount(scopeState(state,'n'),'preparing'),0);
 assert.equal(contentCount(scopeState(state,'f'),'preparing'),7);
 assert.equal(contentCount(scopeState(state,'f'),'attention'),0);
});
