import test from 'node:test';
import assert from 'node:assert/strict';
import {findSlot,pageClock,wallTimeToInstant,slotProblem} from '../server/scheduling.mjs';
const page={timezone:'Asia/Dhaka',window_start:'00:00',window_end:'00:00',daily_cap:20,gap_minutes:60};
test('twenty daily slots spread across an unrestricted day without overlaps',()=>{
 const reservations=[],from=wallTimeToInstant('2026-11-08T00:00',page.timezone);
 for(let i=0;i<20;i++){const at=findSlot(page,reservations,{from,spread:true});assert.equal(pageClock(page,at).date,'2026-11-08');assert.equal(slotProblem(page,reservations,at),null);reservations.push({at,status:'scheduled'});}
 assert.equal(pageClock(page,findSlot(page,reservations,{from,spread:true})).date,'2026-11-09');
 for(let i=1;i<reservations.length;i++)assert(reservations[i].at-reservations[i-1].at>=3600000);
});
test('calendar accounts for pending approval and scheduled bookings, plan expiry and Page timezone',()=>{
 const from=wallTimeToInstant('2026-11-08T01:00','Asia/Dhaka');assert.equal(from.toISOString(),'2026-11-07T19:00:00.000Z');
 const bookings=[{at:from,status:'review'},{at:new Date(+from+3600000),status:'scheduled'}];const at=findSlot(page,bookings,{from});assert.equal(pageClock(page,at).time,'03:00');
 assert.throws(()=>findSlot(page,bookings,{from,until:new Date(+from+30*60000)}),e=>e.code==='no_slot');
 assert.throws(()=>wallTimeToInstant('2026-03-08T02:30','America/New_York'),e=>e.status===400);
});
