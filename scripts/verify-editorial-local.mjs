import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {generateFactualCaption} from '../platform/server/caption-generation.mjs';
import {rankStories,shortlistStories,clusterStories} from '../platform/server/news-research.mjs';
import {hasOperationalCopy} from '../platform/server/public-copy.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const paused=[],held=[],results=[];
try{
 const samples=await transaction(null,async db=>{
  const pages=(await db.query("SELECT p.* FROM creator.pages p JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND p.kind IN ('ecommerce','news') ORDER BY p.kind",['fabrything@gmail.com'])).rows;
  const samples=[];for(const page of pages){
   const rules=(await db.query('UPDATE creator.automation_rules SET enabled=false WHERE workspace_id=$1 AND page_id=$2 AND enabled RETURNING id,workspace_id',[page.workspace_id,page.id])).rows;paused.push(...rules);
   const queue=(await db.query("SELECT id,not_before FROM creator.tasks WHERE workspace_id=$1 AND page_id=$2 AND kind IN ('generate','aggregate','creative','analyze_references') AND status='queued' FOR UPDATE",[page.workspace_id,page.id])).rows;
   const until=new Date(Date.now()+20*60000);for(const task of queue){await db.query('UPDATE creator.tasks SET not_before=$3 WHERE workspace_id=$1 AND id=$2',[page.workspace_id,task.id,until]);held.push({...task,w:page.workspace_id,until});}
   const post=(await db.query("SELECT * FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND body<>'' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",[page.workspace_id,page.id])).rows[0];
   const product=post.product_id?(await db.query('SELECT * FROM creator.products WHERE workspace_id=$1 AND id=$2',[page.workspace_id,post.product_id])).rows[0]:null;
   const sourcePosts=(await db.query("SELECT title,source_url AS url,body,created_at AS date,seo->>'category' AS category FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND source_url IS NOT NULL ORDER BY created_at DESC LIMIT 8",[page.workspace_id,page.id])).rows;
   samples.push({page,post,product,sourcePosts});
  }return samples;
 },{owner:true});
 const deadline=Date.now()+8*60000;while(true){const running=await transaction(null,async db=>(await db.query("SELECT count(*)::int AS n FROM creator.tasks WHERE status='running' AND kind IN ('generate','creative','aggregate','analyze_references')")).rows[0].n,{owner:true});if(!running)break;if(Date.now()>deadline)throw new Error('Active preparation did not finish.');console.log('Waiting for active preparation; publication remains available.');await new Promise(r=>setTimeout(r,15000));}
 for(const sample of samples){
  console.log('Real local inference: '+sample.page.name+' · '+sample.page.language);const metrics=[],started=Date.now();
  let result;for(let attempt=0;;attempt++){try{result=await generateFactualCaption({...sample,connection:{provider:'ollama',config:{model:'echolink-qwen3:4b',temperature:.6,contextTokens:4096,maxOutputTokens:900}},compact:true},{onMetrics:m=>metrics.push(m),onCorrection:async()=>console.log('Applying one factual/language correction pass.')});break;}catch(error){if(error.code!=='inference_resource_wait'||attempt>=8)throw error;console.log('RAM admission deferred; waiting 20 seconds without loading a model.');await new Promise(r=>setTimeout(r,20000));}}
  const passed=!result.needsCorrection&&!hasOperationalCopy(result.caption)&&result.caption.length>=60;
  results.push({page:sample.page.name,kind:'caption',caption:result.caption,warnings:result.warnings,notes:result.notes,metrics,elapsedSeconds:Math.round((Date.now()-started)/1000),passed});
  console.log(JSON.stringify({page:sample.page.name,passed,warnings:result.warnings,seconds:results.at(-1).elapsedSeconds}));
  if(sample.page.kind==='news'){
   const stories=shortlistStories(clusterStories(sample.sourcePosts.map(p=>({...p,date:new Date().toISOString()}))));
   if(stories.length>1){const ranked=await rankStories(stories,{page:sample.page,connection:{provider:'ollama',config:{model:'echolink-qwen3:4b',temperature:.2,contextTokens:4096}},onMetrics:m=>metrics.push(m)});results.push({page:sample.page.name,kind:'ranking',method:ranked.method,reason:ranked.reason,candidates:stories.length,passed:ranked.method==='model'});console.log(JSON.stringify(results.at(-1)));}
  }
 }
 const folder=new URL('../platform/.local/verification/editorial/',import.meta.url);await mkdir(folder,{recursive:true});await writeFile(new URL('local-model.json',folder),JSON.stringify({at:new Date().toISOString(),passed:results.every(r=>r.passed),realPublicationSubmitted:false,results},null,2));
 console.log(JSON.stringify({passed:results.every(r=>r.passed),cases:results.length,realPublicationSubmitted:false,artifact:'platform/.local/verification/editorial/local-model.json'}));if(results.some(r=>!r.passed))process.exitCode=1;
}finally{
 try{for(const task of held)await transaction(task.w,db=>db.query("UPDATE creator.tasks SET not_before=$3 WHERE workspace_id=$1 AND id=$2 AND status='queued' AND not_before=$4",[task.w,task.id,task.not_before,task.until]));for(const rule of paused)await transaction(rule.workspace_id,db=>db.query('UPDATE creator.automation_rules SET enabled=true WHERE workspace_id=$1 AND id=$2',[rule.workspace_id,rule.id]));console.log('Automatic preparation settings restored; publishing was never paused.');}finally{await closeDatabase();}
}
