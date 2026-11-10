import test from 'node:test';
import assert from 'node:assert/strict';
import {generationAvailability,startsGeneration} from '../server/generation-window.mjs';
import {generationBuffer} from '../server/generation-buffer.mjs';
import {findSlot} from '../server/scheduling.mjs';
const page={kind:'ecommerce',timezone:'Asia/Dhaka',daily_cap:50,gap_minutes:10,window_start:'00:00',window_end:'00:00',creative_policy:{scheduleMode:'interval'}},rule={daily_target:50,buffer_hours:168,refill_minutes:60,batch_size:2,generation_window:{enabled:true,start:'22:00',end:'07:00',emergency_refill:false}};
test('generation hours gate new work rather than holding completion, calendar delivery or insights',()=>{
 for(const kind of ['aggregate','generate','import_products'])assert(startsGeneration(kind));
 for(const kind of ['creative','write_article','publish','publish_instagram','sync_insights'])assert(!startsGeneration(kind));
});
test('overnight hours are separate from publication hours and span midnight in the Page timezone',()=>{
 const day=new Date('2026-11-08T06:00:00Z');const waiting=generationAvailability(rule,page,[],{now:day});assert.equal(waiting.allowed,false);assert.equal(waiting.next.toISOString(),'2026-11-08T16:00:00.000Z');
 for(const now of [new Date('2026-11-08T17:00:00Z'),new Date('2026-11-08T20:00:00Z')])assert.equal(generationAvailability(rule,page,[],{now}).allowed,true);
 assert.equal(generationAvailability({...rule,generation_window:{enabled:false}},page,[],{now:day}).allowed,true);
});
test('daytime rescue requires a genuinely unfilled slot near the lead time',()=>{
 const now=new Date('2026-11-08T06:00:00Z'),rescue={...rule,generation_window:{...rule.generation_window,emergency_refill:true}};
 assert.equal(generationAvailability(rescue,page,[],{now}).emergency,true);
 const full=Array.from({length:6},(_,i)=>({at:new Date(+now+(1+i*10)*60000),status:'scheduled'})),healthy=generationAvailability(rescue,page,full,{now});assert.equal(healthy.allowed,false);assert.equal(+healthy.next,+now+60000,'Wake at the refill threshold rather than waiting until tonight.');
});
test('overnight refills cover gaps before the next night rather than waiting for daytime shortage',()=>{
 const now=new Date('2026-11-08T17:00:00Z'),reservations=Array.from({length:30},(_,i)=>({at:new Date(+now+(1+i*10)*60000),status:'scheduled'}));
 assert.equal(generationBuffer(rule,page,reservations,{now}).count,0);
 const night=generationAvailability(rule,page,reservations,{now});assert.equal(generationBuffer(rule,page,reservations,{now,leadMinutes:night.leadMinutes}).count,2);
});
test('news horizons remain short while evergreen reservations can extend beyond a month',()=>{
 const now=new Date('2026-11-08T00:00:00Z');const news=generationBuffer({...rule,buffer_hours:2160},{...page,kind:'news'},[],{now});assert.equal(+news.refillUntil,+now+86400000);
 const evergreen=generationBuffer({...rule,buffer_hours:2160},page,[],{now,periodEnd:new Date(+now+45*86400000)});assert.equal(+evergreen.refillUntil,+now+45*86400000);
 const daily={...page,timezone:'UTC',daily_cap:1},booked=Array.from({length:40},(_,i)=>({at:new Date(+now+i*86400000+12*3600000)}));
 assert.equal(findSlot(daily,booked,{from:new Date(+now+60000),until:new Date(+now+90*86400000)}).toISOString(),'2026-12-18T00:00:00.000Z');
});
