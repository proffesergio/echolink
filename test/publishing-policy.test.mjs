import {test} from 'node:test';
import assert from 'node:assert/strict';
import {slotProblem,nextSlot,withSuggestedHashtags,suggestedHashtags} from '../src/publishing-policy.mjs';
import {responsePolicy} from '../src/facebook.mjs';
const page={timezone:'Asia/Dhaka',start:'09:00',end:'23:00',dailyMax:2,minimumGap:60};
test('calendar prevents quiet hours, reserved daily-cap collisions and too-close posts',()=>{
  const posts=[{id:'a',status:'Approved',scheduled_at:'2026-11-04T04:00:00Z'},{id:'b',status:'Posted',published_at:'2026-11-04T07:00:00Z'}];
  assert.match(slotProblem(page,'2026-11-04T02:00:00Z',[]),/inside/);
  assert.match(slotProblem(page,'2026-11-04T08:00:00Z',posts),/Daily cap/);
  assert.match(slotProblem(page,'2026-11-04T04:59:00Z',posts.slice(0,1)),/60 minutes/);
  assert.equal(slotProblem(page,'2026-11-04T05:00:00Z',posts.slice(0,1)),null);
  assert.equal(slotProblem(page,'2026-11-04T04:00:00Z',posts,'a'),null);
  assert.equal(nextSlot(page,posts,{from:'2026-11-04T08:00:00Z'}),'2026-11-05T03:00:00.000Z');
});
test('calendar handles overnight windows, timezone date boundaries, zero caps and DST',()=>{
  assert.equal(slotProblem({...page,start:'22:00',end:'05:00'},'2026-11-04T18:00:00Z',[]),null);
  assert.equal(nextSlot({...page,dailyMax:0},[],{from:'2026-11-04T03:00:00Z'}),null);
  const ny={...page,timezone:'America/New_York'};
  assert.equal(nextSlot(ny,[],{from:'2026-11-01T06:00:00Z'}),'2026-11-01T14:00:00.000Z');
  const posts=[{id:'a',status:'Posted',published_at:'2026-11-04T16:00:00Z'}];
  assert.equal(slotProblem({...page,start:'00:00',end:'00:00',dailyMax:1},'2026-11-04T18:01:00Z',posts),null);
});
test('topic hashtags are limited, relevant, reviewable and do not alter existing tagged captions',()=>{
  assert.deepEqual(suggestedHashtags({title:'ঢাকায় বাংলাদেশের ক্রিকেট দল'}),['#ক্রিকেট','#ঢাকা','#বাংলাদেশ']);
  assert.deepEqual(suggestedHashtags({title:'A story with no known topic'},'English'),[]);
  assert.equal(withSuggestedHashtags('Reviewed #Existing',{title:'ক্রিকেট'},'Bangla'),'Reviewed #Existing');
  assert.match(withSuggestedHashtags('নতুন খবর',{title:'বাংলাদেশ'},'Bangla'),/\n\n#বাংলাদেশ$/);
  assert.equal(withSuggestedHashtags('ক'.repeat(1799),{title:'ক্রিকেট'},'Bangla').length,1799);
});
test('Meta throttling honors Retry-After, usage headers and durable auth/policy pauses',()=>{
  const response=(status,headers={})=>({status,headers:new Headers(headers)});
  assert.equal(responsePolicy(response(429,{'retry-after':'1800'})).retryAfter,1800);
  assert.equal(responsePolicy(response(400),{error:{code:32}}).rateLimited,true);
  assert.equal(responsePolicy(response(400),{error:{code:4}}).global,true);
  assert.equal(responsePolicy(response(200,{'x-page-usage':'{"call_count":93}'})).retryAfter,300);
  assert.equal(responsePolicy(response(400,{'x-business-use-case-usage':'{"123":[{"estimated_time_to_regain_access":40}]}'}),{error:{code:80001}}).retryAfter,2400);
  for(const code of [10,190,200,368])assert.equal(responsePolicy(response(400),{error:{code}}).paused,true);
  assert.equal(responsePolicy(response(400),{error:{code:100}}).paused,false);
  assert.equal(responsePolicy(response(429,{'retry-after':'Wed, 04 Nov 2026 06:00:00 GMT'}),{},Date.parse('2026-11-04T05:00:00Z')).retryAfter,3600);
});
