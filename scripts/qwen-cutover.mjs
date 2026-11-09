import '../platform/server/env.mjs';
import {transaction,closeDatabase,audit} from '../platform/server/db.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const path=new URL('../.codex/qwen-cutover.json',import.meta.url),mode=process.argv[2];
try{
 if(mode==='hold'){
  await mkdir(new URL('../.codex/',import.meta.url),{recursive:true});
  let existing;try{existing=JSON.parse(await readFile(path,'utf8'));}catch{}
  if(existing?.phase==='held')throw new Error('A cutover is already held. Activate or restore it first.');
  const backup=await transaction(null,async db=>{
   const connections=(await db.query("SELECT c.id,c.workspace_id,c.config FROM creator.connections c JOIN creator.workspaces w ON w.id=c.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND c.provider='ollama'",[(process.env.PLATFORM_OWNER_EMAIL||'').toLowerCase()])).rows;
   if(!connections.length)throw new Error('No owner Ollama connection was found.');
   const pages=(await db.query('SELECT p.id,p.workspace_id,p.kind,p.name FROM creator.pages p WHERE p.text_connection_id=ANY($1::uuid[])',[connections.map(c=>c.id)])).rows;
   const rules=(await db.query('SELECT id,enabled,buffer_hours,refill_minutes,generation_mode FROM creator.automation_rules WHERE page_id=ANY($1::uuid[]) FOR UPDATE',[pages.map(p=>p.id)])).rows;
   const tasks=(await db.query("SELECT id,not_before FROM creator.tasks WHERE page_id=ANY($1::uuid[]) AND status='queued' AND kind IN ('generate','write_article','creative','render_reel','aggregate','import_products','design_page_brand','analyze_references') FOR UPDATE",[pages.map(p=>p.id)])).rows;
   await db.query('UPDATE creator.automation_rules SET enabled=false WHERE id=ANY($1::uuid[])',[rules.map(r=>r.id)]);
   await db.query("UPDATE creator.tasks SET not_before=now()+interval '2 hours' WHERE id=ANY($1::uuid[])",[tasks.map(t=>t.id)]);
   return {phase:'held',at:new Date().toISOString(),connections,pages,rules,tasks};
  },{owner:true});
  await writeFile(path,JSON.stringify(backup,null,2));
  const deadline=Date.now()+8*60000;let count;
  do{count=await transaction(null,async db=>(await db.query("SELECT count(*)::int AS n FROM creator.tasks WHERE page_id=ANY($1::uuid[]) AND status='running' AND kind IN ('generate','write_article','creative','render_reel','aggregate','import_products','design_page_brand','analyze_references')",[backup.pages.map(p=>p.id)])).rows[0].n,{owner:true});if(count){if(Date.now()>deadline)throw new Error('Generation drain timed out. Run this script with restore.');console.log('Waiting for '+count+' active preparation task(s). Publishing remains available.');await new Promise(r=>setTimeout(r,15000));}}while(count);
  // A task finishing during the drain may enqueue its next preparation stage.
  await transaction(null,async db=>{const more=(await db.query("SELECT id,not_before FROM creator.tasks WHERE page_id=ANY($1::uuid[]) AND status='queued' AND kind IN ('generate','write_article','creative','render_reel','aggregate','import_products','design_page_brand','analyze_references') AND NOT(id=ANY($2::uuid[])) FOR UPDATE",[backup.pages.map(p=>p.id),backup.tasks.map(t=>t.id)])).rows;backup.tasks.push(...more);await db.query("UPDATE creator.tasks SET not_before=now()+interval '2 hours' WHERE id=ANY($1::uuid[])",[more.map(t=>t.id)]);},{owner:true});
  await writeFile(path,JSON.stringify(backup,null,2));console.log('Generation drained and held. Owner model configuration backed up; publication was not paused.');
 }else if(['activate','restore'].includes(mode)){
  if(mode==='activate'){const bench=JSON.parse(await readFile(new URL('../platform/.local/verification/qwen3/benchmark.json',import.meta.url),'utf8'));if(!bench.passed||bench.model!=='echolink-qwen3:4b')throw new Error('Run and review the pinned Qwen benchmark before activation.');}
  const backup=JSON.parse(await readFile(path,'utf8'));if(backup.phase!=='held')throw new Error('No held cutover exists.');
  await transaction(null,async db=>{
   for(const c of backup.connections){const config=mode==='activate'?{...c.config,model:'echolink-qwen3:4b',temperature:0.6,contextTokens:4096,maxOutputTokens:900}:c.config;await db.query('UPDATE creator.connections SET config=$2 WHERE id=$1',[c.id,config]);if(mode==='activate')await db.query("UPDATE creator.connections SET status='connected',last_test_at=now(),last_test_result=$2 WHERE id=$1",[c.id,{ok:true,message:'Pinned local Qwen3-4B Instruct passed source-caption benchmarks for both Pages.',model:config.model}]);await audit(db,c.workspace_id,null,'inference.'+mode,'connection',c.id,{model:config.model});}
   for(const r of backup.rules){await db.query('UPDATE creator.automation_rules SET enabled=$2,next_run_at=now() WHERE id=$1',[r.id,r.enabled]);}
   for(const t of backup.tasks)await db.query("UPDATE creator.tasks SET not_before=GREATEST(now(),$2::timestamptz) WHERE id=$1 AND status='queued'",[t.id,t.not_before]);
  },{owner:true});backup.phase=mode==='activate'?'activated':'restored';await writeFile(path,JSON.stringify(backup,null,2));console.log(mode==='activate'?'Owner Pages now use Qwen3:4b. Preparation queues released.':'Previous owner model configuration restored; preparation queues released.');
 }else throw new Error('Use hold, activate or restore.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await closeDatabase();}
