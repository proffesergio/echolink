import '../src/env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {query,closePools} from '../src/db.mjs';
import {hash} from '../src/core.mjs';
import {editDraft} from '../src/newsroom-actions.mjs';
import {processQueue} from '../src/jobs.mjs';
import {runJob} from '../src/telemetry.mjs';
if(!process.env.ECHOLINK_TEST_BRANCH)throw new Error('Only run on a disposable validation branch');
process.env.DRY_RUN='true';
try{
  const pageId='recNewsroomProbe',id=randomUUID();
  const page={id:pageId,name:'Newsroom probe',active:true,timezone:'Asia/Dhaka',start:'00:00',end:'00:00',dailyMax:1,minimumGap:30,approval:true};
  await query("INSERT INTO echolink.configurations(kind,id,config) VALUES('page',$1,$2)",[pageId,JSON.stringify(page)]);
  await query("INSERT INTO echolink.articles(id,page_id,url_hash,title_hash,title,source_url,body,caption,caption_hash,approval_hash,status,source_published_at) VALUES($1,$2,$3,$3,'Probe','https://example.com/probe','Probe article text',$4,$5,$5,'Approved',now())",[id,pageId,randomUUID(),'Original caption',hash('Original caption')]);
  const at=new Date(Date.now()+86400000).toISOString();
  await editDraft(id,{caption:'Edited caption',imageURL:'',scheduledAt:at});
  const row=(await query('SELECT status,caption,approval_hash,scheduled_at FROM echolink.articles WHERE id=$1',[id])).rows[0];
  assert.equal(row.status,'Pending Approval');assert.equal(row.approval_hash,null);assert.equal(row.caption,'Edited caption');assert.equal(row.scheduled_at.toISOString(),at);
  await assert.rejects(editDraft(id,{scheduledAt:'2020-01-01'}));
  await query("UPDATE echolink.articles SET status='Approved',approval_hash=caption_hash WHERE id=$1",[id]);
  const result=await processQueue({pageId});assert.equal(result.pages[0].empty,true);
  await query("UPDATE echolink.articles SET status='Posted' WHERE id=$1",[id]);
  await assert.rejects(editDraft(id,{caption:'Cannot edit a published post'}));
  await runJob('probe',async()=>({blocked:true,reason:'Expected test blocker'}),'test');
  assert.equal((await query("SELECT status FROM echolink.job_runs WHERE job='probe'")).rows[0].status,'Blocked');
  console.log('PASS newsroom: edits revoke approval, schedules persist, future approved posts cannot run early, published posts cannot be edited, blocked jobs are visible.');
}finally{await closePools();}
