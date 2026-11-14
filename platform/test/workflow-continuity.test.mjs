import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {catalogRefreshDue,catalogDailyRemaining,planningTick,actionableBacklogSQL,catalogCandidatesSQL,catalogAllocatedSQL} from '../server/automation-planning.mjs';
import {contentListQuery} from '../server/content-list.mjs';
import {contentCount} from '../client/content-status-counts.mjs';
import {scopeState} from '../client/scope.mjs';

test('daily catalog checks have independent retry cooldowns and respect paused rules',()=>{
 const now=new Date('2026-11-14T10:00:00Z'),page={kind:'ecommerce',website_id:'store'},rule={enabled:true};
 assert.equal(catalogRefreshDue(rule,page,now),true);
 assert.equal(catalogRefreshDue({...rule,catalog_checked_at:'2026-11-14T09:00:00Z'},page,now),false);
 assert.equal(catalogRefreshDue({...rule,catalog_checked_at:'2026-11-13T09:00:00Z'},page,now),true);
 assert.equal(catalogRefreshDue({...rule,catalog_refresh_after:'2026-11-14T10:30:00Z'},page,now),false);
 assert.equal(catalogRefreshDue({...rule,enabled:false},page,now),false);
 assert.equal(catalogRefreshDue(rule,{...page,kind:'news'},now),false);
 assert.equal(catalogDailyRemaining({daily_target:50},{daily_cap:50},49),1);
 assert.equal(catalogDailyRemaining({daily_target:50},{daily_cap:50},50),0);
 assert.equal(catalogDailyRemaining({daily_target:50},{daily_cap:30},29),1);
});

test('independent planning is bounded, non-overlapping and recovers after failure',async()=>{
 let now=0,release,calls=0,fail=false;
 const tick=planningTick({now:()=>now,recover:async()=>{calls++;if(fail)throw Error('offline');},resume:async()=>{},automations:()=>new Promise(resolve=>{release=resolve;})});
 const first=tick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await tick(),false);assert.equal(calls,1);release();assert.equal(await first,true);
 now=59999;assert.equal(await tick(),false);now=60000;fail=true;await assert.rejects(tick(),/offline/);
 fail=false;const next=tick();await new Promise(resolve=>setImmediate(resolve));release();assert.equal(await next,true);assert.equal(calls,3);
});

test('semantic tab totals stay distinct and profile scoped, including explicit zeroes',()=>{
 const state={editorialCounts:{review:11,attention:40,preparing:0},posts:[],pages:[{id:'page',kind:'creator'}],websites:[],connections:[],feeds:[],products:[],tasks:[],automation_rules:[],campaigns:[],pageEditorialCounts:[{page_id:'page',review:2,attention:3,preparing:1}]};
 assert.equal(contentCount(state,'review'),11);assert.equal(contentCount(state,'attention'),40);assert.equal(contentCount(state,'preparing'),0);
 const scoped=scopeState(state,'page');assert.equal(contentCount(scoped,'review'),2);assert.equal(contentCount(scoped,'attention'),3);assert.equal(contentCount(scoped,'preparing'),1);
});

test('migration, status filters and product cohorts against disposable PostgreSQL',{skip:!process.env.PGLITE_MODULE},async t=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();
 try {
  await db.exec('CREATE ROLE creator_runtime; CREATE ROLE creator_relay;');
  for(const file of (await readdir(new URL('../sql/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../sql/'+file,import.meta.url),'utf8'));
  const account=(await db.query("INSERT INTO creator.accounts(auth_subject,email,name) VALUES('continuity','continuity@example.invalid','Fixture') RETURNING id")).rows[0].id;
  const w=(await db.query("INSERT INTO creator.workspaces(name,owner_id) VALUES('Isolated',$1) RETURNING id",[account])).rows[0].id;
  const page=(await db.query("INSERT INTO creator.pages(workspace_id,name,niche,kind) VALUES($1,'Commerce','Fixture','ecommerce') RETURNING id",[w])).rows[0].id;
  const other=(await db.query("INSERT INTO creator.pages(workspace_id,name,niche,kind) VALUES($1,'Other','Fixture','creator') RETURNING id",[w])).rows[0].id;
  const add=async(status,{error=null,seo={},pageId=page,product=null}={})=>(await db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title,status,last_error,seo,product_id) VALUES($1,$2,'original','Isolated fixture',$3,$4,$5,$6) RETURNING id",[w,pageId,status,error,seo,product])).rows[0].id;
  await t.test('old holds cannot fill an automatic queue; clean approval work remains bounded',async()=>{
   await add('review',{error:'Source needs correction'});await add('draft',{seo:{editorialWarnings:['Unsupported quantity']}});await add('review');await add('draft');await add('scheduled');await add('review',{pageId:other});
   assert.equal((await db.query(actionableBacklogSQL,[w,page,true])).rows[0].count,2);
  });
  await t.test('retry moves an errored draft into Preparing, then returns it to attention; lists equal counts',async()=>{
   const id=await add('draft',{error:'Prior failure'});
   const task=(await db.query("INSERT INTO creator.tasks(workspace_id,page_id,post_id,kind) VALUES($1,$2,$3,'generate') RETURNING id",[w,page,id])).rows[0].id;
   assert.equal((await db.query('SELECT content_status FROM creator.posts WHERE id=$1',[id])).rows[0].content_status,'PREPARING');
   assert.equal((await db.query(actionableBacklogSQL,[w,page,true])).rows[0].count,3);
   for(const status of ['review','attention','preparing']){
    const q=contentListQuery(new URLSearchParams({page,status}));const rows=(await db.query('SELECT id FROM creator.posts WHERE '+q.where,[w,...q.values])).rows;
    const total=(await db.query('SELECT count(*)::int AS count FROM creator.posts WHERE '+q.where,[w,...q.values])).rows[0].count;
    assert.equal(rows.length,total);if(status==='preparing')assert.deepEqual(rows.map(r=>r.id),[id]);
   }
   await db.query("UPDATE creator.tasks SET status='failed' WHERE id=$1",[task]);
   assert.equal((await db.query('SELECT content_status FROM creator.posts WHERE id=$1',[id])).rows[0].content_status,'NEED_ATTENTION');
   await db.query("UPDATE creator.posts SET status='unknown',fb_post_id='receipt-to-preserve' WHERE id=$1",[id]);
   await db.query("UPDATE creator.tasks SET status='queued' WHERE id=$1",[task]);
   assert.deepEqual((await db.query('SELECT status,content_status,fb_post_id FROM creator.posts WHERE id=$1',[id])).rows[0],{status:'unknown',content_status:'NEED_ATTENTION',fb_post_id:'receipt-to-preserve'});
   const failed=await add('failed',{error:'Prior creative failure'});
   await db.query("INSERT INTO creator.tasks(workspace_id,page_id,post_id,kind) VALUES($1,$2,$3,'creative')",[w,page,failed]);
   assert.equal((await db.query(actionableBacklogSQL,[w,page,true])).rows[0].count,3);
  });
  await t.test('daily cohort stops at50 even when all are held; catalog history prevents repeat selection',async()=>{
   const site=(await db.query("INSERT INTO creator.websites(workspace_id,name,url,kind,connector) VALUES($1,'Store','https://example.invalid','ecommerce','json_catalog') RETURNING id",[w])).rows[0].id;
   const product=(await db.query("INSERT INTO creator.products(workspace_id,website_id,external_id,title,url) VALUES($1,$2,'one','Fixture product','https://example.invalid/one') RETURNING id",[w,site])).rows[0].id;
   await add('failed',{product,error:'Held',seo:{catalogBatch:{day:'2026-11-14'}}});
   assert.equal((await db.query(catalogCandidatesSQL,[w,site,page])).rows.length,0);
   assert.equal((await db.query(catalogCandidatesSQL,[w,site,other])).rows.length,1);
   for(let i=1;i<50;i++)await add('draft',{error:'Held',seo:{catalogBatch:{day:'2026-11-14'}}});
   await add('draft',{seo:{catalogBatch:{day:'2026-11-13'}}});
   const allocated=(await db.query(catalogAllocatedSQL,[w,page,'2026-11-14'])).rows[0].count;
   assert.equal(allocated,50);assert.equal(catalogDailyRemaining({daily_target:50},{daily_cap:50},allocated),0);
  });
 }finally {await db.close();}
});
