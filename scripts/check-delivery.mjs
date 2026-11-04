import '../src/env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {query,closePools} from '../src/db.mjs';
import {hash} from '../src/core.mjs';
import {articleAction} from '../src/newsroom-actions.mjs';
import {processQueue,comments} from '../src/jobs.mjs';
import {deliveryGate,clearDeliveryPause} from '../src/facebook.mjs';
if(!process.env.ECHOLINK_TEST_BRANCH)throw new Error('Disposable test branch required');
const originalFetch=globalThis.fetch,calls=[];
let response={id:'123_456'},responseStatus=200,responseHeaders={};
// This test exercises real HTTP payload generation and durable DB transitions,
// but never makes a Facebook request or alters the production database.
globalThis.fetch=async(url,options)=>{
  if(new URL(url).hostname!=='graph.facebook.com')throw new Error('External adapters disabled in delivery test');
  if(String(url).includes('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',scopes:['pages_read_engagement','pages_manage_posts','pages_manage_engagement']}});
  if(String(url).includes('/me?'))return Response.json({id:'123',name:'Delivery probe'});
  calls.push({url:String(url),body:JSON.parse(options.body)});
  return Response.json(response,{status:responseStatus,headers:responseHeaders});
};
process.env.DRY_RUN='false';process.env.META_GRAPH_VERSION='v26.0';process.env.FB_TOKENS_JSON=JSON.stringify({deliveryProbe:'fake-token'});
const pageId='recDeliveryProbe',page={id:pageId,name:'Delivery probe',active:true,fbPageId:'123',fbSecret:'deliveryProbe',timezone:'Asia/Dhaka',start:'00:00',end:'00:00',dailyMax:3,minimumGap:60,approval:true,commentDelay:5};
const make=async(status='Draft',at=null)=>{
  const id=randomUUID(),caption='পরীক্ষামূলক পর্যালোচিত সংবাদ। #বাংলাদেশ';
  await query("INSERT INTO echolink.articles(id,page_id,url_hash,title_hash,title,source_url,body,caption,caption_hash,approval_hash,image_url,status,scheduled_at,source_published_at) VALUES($1,$2,$3,$3,'Delivery probe','https://example.com/story','Body',$4,$5,$5,'https://example.com/photo.jpg',$6,$7,now())",[id,pageId,randomUUID(),caption,hash(caption),status,at]);return id;
};
const reset=async()=>{await query('DELETE FROM echolink.facebook_delivery WHERE page_id=$1',[pageId]);await query("UPDATE echolink.articles SET status='Draft' WHERE page_id=$1",[pageId]);};
try{
  await query("INSERT INTO echolink.configurations(kind,id,config) VALUES('page',$1,$2)",[pageId,JSON.stringify(page)]);
  const first=await make();const action=await articleAction(first,'publish',{confirmed:true});assert.ok(action.runId);
  for(let i=0;i<100;i++){const run=(await query('SELECT status FROM echolink.job_runs WHERE id=$1',[action.runId])).rows[0];if(run.status!=='Running')break;await new Promise(r=>setTimeout(r,100));}
  const posted=(await query('SELECT * FROM echolink.articles WHERE id=$1',[first])).rows[0];assert.equal(posted.status,'Posted');assert.equal(posted.fb_post_id,'123_456');
  assert.match(calls[0].url,/\/photos$/);assert.equal(calls[0].body.caption,posted.caption);assert.equal(calls[0].body.url,posted.image_url);
  const comment=(await query('SELECT * FROM echolink.source_comments WHERE article_id=$1',[first])).rows[0];assert.ok(comment.due_at-posted.published_at>=299000);assert.equal(comment.status,'Queued');
  assert.equal((await comments({pageId})).sent,0);
  await query("UPDATE echolink.source_comments SET due_at=now()-interval '1 second' WHERE article_id=$1",[first]);response={id:'123_comment'};
  assert.equal((await comments({pageId})).sent,1);assert.match(calls.at(-1).url,/\/123_456\/comments$/);assert.equal(calls.at(-1).body.message,'সূত্র: https://example.com/story');assert.equal((await comments({pageId})).sent,0);
  const second=await make();await assert.rejects(articleAction(second,'publish',{confirmed:true}),/spacing|gap|minutes/);
  await reset();const throttle=await make('Approved');response={error:{code:32,message:'Never store arbitrary upstream text'}};responseStatus=400;responseHeaders={'Retry-After':'1200'};
  assert.equal((await processQueue({pageId,articleId:throttle})).pages[0].queued,throttle);assert.equal((await deliveryGate(pageId)).ready,false);
  const callCount=calls.length;await processQueue({pageId,articleId:throttle});assert.equal(calls.length,callCount,'Cooldown must prevent another HTTP write');
  await reset();const expired=await make('Approved');response={error:{code:190}};responseHeaders={};await processQueue({pageId,articleId:expired});assert.equal((await deliveryGate(pageId)).ready,false);await clearDeliveryPause(pageId);assert.equal((await deliveryGate(pageId)).ready,true);
  await reset();const scheduled=await make('Approved',new Date(Date.now()-7*3600000));const before=calls.length;await processQueue({pageId,articleId:scheduled});assert.equal((await query('SELECT status FROM echolink.articles WHERE id=$1',[scheduled])).rows[0].status,'Draft');assert.equal(calls.length,before);
  await reset();const preview=await make('Approved');await processQueue({pageId,articleId:preview,preview:true});assert.equal((await query('SELECT status FROM echolink.articles WHERE id=$1',[preview])).rows[0].status,'Pending Approval');assert.equal(calls.length,before,'Live-mode previews never publish');
  await reset();for(let i=0;i<3;i++)await make('Pending Approval');const raw=await make('Queued');await query('UPDATE echolink.articles SET caption=NULL,caption_hash=NULL,approval_hash=NULL WHERE id=$1',[raw]);
  assert.match((await processQueue({pageId,articleId:raw})).pages[0].queued,/Review queue has 3 drafts/);assert.equal(calls.length,before);
  console.log('PASS delivery on disposable DB: Publish Now → photo post → durable 5-minute source comment → exactly-once comment; spacing gate; persistent rate cooldown; credential pause/resume; missed-schedule hold; live-mode preview review. Facebook was mocked.');
}finally{globalThis.fetch=originalFetch;await closePools();}
