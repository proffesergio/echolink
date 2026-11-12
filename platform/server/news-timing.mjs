// Aggregated news uses a short, live queue. Evergreen Pages retain their buffers.
export const LIVE_NEWS_MAX_AGE_MS=24*3600000;
export const liveNews=page=>page.kind==='news'&&page.aggregation_enabled===true;
export const spreadSchedule=(page,requested=true)=>requested&&!liveNews(page)&&page.creative_policy?.scheduleMode!=='interval';
export function sourcePublishedAt(post){
 const sources=post.seo?.research?.sources||[];
 const canonical=sources.find(s=>s.url===post.source_url);
 return (canonical||sources[0])?.publishedAt||null;
}
export function newsFreshnessProblem(page,post,{now=new Date()}={}){
 // Manually authored stories have no aggregation dossier and keep editorial control.
 if(!liveNews(page)||post.type!=='news'||!post.seo?.research)return null;
 const at=Date.parse(sourcePublishedAt(post));
 if(!Number.isFinite(at))return 'Automatic news needs the original source publication time. Collect a fresh report.';
 if(at>+now+300000)return 'The source publication time is in the future. Check the feed timestamp before publication.';
 if(at<+now-LIVE_NEWS_MAX_AGE_MS)return 'This aggregated story is more than 24 hours old. Retained for review; automatic publishing will select fresh news.';
 return null;
}
export function liveNewsRefill(rule,page,reservations,{now=new Date(),periodEnd}={}){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:page.timezone}).format(now);
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:page.timezone}),dayOf=at=>format.format(new Date(at));
 const delivered=reservations.filter(r=>r.at&&['published','publishing','unknown','scheduled','ready_manual'].includes(r.status));
 const full=delivered.filter(r=>dayOf(r.at)===date).length>=Math.min(rule.daily_target,page.daily_cap);
 // Keep the next two bookings supplied while their publisher waits. Preparation
 // remains one task/model at a time; this is a queue buffer, not parallel inference.
 const horizon=+now+Math.min(120,Math.max(30,3*page.gap_minutes))*60000;
 const upcoming=delivered.filter(r=>r.at&&+new Date(r.at)>+now&&+new Date(r.at)<=horizon).sort((a,b)=>+new Date(a.at)-+new Date(b.at));
 const count=!full&&upcoming.length<2&&(!periodEnd||+new Date(periodEnd)>+now)?1:0;
 return {count,refillUntil:null,nextCheck:new Date(+now+60000),message:full?'News daily capacity is filled. Checking again shortly.':count?'Preparing the next fresh story while booked publishing continues.':'The next two news slots are supplied. Checking again in one minute.'};
}
