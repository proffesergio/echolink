import test from 'node:test';
import assert from 'node:assert/strict';
import {liveNews,newsFreshnessProblem,liveNewsRefill,spreadSchedule} from '../server/news-timing.mjs';
import {nextSlot,publishGate,usableBookings} from '../server/scheduling.mjs';
import {generationAvailability} from '../server/generation-window.mjs';
import {generationBuffer} from '../server/generation-buffer.mjs';
import {clusterStories,shortlistStories,createFeedCollector} from '../server/news-research.mjs';
import {websiteBeforeDesign} from '../server/website-first.mjs';
const now=new Date('2026-11-12T08:03:10Z');
const page={id:'page',kind:'news',aggregation_enabled:true,timezone:'Asia/Dhaka',daily_cap:70,gap_minutes:7,window_start:'00:00',window_end:'00:00',creative_policy:{scheduleMode:'spread'}};
const rule={enabled:true,daily_target:70,batch_size:3,buffer_hours:1,refill_minutes:5,generation_window:{enabled:true,start:'22:00',end:'07:00'}};
const post=at=>({type:'news',source_url:'https://example.com/canonical',seo:{research:{sources:[{url:'https://example.com/canonical',publishedAt:at}]}}});

test('live news prepares during daytime while paused rules and evergreen generation hours remain enforced',()=>{
 assert(liveNews(page));assert(!spreadSchedule(page,true));assert(generationAvailability(rule,page,[],{now}).allowed);
 assert(!generationAvailability({...rule,enabled:false},page,[],{now,urgent:true}).allowed);
 assert(!generationAvailability(rule,{...page,kind:'ecommerce'},[],{now}).allowed);
});
test('news gets the earliest seven-minute slot even under a legacy spread setting and held draft reservations',async()=>{
 const reservations=[{status:'published',at:new Date('2026-11-12T08:00:12Z')},{status:'review',at:new Date('2026-11-12T08:08:00Z')}];
 const db={query:async()=>({rows:reservations})};
 const at=await nextSlot(db,'workspace',page,{from:now,spread:true,target:70});
 assert.equal(at.toISOString(),'2026-11-12T08:08:00.000Z');
 assert.equal(usableBookings(page,reservations).length,1);
 assert.equal(usableBookings({...page,kind:'ecommerce'},reservations).length,2);
});
test('a newsroom keeps one upcoming story rather than building a stale multi-item buffer',()=>{
 assert.equal(generationBuffer(rule,page,[],{now}).count,1);
 const pending=[{status:'scheduled',at:new Date(+now+7*60000)}];
 assert.equal(liveNewsRefill(rule,page,pending,{now}).count,0);
 assert.equal(liveNewsRefill(rule,page,pending,{now:new Date(+now+8*60000)}).count,1);
 assert.equal(liveNewsRefill(rule,page,[{status:'review',at:new Date(+now+60000)}],{now}).count,1);
 const full=Array.from({length:70},()=>({status:'published',at:new Date(+now-60000)}));
 assert.equal(liveNewsRefill(rule,page,full,{now}).count,0);
 assert.equal(liveNewsRefill(rule,page,[],{now,periodEnd:new Date(+now-1)}).count,0);
});
test('freshness uses the canonical source timestamp, never creation time or another source',()=>{
 for(const hours of [2,12,23.9])assert.equal(newsFreshnessProblem(page,post(new Date(+now-hours*3600000).toISOString()),{now}),null);
 assert.match(newsFreshnessProblem(page,post(new Date(+now-24*3600000-1).toISOString()),{now}),/24 hours/);
 assert.match(newsFreshnessProblem(page,post(null),{now}),/original source/);
 assert.match(newsFreshnessProblem(page,post(new Date(+now+6*60000).toISOString()),{now}),/future/);
 assert.equal(newsFreshnessProblem(page,{type:'news',seo:{}},{now}),null,'manual reporting stays under editorial control');
 const old=post(new Date(+now-25*3600000).toISOString());old.created_at=now;old.seo.research.sources.unshift({url:'https://example.com/related',publishedAt:now});
 assert.match(newsFreshnessProblem(page,old,{now}),/24 hours/);
});
test('latest selection wins over cross-source quantity, image bonuses and category balance',()=>{
 const article=(title,url,age)=>({title,url,date:new Date(+now-age*60000).toISOString(),image:'https://example.com/image.jpg'});
 const old='River restoration project opens in northern city';
 const clusters=clusterStories([article(old,'https://one.example/old',90),article(old,'https://two.example/old',90),article('National examination schedule announced today','https://three.example/new',2)],+now);
 const options=shortlistStories(clusters,{now:+now,latest:true,notBefore:new Date(+now-3*3600000)});
 assert.equal(options[0].primary.url,'https://three.example/new');
 assert.equal(shortlistStories(clusters,{now:+now,latest:true,notBefore:new Date(+now-5*60000)}).length,1);
});
test('feed cache checks again after a minute while coalescing immediate tenant-scoped reads',async()=>{
 let calls=0,clock=0;const collect=createFeedCollector({clock:()=>clock,read:async()=>{calls++;return [];}}),feeds=[{id:'feed',url:'https://example.com/feed'}];
 await collect('w','p',feeds);clock=59000;await collect('w','p',feeds);assert.equal(calls,1);
 clock=60000;await collect('w','p',feeds);assert.equal(calls,2);
});
test('stale news cannot enter social delivery or the website write stage',async()=>{
 const old=post('2026-01-01T00:00:00Z');
 await assert.rejects(()=>publishGate({},'workspace',page,old,{now}),{code:'news_stale'});
 let writes=0;await assert.rejects(()=>websiteBeforeDesign({task:{},page,post:old,site:{connector:'nobleseek_db'},connection:{}},{updateTask:()=>{},write:()=>{writes++;},transact:()=>{throw Error('must not reach a receipt or database write');}}),{code:'news_stale'});
 assert.equal(writes,0);
});
