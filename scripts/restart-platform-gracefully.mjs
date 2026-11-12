import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {recoverExpiredTasks} from '../platform/server/jobs.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {workspaceLock} from '../platform/server/db.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try{
 await recoverExpiredTasks();
 await transaction(null,async db=>{
  const deadline=Date.now()+20*60000;let lastNotice=0;
  while(true){
   if(process.argv.includes('--recover-preflight')){
    const stalled=(await db.query("SELECT * FROM creator.tasks WHERE status='running' AND kind='publish' AND phase='Checking current product availability and saved campaign facts' AND started_at<now()-interval '15 minutes' FOR UPDATE")).rows;
    for(const task of stalled){
     // Hold the publisher's workspace/post locks through the process restart.
     // A returning catalog read cannot advance to a remote submission meanwhile.
     await workspaceLock(db,task.workspace_id);
     const post=(await db.query('SELECT * FROM creator.posts WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[task.workspace_id,task.post_id])).rows[0];
     const attempts=(await db.query('SELECT 1 FROM creator.publish_attempts WHERE workspace_id=$1 AND task_id=$2 LIMIT 1',[task.workspace_id,task.id])).rowCount;
     const receipts=(await db.query("SELECT 1 FROM creator.publication_deliveries WHERE workspace_id=$1 AND post_id=$2 AND status IN ('running','unknown','confirmed','published') LIMIT 1",[task.workspace_id,task.post_id])).rowCount;
     if(!post||post.status!=='scheduled'||post.website_url||attempts||receipts)throw new Error('Preflight recovery refused: publication may have started; reconcile delivery first.');
     await mkdir(new URL('../.codex/backups/',import.meta.url),{recursive:true});
     await writeFile(new URL('../.codex/backups/stalled-preflight-'+task.id+'-'+Date.now()+'.json',import.meta.url),JSON.stringify({task,post}),{mode:0o600});
     await db.query("UPDATE creator.tasks SET status='queued',not_before=now()+interval '2 minutes',started_at=NULL,lease_until=NULL,phase='Catalog preflight safely requeued before any submission' WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id]);
     console.log('Recovered a stalled read-only catalog preflight; no delivery attempt or active receipt exists.');
    }
   }
   // A long article can take several model calls. Hold new preparation while
   // the current task drains, but keep the independent publisher available.
   await db.query("SELECT id FROM creator.tasks WHERE status='queued' AND kind NOT IN ('publish','manual_handoff','publish_instagram','post_link_comment','apply_page_brand') FOR UPDATE SKIP LOCKED");
   const {count}=(await db.query("SELECT count(*)::int AS count FROM creator.tasks WHERE status='running' AND kind NOT IN ('publish','manual_handoff','publish_instagram','post_link_comment','apply_page_brand')")).rows[0];
   if(!count){
    await db.query('SAVEPOINT delivery_drain');
    await db.query("SELECT id FROM creator.tasks WHERE status='queued' FOR UPDATE SKIP LOCKED");
    const {running,preparing}=(await db.query("SELECT count(*)::int AS running,count(*) FILTER (WHERE kind NOT IN ('publish','manual_handoff','publish_instagram','post_link_comment','apply_page_brand'))::int AS preparing FROM creator.tasks WHERE status='running'")).rows[0];
    if(!running)break;
    // A newly claimed preparation must not hold publisher locks for minutes.
    if(preparing)await db.query('ROLLBACK TO SAVEPOINT delivery_drain');
    await db.query('RELEASE SAVEPOINT delivery_drain');
   }
   if(Date.now()>deadline)throw new Error('Active work did not finish. No service was stopped.');
   if(Date.now()-lastNotice>20000){console.log('Waiting for active work; queued preparation is held and scheduled delivery stays available.');lastNotice=Date.now();}
   await new Promise(r=>setTimeout(r,1500));
  }
  const code=await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-File','scripts/start-platform.ps1'],{cwd:root,windowsHide:true,stdio:'ignore'});child.on('error',reject);child.on('exit',resolve);});
  if(code!==0)throw new Error('Worker restart failed.');
 },{owner:true});
 console.log('Pending work released to the updated supervisor.');
}finally{await closeDatabase();}
