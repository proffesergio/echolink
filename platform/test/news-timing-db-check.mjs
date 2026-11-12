import assert from 'node:assert/strict';
import {transaction} from '../server/db.mjs';
import {tickAutomations,runOne,resumePreparedPosts,continuePipeline} from '../server/jobs.mjs';
import {reviewedNewsHash,CONTEXT_BRIEF_LIMITS} from '../server/news-quality.mjs';
export async function verifyLiveNewsTiming({workspaceId}){
 const fixture=await transaction(workspaceId,async db=>{
  const page=(await db.query("INSERT INTO creator.pages(workspace_id,name,niche,kind,aggregation_enabled,fb_verified,active,require_review,timezone,daily_cap,gap_minutes,window_start,window_end,creative_policy) VALUES($1,'Live news fixture','News','news',true,true,true,false,'Asia/Dhaka',70,7,'00:00','00:00','{\"scheduleMode\":\"spread\",\"contentFormat\":\"news_desk_v3\"}') RETURNING *",[workspaceId])).rows[0];
  const rule=(await db.query("INSERT INTO creator.automation_rules(workspace_id,page_id,name,enabled,daily_target,backlog_limit,batch_size,auto_publish,auto_schedule,generation_mode,generation_window,next_run_at) VALUES($1,$2,'Live news timing',true,70,1,3,true,true,'buffered','{\"enabled\":true,\"start\":\"22:00\",\"end\":\"07:00\"}',now()) RETURNING *",[workspaceId,page.id])).rows[0];
  const seo={research:{sources:[{url:'https://example.com/old',publishedAt:new Date(Date.now()-2*86400000).toISOString()}]},rebuildReport:true};
  const old=(await db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title,source_url,status,last_error,seo) VALUES($1,$2,'news','Preserved old source','https://example.com/old','draft','Old factual hold',$3) RETURNING *",[workspaceId,page.id,seo])).rows[0];
  return {page,rule,old};
 });
 const prior=process.env.PLATFORM_PUBLISHING_ENABLED;process.env.PLATFORM_PUBLISHING_ENABLED='true';
 try{
  assert.equal((await tickAutomations()).queued,1,'held draft cannot fill the live-news backlog; old batch size3 queues only one aggregation');
  await transaction(workspaceId,db=>db.query('UPDATE creator.automation_rules SET next_run_at=now() WHERE id=$1',[fixture.rule.id]));
  assert.equal((await tickAutomations()).queued,0,'pending aggregation prevents duplicate refills');
  const waiting=await transaction(workspaceId,async db=>(await db.query('SELECT next_run_at<now()+interval \'2 minutes\' AS soon FROM creator.automation_rules WHERE id=$1',[fixture.rule.id])).rows[0]);assert(waiting.soon);
  await transaction(workspaceId,db=>db.query("UPDATE creator.tasks SET status='canceled' WHERE workspace_id=$1 AND page_id=$2 AND status='queued'",[workspaceId,fixture.page.id]));
  await resumePreparedPosts();
  const old=await transaction(workspaceId,async db=>(await db.query('SELECT * FROM creator.posts WHERE workspace_id=$1 AND id=$2',[workspaceId,fixture.old.id])).rows[0]);
  assert.equal(old.status,'review');assert.equal(old.seo.rebuildReport,false);assert.match(old.last_error,/24 hours/);assert.equal(old.source_url,fixture.old.source_url);
  const task=await transaction(workspaceId,async db=>(await db.query("INSERT INTO creator.tasks(workspace_id,page_id,post_id,kind,input) VALUES($1,$2,$3,'generate',$4) RETURNING *",[workspaceId,fixture.page.id,old.id,{pipeline:{ruleId:fixture.rule.id}}])).rows[0]);
  await runOne({taskId:task.id});
  const retired=await transaction(workspaceId,async db=>(await db.query('SELECT status,phase FROM creator.tasks WHERE id=$1',[task.id])).rows[0]);assert.equal(retired.status,'canceled');assert.match(retired.phase,/24 hours/);
  const text=Array(2).fill(Array(45).fill('fixture').join(' ')+'.').join('\n\n');
  const article={text,generationVersion:'newsroom-v4',briefMode:CONTEXT_BRIEF_LIMITS.version,briefReview:{supported:true,contextComplete:true,conflictsResolved:true,issues:[]},reviewedSections:1,reviewedTextHash:reviewedNewsHash('Fresh source fixture',text),socialPending:false};
  const fresh=await transaction(workspaceId,async db=>(await db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title,caption,status,planned_at,source_url,seo) VALUES($1,$2,'news','Fresh source fixture','A complete source-supported caption.','review',now()+interval '6 hours','https://example.com/fresh',$3) RETURNING *",[workspaceId,fixture.page.id,{article,research:{sources:[{url:'https://example.com/fresh',publishedAt:new Date().toISOString()}]}}])).rows[0]);
  const start=Date.now();await continuePipeline({workspace_id:workspaceId,page_id:fixture.page.id,post_id:fresh.id,kind:'creative',input:{pipeline:{ruleId:fixture.rule.id}}},{});
  const booked=await transaction(workspaceId,async db=>(await db.query('SELECT status,scheduled_at,approved_version,version FROM creator.posts WHERE id=$1',[fresh.id])).rows[0]);
  assert.equal(booked.status,'scheduled');assert.equal(booked.approved_version,booked.version);assert(+booked.scheduled_at<start+3*60000,'legacy future planned time and spread must not defer fresh news');
  const receipts=await transaction(workspaceId,async db=>(await db.query('SELECT count(*)::int AS n FROM creator.publication_deliveries WHERE workspace_id=$1 AND page_id=$2',[workspaceId,fixture.page.id])).rows[0]);assert.equal(receipts.n,0,'booking never submits a website or social write');
 }finally{
  process.env.PLATFORM_PUBLISHING_ENABLED=prior;
  await transaction(workspaceId,async db=>{await db.query('UPDATE creator.automation_rules SET enabled=false WHERE id=$1',[fixture.rule.id]);await db.query("UPDATE creator.tasks SET status='canceled' WHERE workspace_id=$1 AND page_id=$2 AND status='queued'",[workspaceId,fixture.page.id]);});
 }
}
