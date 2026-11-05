import {AppError} from './errors.mjs';
export function pageClock(page,now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:page.timezone,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
 return {time:parts.hour+':'+parts.minute,date:parts.year+'-'+parts.month+'-'+parts.day};
}
export function inWindow(page,now=new Date()){
 const {time}=pageClock(page,now),s=page.window_start,e=page.window_end;
 if(s===e)return true;
 return s<e?time>=s&&time<=e:time>=s||time<=e;
}
export async function publishGate(client,workspaceId,page,post,{now=new Date()}={}){
 if(!page.active)throw new AppError(409,'Enable this Page before publishing.');
 if(page.require_review&&post.approved_version!==post.version)throw new AppError(409,'Approve the current version before publishing.');
 if(!inWindow(page,now))throw new AppError(409,'Outside this Page’s posting window. Choose a time in the calendar.','outside_window');
 const {rows}=await client.query(`SELECT published_at FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status IN ('published','publishing','unknown') AND id<>$3 ORDER BY COALESCE(published_at,updated_at) DESC LIMIT 250`,[workspaceId,page.id,post.id]);
 const today=pageClock(page,now).date,postedToday=rows.filter(r=>r.published_at&&pageClock(page,new Date(r.published_at)).date===today).length;
 if(postedToday>=page.daily_cap)throw new AppError(409,'This Page’s configured daily frequency has been reached.','daily_cap');
 if(rows.some(r=>!r.published_at))throw new AppError(409,'Another publication is in progress or needs reconciliation.');
 if(rows[0]?.published_at&&now-new Date(rows[0].published_at)<page.gap_minutes*60000)throw new AppError(409,'Wait for this Page’s configured gap between posts.','posting_gap');
}
