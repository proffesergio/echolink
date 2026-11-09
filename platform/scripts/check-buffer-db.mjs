import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {transaction,closeDatabase} from '../server/db.mjs';
import {tickAutomations,runOne} from '../server/jobs.mjs';
import {saveInquiry,submitContact} from '../server/contact.mjs';
if(!process.env.ECHOLINK_BUFFER_TEST_BRANCH?.startsWith('dev-buffer-contact-'))throw new Error('Use the disposable buffer verification branch.');
try{
 const fixture=await transaction(null,async db=>{
  await db.query('UPDATE creator.automation_rules SET enabled=false');
  await db.query("UPDATE creator.tasks SET status='canceled' WHERE status IN ('queued','running')");
  const account=(await db.query("INSERT INTO creator.accounts(auth_subject,email,name,email_verified) VALUES($1,$2,'Buffer fixture',true) RETURNING id",[randomUUID(),randomUUID()+'@example.com'])).rows[0];
  const workspace=(await db.query("INSERT INTO creator.workspaces(name,owner_id,onboarded) VALUES('Buffer verification',$1,true) RETURNING id",[account.id])).rows[0];
  await db.query("INSERT INTO creator.subscriptions(workspace_id,plan_id,status,period_end) VALUES($1,'agency','active',now()+interval '30 days')",[workspace.id]);
  const page=(await db.query("INSERT INTO creator.pages(workspace_id,name,niche,kind,timezone,window_start,window_end,daily_cap,gap_minutes,creative_policy) VALUES($1,'Buffer Page','Education','creator','UTC','00:00','00:00',100,5,'{\"scheduleMode\":\"interval\"}') RETURNING id",[workspace.id])).rows[0];
  const rule=(await db.query("INSERT INTO creator.automation_rules(workspace_id,page_id,name,enabled,topic,batch_size,backlog_limit,daily_target,generation_mode,buffer_hours,refill_minutes) VALUES($1,$2,'Buffer rule',true,'Verified fixture facts',3,50,100,'buffered',2,45) RETURNING id",[workspace.id,page.id])).rows[0];
  for(let i=0;i<24;i++)await db.query("INSERT INTO creator.posts(workspace_id,page_id,type,title,caption,status,scheduled_at) VALUES($1,$2,'original','Scheduled fixture','Prepared fixture caption','scheduled',date_trunc('minute',now())+interval '2 minutes'+interval '5 minutes'*$3)",[workspace.id,page.id,i]);
  return {w:workspace.id,page:page.id,rule:rule.id};
 },{owner:true});
 assert.equal((await tickAutomations()).queued,0,'A full buffer must not generate.');
 await transaction(fixture.w,async db=>{await db.query('DELETE FROM creator.posts WHERE workspace_id=$1 AND page_id=$2',[fixture.w,fixture.page]);await db.query('UPDATE creator.automation_rules SET next_run_at=now() WHERE id=$1',[fixture.rule]);});
 const concurrent=await Promise.all([tickAutomations(),tickAutomations()]);assert.equal(concurrent.reduce((n,r)=>n+r.queued,0),3,'Concurrent checks should queue one bounded batch.');
 await transaction(fixture.w,db=>db.query('UPDATE creator.automation_rules SET next_run_at=now() WHERE id=$1',[fixture.rule]));assert.equal((await tickAutomations()).queued,0,'Pending generation must block duplicate refills.');
 const state=await transaction(fixture.w,async db=>({tasks:(await db.query('SELECT count(*)::int AS count FROM creator.tasks WHERE workspace_id=$1',[fixture.w])).rows[0].count,rule:(await db.query('SELECT refill_until FROM creator.automation_rules WHERE id=$1',[fixture.rule])).rows[0]}));assert.equal(state.tasks,3);assert(state.rule.refill_until);
 await runOne({excludePublish:true}); // Fixture has no model connection: fail before any provider request.
 const cooled=await transaction(fixture.w,async db=>(await db.query("SELECT refill_until,next_run_at>now()+interval '14 minutes' AS cooling FROM creator.automation_rules WHERE id=$1",[fixture.rule])).rows[0]);assert.equal(cooled.refill_until,null);assert.equal(cooled.cooling,true);
 const body={name:'Migration fixture',email:randomUUID()+'@example.com',company:'Fixture',topic:'Demo & onboarding',message:'This is a disposable branch-only contact verification.',consent:true,website:''};let notifications=0;
 const result=await submitContact(body,{notify:async()=>{notifications++;return false;}});assert(result.id);await submitContact(body,{notify:async()=>{notifications++;return false;}});assert.equal(notifications,1);
 const invisible=await transaction(fixture.w,async db=>(await db.query('SELECT id FROM creator.contact_inquiries WHERE id=$1',[result.id])).rowCount);assert.equal(invisible,0,'Tenant runtime must not see the owner inbox.');
 const visible=await transaction(null,async db=>(await db.query('SELECT id FROM creator.contact_inquiries WHERE id=$1',[result.id])).rowCount,{owner:true});assert.equal(visible,1);
 const limited={...body,email:randomUUID()+'@example.com'};for(let i=0;i<3;i++)await saveInquiry({...limited,message:limited.message+' '+i},randomUUID());await assert.rejects(()=>saveInquiry(limited,randomUUID()),e=>e.status===429);
 console.log(JSON.stringify({branchMigration:true,fullBufferSleeps:true,boundedRefill:true,concurrentRefillGuard:true,failureCooldown:true,contactStored:true,contactDuplicateSuppressed:true,contactRateLimit:true,ownerInboxTenantIsolation:true,externalMessagesSent:0,realPublicationSubmitted:false}));
}finally{await closeDatabase();}
