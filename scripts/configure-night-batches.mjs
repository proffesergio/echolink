import '../platform/server/env.mjs';
import {transaction,closeDatabase,audit} from '../platform/server/db.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
try{
 const result=await transaction(null,async db=>{
  const rules=(await db.query("SELECT r.*,p.kind,p.name AS page_name FROM creator.automation_rules r JOIN creator.pages p ON p.id=r.page_id AND p.workspace_id=r.workspace_id JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1",[(process.env.PLATFORM_OWNER_EMAIL||'').toLowerCase()])).rows;
  await mkdir(new URL('../.codex/',import.meta.url),{recursive:true});await writeFile(new URL('../.codex/routines-before-night-batches.json',import.meta.url),JSON.stringify(rules,null,2));
  const configured=[];
  for(const rule of rules){
   const hours=rule.kind==='news'?18:168,window={enabled:true,start:'22:00',end:'07:00',emergency_refill:true};
   await db.query("UPDATE creator.automation_rules SET generation_mode='buffered',buffer_hours=$2,refill_minutes=90,generation_window=$3,batch_size=1,refill_until=NULL,next_run_at=now(),last_message='Overnight batch preparation configured. Daytime rescue protects an empty queue.' WHERE id=$1",[rule.id,hours,window]);
   await audit(db,rule.workspace_id,null,'automation.night_batches','automation_rule',rule.id,{hours,window,batchSize:1});
   configured.push({page:rule.page_name,hours,window,dailyTarget:rule.daily_target});
  }return configured;
 },{owner:true});console.log(JSON.stringify(result));
}finally{await closeDatabase();}
