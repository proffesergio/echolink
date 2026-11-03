import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePage,sourceCommentReady} from '../src/core.mjs';
test('source comments wait for due time, page activation, quiet hours and live mode',()=>{
  const page={active:true,timezone:'Asia/Dhaka',start:'09:00',end:'23:00'};
  const now=new Date('2026-11-03T05:00:00Z');
  assert.equal(sourceCommentReady(page,'2026-11-03T05:01:00Z',now,false),false);
  assert.equal(sourceCommentReady(page,'2026-11-03T04:59:00Z',now,false),true);
  assert.equal(sourceCommentReady(page,'2026-11-03T04:59:00Z',now,true),false);
  assert.equal(sourceCommentReady({...page,active:false},'2026-11-03T04:59:00Z',now,false),false);
  assert.equal(sourceCommentReady(page,'2026-11-03T04:59:00Z',new Date('2026-11-03T18:00:00Z'),false),false);
});
test('posting policy defaults and invalid delays fail closed',()=>{
  const p=normalizePage({id:'r',fields:{}});assert.equal(p.commentDelay,5);assert.equal(p.minimumGap,30);
  assert.throws(()=>normalizePage({id:'r',fields:{'Source Comment Delay Minutes':-1}}));
  assert.throws(()=>normalizePage({id:'r',fields:{'Minimum Minutes Between Posts':0}}));
});
