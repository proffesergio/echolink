import {transaction,workspaceLock} from './db.mjs';
import {deliveryState,publicationFailure} from './publication-state.mjs';
import {writeNoble,verifyNoblePublic} from './nobleseek.mjs';
import {publicURL,remoteJSON} from './net.mjs';
import {AppError} from './errors.mjs';
export async function websiteBeforeDesign({task,page,post,site,connection},{updateTask,write=writeNoble,verify=verifyNoblePublic,request=remoteJSON,transact=transaction,receipt=deliveryState}={}){
 let submitted=false,confirmed=!!post.website_url;
 try{
  if(!['nobleseek_db','wordpress'].includes(site.connector))throw new AppError(400,'This website does not support article publication.');
  if(!confirmed)await transact(task.workspace_id,async db=>{
   await workspaceLock(db,task.workspace_id);const previous=(await db.query("SELECT status FROM creator.publication_deliveries WHERE workspace_id=$1 AND post_id=$2 AND destination='website' FOR UPDATE",[task.workspace_id,post.id])).rows[0];
   if(['running','unknown'].includes(previous?.status))throw new AppError(409,'Check the website delivery receipt before retrying this article.','publication_unknown');
   await db.query("INSERT INTO creator.publication_deliveries(workspace_id,post_id,page_id,destination,status,phase,started_at) VALUES($1,$2,$3,'website','running','Publishing complete report before design',now()) ON CONFLICT(workspace_id,post_id,destination) DO UPDATE SET status='running',phase=EXCLUDED.phase,started_at=now()",[task.workspace_id,post.id,page.id]);
  });
  await updateTask(task,5,'Website · publishing the complete report before news design');
  let article={link:post.website_url,slug:'echolink-'+post.id};
  if(!confirmed){
   if(site.connector==='nobleseek_db')article=await write(connection,connection.secret,{...site,imageCredit:page.creative_policy?.editorial?.imageCredit},post,{onWrite:()=>{submitted=true;}});
   else{const base=publicURL(site.url).origin,slug='echolink-'+post.id,headers={authorization:'Basic '+Buffer.from((connection.secret.username||'')+':'+(connection.secret.password||'')).toString('base64')},existing=await request(base+'/wp-json/wp/v2/posts?slug='+slug,{headers});
    if(existing[0])article=existing[0];else{submitted=true;article=await request(base+'/wp-json/wp/v2/posts',{method:'POST',headers:{...headers,'content-type':'application/json'},body:{slug,status:'publish',title:post.title,content:post.seo.article.text.split(/\n\s*\n/).map(p=>'<p>'+p.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))+'</p>').join('')}});}
   }
   confirmed=true;await receipt(task,'website','confirmed',{phase:'Complete report saved before design',url:article.link,remoteId:article.slug||String(article.id||'')});
   await transact(task.workspace_id,db=>db.query('UPDATE creator.posts SET website_url=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2',[task.workspace_id,post.id,publicURL(article.link).href]));post.website_url=article.link;
  }
  await updateTask(task,10,'Website · checking the live report before designing the Facebook post');if(site.connector==='nobleseek_db')await verify(site,article.slug||'echolink-'+post.id);
  await receipt(task,'website','confirmed',{phase:'Full website report verified; news design can begin',url:post.website_url});return post.website_url;
 }catch(error){
  if(error.code==='publication_unknown')throw error;
  const failure=publicationFailure(error,{websiteSubmitted:submitted,websiteConfirmed:false,stage:'website'});
  if(!confirmed)await receipt(task,'website',failure.unknown?'unknown':'failed',{phase:failure.message,error:failure.message});
  throw new AppError(confirmed?503:409,confirmed?'The report is saved. Waiting for its live website URL to verify before design.':failure.message,failure.unknown?'publication_unknown':'website_stage');
 }
}
