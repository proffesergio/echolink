import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
try{
 await transaction(null,async db=>{
  const deadline=Date.now()+8*60000;let lastNotice=0;
  while(true){
   // Lock pending work while running preparation/delivery finishes. The worker
   // uses SKIP LOCKED, so it cannot start another queued task during this drain.
   await db.query("SELECT id FROM creator.tasks WHERE status='queued' FOR UPDATE SKIP LOCKED");
   const {count}=(await db.query("SELECT count(*)::int AS count FROM creator.tasks WHERE status='running'")).rows[0];
   if(!count)break;if(Date.now()>deadline)throw new Error('Active work did not finish. No service was stopped.');
   if(Date.now()-lastNotice>20000){console.log('Waiting for '+count+' active task(s); pending work is held safely.');lastNotice=Date.now();}
   await new Promise(r=>setTimeout(r,1500));
  }
  const code=await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-File','scripts/start-platform.ps1'],{cwd:root,windowsHide:true,stdio:'ignore'});child.on('error',reject);child.on('exit',resolve);});
  if(code!==0)throw new Error('Worker restart failed.');
 },{owner:true});
 console.log('Pending work released to the updated supervisor.');
}finally{await closeDatabase();}
