import './check-buffer-db.mjs';
import assert from 'node:assert/strict';
import {transaction,closeDatabase} from '../server/db.mjs';
import {tickAutomations,runOne,continuePipeline,resumePreparedPosts} from '../server/jobs.mjs';
import {randomUUID} from 'node:crypto';
if(!process.env.ECHOLINK_BUFFER_TEST_BRANCH?.startsWith('dev-buffer-contact-'))throw new Error('Disposable branch required.');
try{
 const fixture=await transaction(null,async db=>{
  await db.query("UPDATE creator.tasks SET status='canceled' WHERE status IN ('queued','running')");
  const rule=(await db.query('SELECT r.*,p.timezone FROM creator.automation_rules r JOIN creator.pages p ON p.id=r.page_id ORDER BY r.created_at DESC LIMIT 1')).rows[0];
  await db.query('UPDATE creator.posts SET archived_at=now() WHERE workspace_id=$1',[rule.workspace_id]);
  const hour=new Date().getUTCHours(),start=String((hour+2)%24).padStart(2,'0')+':00',end=String((hour+3)%24).padStart(2,'0')+':00';
  await db.query("UPDATE creator.automation_rules SET enabled=true,next_run_at=now(),buffer_hours=168,refill_minutes=60,batch_size=2,backlog_limit=1,generation_window=$2 WHERE id=$1",[rule.id,{enabled:true,start,end,emergency_refill:false}]);return rule;
 },{owner:true});
 assert.equal((await tickAutomations()).queued,0,'Outside overnight hours no new generation is queued.');
 await transaction(fixture.workspace_id,db=>db.query("UPDATE creator.automation_rules SET next_run_at=now(),generation_window=generation_window||'{\"emergency_refill\":true}'::jsonb WHERE id=$1",[fixture.id]));
 assert.equal((await tickAutomations()).queued,1,'Emergency refill respects the pending draft cap.');
 const original=process.env.PLATFORM_INFERENCE_RESERVE_MB;process.env.PLATFORM_INFERENCE_RESERVE_MB='16384';
 try{await runOne({excludePublish:true});}finally{if(original===undefined)delete process.env.PLATFORM_INFERENCE_RESERVE_MB;else process.env.PLATFORM_INFERENCE_RESERVE_MB=original;}
 const task=await transaction(fixture.workspace_id,async db=>(await db.query("SELECT status,phase,not_before>now()+interval '4 minutes' AS deferred FROM creator.tasks WHERE workspace_id=$1 AND status='queued' LIMIT 1",[fixture.workspace_id])).rows[0]);
 assert.equal(task.status,'queued');assert.equal(task.deferred,true);assert.match(task.phase,/Memory/);
 const held=await transaction(fixture.workspace_id,async db=>{
  await db.query('UPDATE creator.pages SET active=true,fb_verified=true,require_review=false WHERE id=$1',[fixture.page_id]);
  await db.query('UPDATE creator.automation_rules SET auto_publish=true,auto_schedule=true WHERE id=$1',[fixture.id]);
  return (await db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title,caption,status,seo) VALUES($1,$2,'original','Factual check fixture','A complete caption with a quantity that needs a source correction.','review',$3) RETURNING id",[fixture.workspace_id,fixture.page_id,{editorialWarnings:['Check numbers absent from the supplied facts: 5']}])).rows[0];
 });
 await continuePipeline({id:randomUUID(),workspace_id:fixture.workspace_id,page_id:fixture.page_id,post_id:held.id,kind:'creative',input:{pipeline:{ruleId:fixture.id}}},{assetId:null});
 const saved=await transaction(fixture.workspace_id,async db=>(await db.query('SELECT status,planned_at,last_error FROM creator.posts WHERE id=$1',[held.id])).rows[0]);assert.equal(saved.status,'review');assert(saved.planned_at);assert.match(saved.last_error,/source check/);assert.equal((await resumePreparedPosts()).scheduled,0);
 console.log(JSON.stringify({overnightGate:true,daytimeRescue:true,lowMemoryDeferral:true,noInferenceRequestMade:true,noPublicationSubmitted:true}));
}finally{await closeDatabase();}
