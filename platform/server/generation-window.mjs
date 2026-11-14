import {pageClock,inWindow,findSlot,wallTimeToInstant} from './scheduling.mjs';
import {liveNews} from './news-timing.mjs';
// Only starting resource-heavy source/copy work observes generation hours.
// Finishing a prepared design and booking delivery must not be parked all day.
export const startsGeneration=kind=>['aggregate','research_journal','generate','import_products'].includes(kind);

export function generationAvailability(rule,page,reservations=[],{now=new Date(),urgent=false}={}){
 if(rule.enabled===false)return {allowed:false,next:new Date(+now+5*60000),message:'This Page’s automation is paused. Preparation waits; existing scheduled delivery remains independent.'};
 if(liveNews(page))return {allowed:true,emergency:false,message:'Live news preparation runs throughout the day; publication limits and memory safeguards still apply.'};
 if(urgent)return {allowed:true,emergency:true,message:'Explicit priority preparation; publishing limits and memory safeguards still apply.'};
 const window=rule.generation_window||{};
 if(!window.enabled)return {allowed:true,emergency:false};
 const inside=inWindow({...page,window_start:window.start||'22:00',window_end:window.end||'07:00'},now);
 const local=pageClock(page,now),start=window.start||'22:00';
 let date=local.date;
 if(local.time>=start)date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 let next;
 try{next=wallTimeToInstant(date+'T'+start,page.timezone);}catch{next=new Date(+now+3600000);}
 if(inside)return {allowed:true,emergency:false,leadMinutes:Math.ceil((+next-+now)/60000)+(rule.refill_minutes||60)};
 if(window.emergency_refill){
  // Unprepared/held automatic news drafts reserve calendar space, but cannot
  // keep an empty delivery queue falsely "healthy" while their writing waits.
  if(page.kind==='news'&&!page.require_review)reservations=reservations.filter(r=>!['draft','review','failed','rejected'].includes(r.status));
  const until=new Date(+now+(rule.refill_minutes||60)*60000);
  try{findSlot({...page,daily_cap:Math.min(page.daily_cap,rule.daily_target)},reservations,{from:new Date(+now+60000),until,spread:page.creative_policy?.scheduleMode!=='interval'});return {allowed:true,emergency:true,until,message:'Queue is near empty. Preparing a small daytime refill with the memory safeguards active.'};}catch(e){if(e.code!=='no_slot')throw e;}
  // A healthy queue must wake again when it reaches the lead time, rather than
  // sleeping all the way to tonight and missing the daytime rescue opportunity.
  try{
   const first=findSlot({...page,daily_cap:Math.min(page.daily_cap,rule.daily_target)},reservations,{from:new Date(+now+60000),until:next,spread:page.creative_policy?.scheduleMode!=='interval'});
   const check=new Date(Math.max(+now+60000,Math.min(+next,+first-(rule.refill_minutes||60)*60000)));
   return {allowed:false,next:check,message:`Queue is healthy. Generation rests; next refill check at ${pageClock(page,check).time} (${page.timezone}).`};
  }catch(e){if(e.code!=='no_slot')throw e;}
 }
 return {allowed:false,next,message:`Generation rests until ${start} (${page.timezone}). Scheduled publishing continues.`};
}
