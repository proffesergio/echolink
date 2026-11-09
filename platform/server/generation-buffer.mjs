import {findSlot} from './scheduling.mjs';

// A refill has a fixed end: a moving horizon could keep a slow generator busy forever.
// Use actual calendar reservations, rather than treating a far-future post as coverage.
export function generationBuffer(rule,page,reservations,{now=new Date(),periodEnd,leadMinutes}={}){
 const hours=Math.min(page.kind==='news'?24:2160,Number(rule.buffer_hours||4)),low=Math.max(Number(rule.refill_minutes||60),Number(leadMinutes)||0);
 const targetPage={...page,daily_cap:Math.min(page.daily_cap,rule.daily_target)};
 const target=new Date(Math.min(+now+hours*3600000,periodEnd?+new Date(periodEnd):Infinity));
 const from=new Date(+now+60000),options={from,until:target,spread:page.creative_policy?.scheduleMode!=='interval',target:targetPage.daily_cap};
 const next=(items,until)=>{try{return findSlot(targetPage,items,{...options,until});}catch(e){if(e.code==='no_slot')return null;throw e;}};
 const first=next(reservations,target),continuing=rule.refill_until&&+new Date(rule.refill_until)>+now;
 const checkAt=new Date(+now+15*60000);
 if(!first)return {count:0,refillUntil:null,nextCheck:checkAt,message:'Calendar buffer or daily capacity is filled. Generation is resting; publication stays available.'};
 if(!continuing&&+first>+now+low*60000)return {count:0,refillUntil:null,nextCheck:new Date(Math.max(+now+60000,Math.min(+checkAt,+first-low*60000))),message:'Calendar buffer is healthy. Generation is resting until the next refill.'};
 const until=continuing?new Date(Math.min(+new Date(rule.refill_until),+target)):target;
 const virtual=[...reservations];let count=0;
 while(count<rule.batch_size){const at=next(virtual,until);if(!at)break;virtual.push({id:'buffer-'+count,status:'scheduled',at});count++;}
 return count?{count,nextAt:first,refillUntil:until,nextCheck:new Date(+now+60000),message:`Refilling the ${hours}-hour calendar buffer in small batches.`}:{count:0,refillUntil:null,nextCheck:checkAt,message:'This refill is complete. Generation is resting; scheduled delivery continues.'};
}
