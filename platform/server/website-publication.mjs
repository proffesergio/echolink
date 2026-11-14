import {transaction,workspaceLock,audit} from './db.mjs';
import {decryptSecret} from './vault.mjs';
import {AppError} from './errors.mjs';
import {publishGate} from './scheduling.mjs';
import {reservePublication} from './quotas.mjs';
import {deliveryState} from './publication-state.mjs';
import {publishJournal} from './journal.mjs';
import {websiteConfigurationProblem} from '../shared/destinations.mjs';

export function websitePublicationFailure(error,{submitted=false,confirmed=false}={}){
 const unknown=confirmed||submitted&&!error.definiteRejection;
 return {unknown,message:confirmed?'The website saved the article; public or local confirmation needs reconciliation. Do not republish.':unknown?'Website delivery needs reconciliation after an interrupted response. Do not republish.':error.status?error.message:'Website publication failed before submission.'};
}
export async function publishWebsiteArticle(task,{updateTask,publish=publishJournal}={}){
 const w=task.workspace_id;
 const state=await transaction(w,async db=>{
  await workspaceLock(db,w);
  const post=(await db.query('SELECT * FROM creator.posts WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[w,task.post_id])).rows[0];
  const page=post&&(await db.query('SELECT * FROM creator.pages WHERE workspace_id=$1 AND id=$2',[w,post.page_id])).rows[0];
  if(!post||!page||page.destination_type!=='website')throw new AppError(409,'This task requires a website-only profile.');
  const problem=websiteConfigurationProblem(page);if(problem)throw new AppError(409,problem);
  if(!['approved','scheduled'].includes(post.status))throw new AppError(409,'Only a reviewed and scheduled article can publish.');
  const account=(await db.query('SELECT a.status FROM creator.workspaces w JOIN creator.accounts a ON a.id=w.owner_id WHERE w.id=$1',[w])).rows[0];
  if(account?.status!=='active')throw new AppError(403,'Workspace owner account is suspended.');
  await publishGate(db,w,page,post,{execution:true});await reservePublication(db,w,post.id);
  const site=(await db.query('SELECT * FROM creator.websites WHERE workspace_id=$1 AND id=$2',[w,page.website_id])).rows[0];
  const c=site&&(await db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=$2',[w,site.connection_id])).rows[0];
  if(site?.connector!=='fabrything_blog'||c?.provider!=='fabrything_blog'||c.status!=='connected')throw new AppError(409,'Test the journal bridge before publishing.');
  await db.query('INSERT INTO creator.publish_attempts(workspace_id,post_id,task_id) VALUES($1,$2,$3)',[w,post.id,task.id]);
  await db.query("UPDATE creator.posts SET status='publishing',updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,post.id]);
  return {post,page,site,connection:{...c,secret:decryptSecret(c.secret_cipher,w)}};
 });
 let submitted=false,confirmed=!!state.post.website_url;
 try{
  await updateTask(task,20,'Website · publishing the reviewed journal article');
  await deliveryState(task,'facebook','skipped',{phase:'Website-only profile; no social submission requested'});
  await deliveryState(task,'website','running',{phase:'Publishing through the signed journal bridge'});
  const receipt=await publish(state.connection,state.site,state.post,{onWrite:()=>{submitted=true;},onReceipt:async r=>{
   confirmed=r.status==='PUBLISHED';
   await deliveryState(task,'website',confirmed?'confirmed':'running',{phase:confirmed?'Article saved; verifying complete public content':'Article saved in destination review',url:r.url,remoteId:String(r.id)});
   if(confirmed)await transaction(w,db=>db.query('UPDATE creator.posts SET website_url=$3 WHERE workspace_id=$1 AND id=$2',[w,state.post.id,r.url]));
  }});
  await updateTask(task,90,'Website · complete article verified on its canonical URL');
  await transaction(w,async db=>{
   await workspaceLock(db,w);
   await db.query("UPDATE creator.posts SET status='published',website_url=$3,published_at=now(),last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,state.post.id,receipt.link]);
   await db.query("UPDATE creator.publish_attempts SET outcome='published',remote_id=$3 WHERE workspace_id=$1 AND task_id=$2",[w,task.id,String(receipt.id)]);
   await db.query("UPDATE creator.usage_reservations SET status='consumed',updated_at=now() WHERE workspace_id=$1 AND post_id=$2",[w,state.post.id]);
   await audit(db,w,null,'post.website_published','post',state.post.id,{url:receipt.link});
  });
  return {postId:state.post.id,url:receipt.link,message:'Journal article published and verified. No social post submitted.'};
 }catch(error){
  const failure=websitePublicationFailure(error,{submitted,confirmed});
  if(!confirmed)await deliveryState(task,'website',failure.unknown?'unknown':'failed',{phase:failure.message,error:failure.message});
  await transaction(w,async db=>{
   await db.query('UPDATE creator.posts SET status=$3,last_error=$4,updated_at=now() WHERE workspace_id=$1 AND id=$2',[w,state.post.id,failure.unknown?'unknown':'failed',failure.message]);
   await db.query('UPDATE creator.publish_attempts SET outcome=$3 WHERE workspace_id=$1 AND task_id=$2',[w,task.id,failure.unknown?'unknown':'rejected']);
   await db.query('UPDATE creator.usage_reservations SET status=$3,updated_at=now() WHERE workspace_id=$1 AND post_id=$2',[w,state.post.id,failure.unknown?'unknown':'released']);
  });
  throw new AppError(409,failure.message,failure.unknown?'publication_unknown':'publication_rejected');
 }
}
