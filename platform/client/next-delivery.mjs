// Calendar rows include bookings older than the recent content list. A deferred
// delivery counts down to its recorded retry, without changing its booked slot.
export function nextDelivery(state,pageId,now=Date.now()){
 const posts=new Map([...(state.posts||[]),...(state.calendar||[])].map(p=>[p.id,p]));
 return [...posts.values()].filter(p=>(!pageId||p.page_id===pageId)&&p.status==='scheduled'&&p.scheduled_at).map(p=>{
  const task=(state.tasks||[]).find(t=>t.post_id===p.id&&t.kind==='publish'&&t.status==='queued');
  const retry=+new Date(p.scheduled_at)<=now&&task?.not_before&&+new Date(task.not_before)>now;
  return {...p,next_delivery_at:retry?task.not_before:p.scheduled_at,delivery_retry:!!retry};
 }).sort((a,b)=>new Date(a.next_delivery_at)-new Date(b.next_delivery_at))[0];
}
