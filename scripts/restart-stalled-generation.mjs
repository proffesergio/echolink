import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {spawn} from 'node:child_process';
// Recovery is limited to old local-only text preparation, never a delivery.
try{await transaction(null,async db=>{
 await db.query("SELECT id FROM creator.tasks WHERE status='queued' FOR UPDATE SKIP LOCKED");
 const active=(await db.query("SELECT t.*,c.provider FROM creator.tasks t JOIN creator.pages p ON p.id=t.page_id LEFT JOIN creator.connections c ON c.id=p.text_connection_id WHERE t.status='running'")).rows;
 if(!active.length)throw new Error('No stalled generation to recover; use the normal graceful restart.');
 if(active.some(t=>t.kind!=='generate'||t.provider!=='ollama'||Date.now()-new Date(t.started_at)<(process.argv.includes('--apply-update')?0:8*60000)))throw new Error('Recovery refused: active work is not exclusively eligible local text generation. No service was stopped.');
 await db.query("UPDATE creator.tasks SET status='queued',not_before=now()+interval '15 seconds',lease_until=NULL,started_at=NULL,phase='Local writing safely requeued after worker upgrade',events=events||$2::jsonb WHERE id=ANY($1::uuid[])",[active.map(t=>t.id),JSON.stringify([{progress:0,phase:'Local writing safely requeued after worker upgrade',at:new Date().toISOString()}])]);
 const code=await new Promise((resolve,reject)=>{const p=spawn('powershell.exe',['-NoProfile','-File','scripts/start-platform.ps1'],{windowsHide:true,stdio:'ignore'});p.on('exit',resolve);p.on('error',reject);});if(code!==0)throw new Error('Worker restart failed.');
 console.log('Stalled local generation requeued; no active publishing task was interrupted.');
},{owner:true});}finally{await closeDatabase();}
