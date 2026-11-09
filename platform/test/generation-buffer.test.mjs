import test from 'node:test';
import assert from 'node:assert/strict';
import {generationBuffer} from '../server/generation-buffer.mjs';
import {validate} from '../server/validation.mjs';
import {randomUUID} from 'node:crypto';
const now=new Date('2026-11-08T09:00:00Z'),page={timezone:'UTC',daily_cap:100,gap_minutes:5,window_start:'00:00',window_end:'00:00',creative_policy:{scheduleMode:'interval'}},rule={buffer_hours:2,refill_minutes:45,batch_size:3,daily_target:100};
const reservations=Array.from({length:24},(_,i)=>({id:String(i),status:'scheduled',at:new Date(+now+(1+i*5)*60000)}));
test('a full calendar sleeps while a far-future post cannot hide an empty upcoming queue',()=>{
 assert.equal(generationBuffer(rule,page,reservations,{now}).count,0);
 assert.equal(generationBuffer(rule,page,[reservations.at(-1)],{now}).count,3);
});
test('refills keep a fixed endpoint and continue past the low watermark without chasing a moving target',()=>{
 const ready=reservations.slice(0,12);assert.equal(generationBuffer(rule,page,ready,{now}).count,0);
 const until=new Date(+now+2*3600000),active=generationBuffer({...rule,refill_until:until},page,ready,{now});assert.equal(active.count,3);assert.equal(+active.refillUntil,+until);
 const later=new Date(+now+30*60000),again=generationBuffer({...rule,refill_until:until},page,ready,{now:later});assert.equal(+again.refillUntil,+until);
});
test('buffers honor spread schedules, zero daily capacity and subscription expiry',()=>{
 const spread={...page,daily_cap:50,gap_minutes:10,creative_policy:{scheduleMode:'spread'}},s={...rule,buffer_hours:6,refill_minutes:120,batch_size:10,daily_target:10};
 assert.equal(generationBuffer(s,spread,[],{now:new Date('2026-11-08T13:00:00Z')}).count,2);
 assert.equal(generationBuffer(rule,{...page,daily_cap:0},[],{now}).count,0);
 const end=new Date(+now+12*60000);assert.equal(generationBuffer({...rule,batch_size:10},page,[],{now,periodEnd:end}).count,3);
});
test('validation prevents a refill threshold longer than the configured buffer and strips server state',()=>{
 const base={page_id:randomUUID(),name:'Buffered'};assert.throws(()=>validate('rule',{...base,buffer_hours:1,refill_minutes:90}));
 const valid=validate('rule',{...base,generation_mode:'buffered',buffer_hours:2,refill_minutes:45,refill_until:'2030-01-01'});assert.equal(valid.refill_until,undefined);assert.equal(valid.generation_mode,'buffered');
});
