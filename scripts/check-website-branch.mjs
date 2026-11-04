import '../src/env.mjs';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {query,closePools} from '../src/db.mjs';
import {hash} from '../src/core.mjs';
import {processQueue,comments} from '../src/jobs.mjs';
import {publishWebsite,closeWebsitePool} from '../src/website.mjs';
if(!process.env.ECHOLINK_TEST_BRANCH)throw new Error('A disposable branch is required');
// Never use the production website credential inherited from the local env.
process.env.NOBLESEEK_DATABASE_URL=process.env.DATABASE_URL;
Object.assign(process.env,{NOBLESEEK_ENABLED:'true',NOBLESEEK_REQUIRE_BEFORE_FACEBOOK:'true',NOBLESEEK_DATABASE_SCHEMA:'website_probe',NOBLESEEK_FACEBOOK_PAGE_IDS:'123',NOBLESEEK_CATEGORY_ID:'',FB_AUTOMATIC_LINKS_ENABLED:'false',DRY_RUN:'false',META_GRAPH_VERSION:'v26.0',FB_TOKENS_JSON:'{"websiteProbe":"fake-token"}'});
const page={id:'recWebsiteProbe',active:true,fbPageId:'123',fbSecret:'websiteProbe',timezone:'Asia/Dhaka',start:'00:00',end:'00:00',dailyMax:20,minimumGap:1,approval:true,commentDelay:5};
const fetchOriginal=globalThis.fetch,events=[];let publicFailure=false,identity='123';
globalThis.fetch=async(url,options)=>{
  const u=new URL(url);
  if(u.hostname==='graph.facebook.com'){
    if(u.pathname.endsWith('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',scopes:['pages_read_engagement','pages_manage_posts','pages_manage_engagement']}});
    if(u.pathname.endsWith('/me'))return Response.json({id:identity,name:'Probe'});
    events.push({type:'facebook',payload:JSON.parse(options.body)});return Response.json({id:identity+'_probe',post_id:identity+'_probe'});
  }
  if(u.hostname==='fabrythingapi.vercel.app'){
    if(publicFailure)return Response.json({error:'Unreachable'},{status:503});
    const slug=decodeURIComponent(u.pathname.split('/').filter(Boolean).at(-1));
    const row=(await query('SELECT * FROM website_probe.nobleseek_article WHERE slug=$1',[slug])).rows[0];
    events.push({type:'website-confirmed'});return Response.json({data:row});
  }
  throw new Error('External requests disabled in website delivery test');
};
const make=async(caption='একটি পর্যালোচিত সংবাদ। #বাংলাদেশ',pageId=page.id)=>{
  const id=randomUUID();await query("INSERT INTO echolink.articles(id,page_id,url_hash,title_hash,title,source_url,body,caption,caption_hash,approval_hash,image_url,status,source_published_at) VALUES($1,$2,$3,$3,'Website delivery probe','https://example.com/story','Source body',$4,$5,$5,'https://example.com/photo.jpg','Approved',now())",[id,pageId,id,caption,hash(caption)]);
  return (await query('SELECT * FROM echolink.articles WHERE id=$1',[id])).rows[0];
};
try{
  await query(await readFile(new URL('../test/fixtures/nobleseek.sql',import.meta.url),'utf8'));
  await query("INSERT INTO echolink.configurations(kind,id,config) VALUES('page',$1,$2)",[page.id,JSON.stringify(page)]);
  const first=await make();assert.equal((await processQueue({pageId:page.id,articleId:first.id})).pages[0].posted,first.id);
  assert.deepEqual(events.map(e=>e.type),['website-confirmed','facebook']);
  const posted=(await query('SELECT * FROM echolink.articles WHERE id=$1',[first.id])).rows[0];
  assert.equal(posted.website_status,'Published');assert.match(posted.website_url,/https:\/\/www.fabrything.com\/nobleseek\/echolink-/);
  assert.equal(events[1].payload.url,first.image_url);assert.equal(events[1].payload.caption,first.caption);
  assert.equal((await query('SELECT status FROM echolink.source_comments WHERE article_id=$1',[first.id])).rows[0].status,'Skipped');
  assert.equal((await comments()).sent,0);assert.equal(events.length,2);
  const before=(await query('SELECT id,published_at FROM website_probe.nobleseek_article')).rows[0];
  await query('UPDATE website_probe.nobleseek_article SET view_count=7');
  const retry=await publishWebsite(page,posted);assert.equal(retry.website_post_id,String(before.id));
  assert.equal((await query('SELECT count(*)::int AS n FROM website_probe.nobleseek_article')).rows[0].n,1);
  const after=(await query('SELECT view_count,published_at FROM website_probe.nobleseek_article')).rows[0];assert.equal(after.view_count,7);assert.equal(+after.published_at,+before.published_at);
  await query("UPDATE echolink.articles SET status='Draft' WHERE id=$1",[first.id]);
  const failure=await make();publicFailure=true;const writes=events.filter(e=>e.type==='facebook').length;
  await processQueue({pageId:page.id,articleId:failure.id});
  const held=(await query('SELECT status,website_status FROM echolink.articles WHERE id=$1',[failure.id])).rows[0];assert.equal(held.status,'Approved');assert.equal(held.website_status,'Unknown');assert.equal(events.filter(e=>e.type==='facebook').length,writes);
  publicFailure=false;await query('UPDATE echolink.articles SET next_attempt_at=now() WHERE id=$1',[failure.id]);
  assert.equal((await processQueue({pageId:page.id,articleId:failure.id})).pages[0].posted,failure.id);
  assert.equal((await query('SELECT count(*)::int AS n FROM website_probe.nobleseek_article')).rows[0].n,2);
  await query("UPDATE echolink.articles SET status='Draft' WHERE page_id=$1",[page.id]);
  const dry=await make();process.env.DRY_RUN='true';await processQueue({pageId:page.id,articleId:dry.id});assert.equal((await query('SELECT count(*)::int AS n FROM website_probe.nobleseek_article')).rows[0].n,2);
  process.env.DRY_RUN='false';process.env.NOBLESEEK_REQUIRE_BEFORE_FACEBOOK='false';publicFailure=true;
  const optional=await make();assert.equal((await processQueue({pageId:page.id,articleId:optional.id})).pages[0].posted,optional.id);
  assert.equal((await query('SELECT website_status FROM echolink.articles WHERE id=$1',[optional.id])).rows[0].website_status,'Unknown');
  const other={...page,id:'recFacebookOnlyProbe',fbPageId:'456'};identity='456';
  await query("INSERT INTO echolink.configurations(kind,id,config) VALUES('page',$1,$2)",[other.id,JSON.stringify(other)]);
  process.env.NOBLESEEK_DATABASE_URL='invalid-website-connection';process.env.NOBLESEEK_REQUIRE_BEFORE_FACEBOOK='true';
  const facebookOnly=await make(undefined,other.id),beforeOther=(await query('SELECT count(*)::int AS n FROM website_probe.nobleseek_article')).rows[0].n;
  assert.equal((await processQueue({pageId:other.id,articleId:facebookOnly.id})).pages[0].posted,facebookOnly.id);
  assert.equal((await query('SELECT count(*)::int AS n FROM website_probe.nobleseek_article')).rows[0].n,beforeOther);
  console.log('PASS website delivery on disposable DB: website-first photo publishing; exact reviewed caption; required public confirmation holds Facebook; optional website failure permits Facebook; a second Facebook-only Page works even with an invalid website connection; stable slug retries reuse one record and preserve publication time/views; automatic comments skipped; dry-run makes no website writes. Remote APIs were mocked.');
}finally{globalThis.fetch=fetchOriginal;await closeWebsitePool();await closePools();}
