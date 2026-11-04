import {query} from './db.mjs';
import {nextSlot,slotProblem} from './publishing-policy.mjs';

export async function calendarContext(pageId){
  const page=(await query("SELECT config FROM echolink.configurations WHERE kind='page' AND id=$1",[pageId])).rows[0]?.config;
  if(!page)throw new Error('Page not found');
  const posts=(await query("SELECT id,status,scheduled_at,published_at,updated_at FROM echolink.articles WHERE page_id=$1 AND status IN ('Approved','Posted','Publishing','Publish Unknown') AND (scheduled_at>=now()-interval '7 days' OR published_at>=now()-interval '7 days' OR status IN ('Publishing','Publish Unknown'))",[pageId])).rows;
  return {page,posts};
}
export async function validateSlot(pageId,at,id){const {page,posts}=await calendarContext(pageId);return slotProblem(page,at,posts,id);}
export async function suggestSlot(pageId,from,id){
  const {page,posts}=await calendarContext(pageId);
  const date=from?new Date(from):new Date(Date.now()+60000);
  if(!Number.isFinite(date.getTime())||date<new Date()||date>Date.now()+90*86400000)throw new Error('Choose a future date within 90 days');
  const scheduledAt=nextSlot(page,posts,{from:date,excludeId:id});
  return {ok:!!scheduledAt,scheduledAt,timezone:page.timezone,minimumGap:page.minimumGap,dailyMax:page.dailyMax};
}
