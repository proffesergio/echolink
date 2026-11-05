import {AppError} from './errors.mjs';
const clocks=new Map();
export function pageClock(page,now=new Date()){
 let format=clocks.get(page.timezone);if(!format){format=new Intl.DateTimeFormat('en-CA',{timeZone:page.timezone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});clocks.set(page.timezone,format);}
 const parts=Object.fromEntries(format.formatToParts(now).map(x=>[x.type,x.value]));
 return {time:parts.hour+':'+parts.minute,date:parts.year+'-'+parts.month+'-'+parts.day};
}
export function inWindow(page,now=new Date()){
 const {time}=pageClock(page,now),s=page.window_start,e=page.window_end;
 if(s===e)return true;
 return s<e?time>=s&&time<=e:time>=s||time<=e;
}
export function wallTimeToInstant(value,timezone){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new AppError(400,'Choose a valid calendar date and time.');
 const desired=Date.parse(value+':00Z');let at=desired;
 for(let i=0;i<3;i++){const local=pageClock({timezone},new Date(at));at+=desired-Date.parse(local.date+'T'+local.time+':00Z');}
 const check=pageClock({timezone},new Date(at));if(check.date+'T'+check.time!==value)throw new AppError(400,'That local time does not exist in this timezone. Choose another time.');return new Date(at);
}
export async function bookings(db,w,pageId,exclude=null){return(await db.query(`SELECT id,status,COALESCE(published_at,scheduled_at,planned_at) AS at FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND ($3::uuid IS NULL OR id<>$3) AND deleted_at IS NULL AND archived_at IS NULL AND (status IN ('published','publishing','unknown','scheduled') OR planned_at IS NOT NULL) AND (COALESCE(published_at,scheduled_at,planned_at)>now()-interval '8 days' OR status IN ('publishing','unknown'))`,[w,pageId,exclude])).rows;}
export function slotProblem(page,reservations,at){
 if(!inWindow(page,at))return 'outside_window';if(page.daily_cap<1)return 'daily_cap';
 const date=pageClock(page,at).date,timed=reservations.filter(x=>x.at),today=timed.filter(x=>pageClock(page,new Date(x.at)).date===date);
 if(today.length>=page.daily_cap)return 'daily_cap';
 if(timed.some(x=>Math.abs(at-new Date(x.at))<page.gap_minutes*60000))return 'posting_gap';return null;
}
export function findSlot(page,reservations,{from=new Date(Date.now()+60000),until=new Date(+from+7*86400000),spread=false,target=page.daily_cap}={}){
 const end=Math.min(+until,+from+8*86400000),minute=s=>Number(s.slice(0,2))*60+Number(s.slice(3)),duration=(minute(page.window_end)-minute(page.window_start)+1440)%1440||1440,step=Math.max(page.gap_minutes,Math.floor(duration/Math.max(1,target)));
 for(let n=Math.ceil(+from/60000)*60000;n<end;n+=60000){const at=new Date(n);if(!inWindow(page,at))continue;if(spread&&((minute(pageClock(page,at).time)-minute(page.window_start)+1440)%1440)%step!==0)continue;if(!slotProblem(page,reservations,at))return at;}
 throw new AppError(409,'No open slot fits this Page’s window, daily target, posting gap and plan period. Adjust the Page schedule.','no_slot');
}
export async function nextSlot(db,w,page,{postId=null,from,until,spread=false,target}={}){return findSlot(page,await bookings(db,w,page.id,postId),{from,until,spread,target});}
export async function publishGate(client,workspaceId,page,post,{now=new Date()}={}){
 if(!page.active)throw new AppError(409,'Enable this Page before publishing.');
 if(post.approved_version!==post.version)throw new AppError(409,'Approve the current version before publishing.');
 if(!inWindow(page,now))throw new AppError(409,'Outside this Page’s posting window. Choose a time in the calendar.','outside_window');
 const slots=await bookings(client,workspaceId,page.id,post.id),problem=slotProblem(page,slots,now);
 if(problem)throw new AppError(409,problem==='posting_gap'?'This time is too close to another Page post. Choose the next available slot.':problem==='daily_cap'?'This Page’s daily publishing target is already booked.':'Choose a time inside this Page’s posting window.',problem);
 if(slots.some(x=>['publishing','unknown'].includes(x.status)&&!x.at))throw new AppError(409,'Another publication is in progress or needs reconciliation.','publication_pending');
}
