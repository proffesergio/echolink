import '../server/env.mjs';
import {transaction,closeDatabase} from '../server/db.mjs';
import {enqueue} from '../server/jobs.mjs';
if(process.env.PLATFORM_BRANCH!=='echolink-platform-local'||process.env.PLATFORM_PUBLISHING_ENABLED==='true')throw new Error('Prepare this sample only in the isolated local build with live publishing disabled.');
const owner=(await transaction(null,db=>db.query("SELECT a.id,w.id AS workspace_id FROM creator.accounts a JOIN creator.workspaces w ON w.owner_id=a.id WHERE lower(a.email)=lower($1) AND a.role='super_admin' AND a.email_verified",[process.env.PLATFORM_OWNER_EMAIL]),{owner:true})).rows[0];if(!owner)throw new Error('Verified owner sign-in required.');const w=owner.workspace_id;
const page=(await transaction(w,db=>db.query("SELECT * FROM creator.pages WHERE workspace_id=$1 AND kind='news' ORDER BY created_at LIMIT 1",[w]))).rows[0];if(!page)throw new Error('Import the owner news Page first.');
async function complete(task){
 let last='';const deadline=Date.now()+12*60000;
 while(Date.now()<deadline){const current=(await transaction(w,db=>db.query('SELECT status,progress,phase,result,last_error FROM creator.tasks WHERE workspace_id=$1 AND id=$2',[w,task.id]))).rows[0];const message=current.progress+'% · '+current.phase;if(message!==last){console.log(message);last=message;}if(current.status==='succeeded')return current.result;if(['failed','blocked','unknown','canceled'].includes(current.status))throw new Error(current.last_error||current.phase);await new Promise(resolve=>setTimeout(resolve,2500));}
 throw new Error('The queued task is still being observed in Dashboard Activity. Do not submit a duplicate; inspect its status.');
}
try{
 const story=await complete(await transaction(w,db=>enqueue(db,w,'aggregate',{pageId:page.id})));if(!story.postId)throw new Error(story.message);
 await complete(await transaction(w,db=>enqueue(db,w,'generate',{pageId:page.id,postId:story.postId})));
 await complete(await transaction(w,db=>enqueue(db,w,'creative',{pageId:page.id,postId:story.postId})));
 const post=(await transaction(w,db=>db.query('SELECT id,title,status,creative,seo FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,story.postId]))).rows[0];console.log(JSON.stringify({reviewPost:post.id,title:post.title,status:post.status,photoCreated:!!post.creative.assetId,warnings:post.seo.editorialWarnings||[],published:false}));
}finally{await closeDatabase();}
