import {transaction,audit} from './db.mjs';
import {decryptSecret} from './vault.mjs';
import {remoteJSON} from './net.mjs';
import {signedMediaURL} from './public-media.mjs';
import {AppError} from './errors.mjs';
import {readFile} from 'node:fs/promises';
import {outbound} from './net.mjs';
import {renderCreative,saveAsset} from './creative.mjs';
import {removeProductBackground} from './cutout.mjs';
import {prepareCaption} from './prompts.mjs';
const graph=c=>{if(!/^v\d+\.0$/.test(c.config.version||''))throw new AppError(400,'Verify the Facebook Graph API version first.');return 'https://graph.facebook.com/'+c.config.version;};
export async function discoverInstagram(page,connection,secret,request=remoteJSON){
 const base=graph(connection),headers={authorization:'Bearer '+secret.token};
 const result=await request(base+'/'+page.fb_page_id+'?fields=instagram_business_account{id,username,name}',{headers}),account=result.instagram_business_account;
 if(!account?.id||!account.username)throw new AppError(400,'Meta did not expose a linked professional Instagram account. Link the business/creator account to this Facebook Page in Business Manager and authorize instagram_basic and instagram_content_publish.');
 await request(base+'/'+account.id+'/content_publishing_limit?fields=config,quota_usage',{headers});
 return {id:account.id,username:account.username,name:account.name||account.username};
}
export async function queueInstagramDelivery(db,w,page,post){
 const dest=(await db.query("SELECT * FROM creator.social_destinations WHERE workspace_id=$1 AND page_id=$2 AND platform='instagram' AND enabled",[w,page.id])).rows[0];if(!dest)return;
 const result=await db.query("INSERT INTO creator.social_deliveries(workspace_id,page_id,post_id,destination_id,platform,status,last_error) VALUES($1,$2,$3,$4,'instagram',$5,$6) ON CONFLICT(workspace_id,post_id,platform) DO NOTHING RETURNING id",[w,page.id,post.id,dest.id,post.creative.assetId?'queued':'skipped',post.creative.assetId?null:'Instagram image publishing needs a completed creative; text-only posts are Facebook-only.']);
 if(result.rowCount&&post.creative.assetId)await db.query("INSERT INTO creator.tasks(workspace_id,page_id,post_id,kind,phase) VALUES($1,$2,$3,'publish_instagram','Instagram delivery queued')",[w,page.id,post.id]);
}
export async function publishPhotoFlow({base,accountId,token,imageURL,caption,delivery,onContainer,onPublishing,onPublished,request=remoteJSON}){
 if(delivery.status==='published')return {id:delivery.remote_id,alreadyPublished:true};
 if(['publishing','unknown'].includes(delivery.status))throw new AppError(409,'Check Instagram before retrying this uncertain delivery.','publication_unknown');
 if(new URL(imageURL).protocol!=='https:')throw new AppError(400,'Instagram needs the public HTTPS dashboard media URL.');
 const headers={authorization:'Bearer '+token,'content-type':'application/json'};let submitted=false;
 try{
  let container=delivery.container_id;
  if(!container){const created=await request(base+'/'+accountId+'/media',{method:'POST',headers,body:{image_url:imageURL,caption:caption.slice(0,2200)}});if(!created.id)throw new AppError(502,'Instagram did not return a media container.');container=created.id;await onContainer(container);}
  const state=await request(base+'/'+container+'?fields=status_code,status',{headers});
  if(state.status_code==='IN_PROGRESS')throw new AppError(409,'Instagram is processing the image. Checking again shortly.','instagram_processing');
  if(state.status_code!=='FINISHED')throw new AppError(409,'Instagram rejected or expired the image container. Check the creative before retrying.');
  await onPublishing();submitted=true;
  const result=await request(base+'/'+accountId+'/media_publish',{method:'POST',headers,body:{creation_id:container}});if(!result.id)throw new AppError(502,'Instagram did not return a publication reference.');
  await onPublished(result.id);return {id:result.id};
 }catch(error){if(submitted&&!error.definiteRejection)throw new AppError(409,'Instagram publication needs reconciliation. Facebook delivery is already recorded and will not be repeated.','publication_unknown');throw error;}
}
export async function publishInstagram(task,{updateTask}){
 const w=task.workspace_id,record=await transaction(w,async db=>{
  const post=(await db.query('SELECT * FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,task.post_id])).rows[0],page=(await db.query('SELECT * FROM creator.pages WHERE workspace_id=$1 AND id=$2',[w,task.page_id])).rows[0];
  const delivery=(await db.query("SELECT * FROM creator.social_deliveries WHERE workspace_id=$1 AND post_id=$2 AND platform='instagram'",[w,task.post_id])).rows[0];
  const destination=(await db.query('SELECT * FROM creator.social_destinations WHERE workspace_id=$1 AND id=$2',[w,delivery?.destination_id])).rows[0];
  if(!post||!page||post.deleted_at||post.archived_at||!page.active||!destination?.enabled)throw new AppError(409,'This Instagram destination or content is paused.');
  const connection=(await db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=$2',[w,page.facebook_connection_id])).rows[0];if(!connection)throw new AppError(409,'Reconnect this Page’s Facebook authorization.');
  const product=post.product_id?(await db.query('SELECT * FROM creator.products WHERE workspace_id=$1 AND id=$2',[w,post.product_id])).rows[0]:null;
  if(product&&(!product.available||Date.now()-new Date(product.fetched_at)>86400000))throw new AppError(409,'Refresh the product’s stock and catalog facts before Instagram sharing.');
  return {post,page,delivery,destination,connection,product};
 });
 const {post,page,delivery,destination,connection,product}=record,token=decryptSecret(connection.secret_cipher,w).token,base=graph(connection),headers={authorization:'Bearer '+token};
 if(delivery.status==='published')return {remoteId:delivery.remote_id,message:'Instagram delivery already recorded.'};
 if(['unknown','publishing'].includes(delivery.status))throw new AppError(409,'Reconcile the existing Instagram delivery before retrying.','publication_unknown');
 await updateTask(task,15,'Checking the linked Instagram account and current publishing allowance');
 const linked=await discoverInstagram(page,connection,{token});if(linked.id!==destination.remote_id)throw new AppError(409,'The linked Instagram account changed. Verify this Page’s Instagram destination again.');
 const limit=await remoteJSON(base+'/'+linked.id+'/content_publishing_limit?fields=config,quota_usage',{headers});
 if(limit.data?.some(l=>Number.isFinite(l.config?.quota_total)&&l.quota_usage>=l.config.quota_total))throw new AppError(429,'Instagram reports its current publishing allowance is exhausted. Try after its rolling window resets.');
 try{
  let assetId=task.input.imageAssetId||post.creative.assetId,caption=task.input.captionSnapshot||prepareCaption(post.caption,page,product).caption;
  // A newly shared older Facebook product can receive today's price-free
  // Instagram design without overwriting its historical Facebook creative.
  if(product&&post.creative.designVersion!=='studio-v3'&&!task.input.imageAssetId){
   await updateTask(task,25,'Preparing a price-free Instagram variant from the real catalog photo');
   let photo;if(product.image_url){const source=await outbound(product.image_url,{maxBytes:12000000});if(!source.ok)throw new AppError(502,'The product photo could not be read.');photo=source.bytes;if(page.creative_policy?.removeBackground!==false){try{photo=(await removeProductBackground(photo)).bytes;}catch{}}}
   const assets=await transaction(w,async db=>({logo:page.brand.logoAssetId?(await db.query('SELECT path FROM creator.assets WHERE workspace_id=$1 AND id=$2',[w,page.brand.logoAssetId])).rows[0]:null,website:page.website_id?(await db.query('SELECT * FROM creator.websites WHERE workspace_id=$1 AND id=$2',[w,page.website_id])).rows[0]:null}));
   const image=await renderCreative({post,page,product,sourcePhoto:photo,brandLogo:assets.logo?await readFile(assets.logo.path):null,website:assets.website}),asset=await saveAsset(w,post.id,image);assetId=asset.id;
   await transaction(w,db=>db.query('INSERT INTO creator.assets(id,workspace_id,post_id,path,mime,width,height) VALUES($1,$2,$3,$4,$5,$6,$7)',[asset.id,w,post.id,asset.path,asset.mime,asset.width,asset.height]));
  }
  await transaction(w,db=>db.query('UPDATE creator.tasks SET input=input||$3::jsonb WHERE workspace_id=$1 AND id=$2',[w,task.id,JSON.stringify({imageAssetId:assetId,captionSnapshot:caption})]));
  await updateTask(task,35,'Instagram is fetching the signed, full-layout JPEG');
  const result=await publishPhotoFlow({base,accountId:linked.id,token,imageURL:signedMediaURL(w,assetId),caption,delivery,
   onContainer:id=>transaction(w,db=>db.query("UPDATE creator.social_deliveries SET container_id=$3,status='preparing',last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,delivery.id,id])),
   onPublishing:async()=>{await updateTask(task,70,'Publishing the image and caption to Instagram');await transaction(w,async db=>{const d=(await db.query('SELECT status FROM creator.social_deliveries WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[w,delivery.id])).rows[0];if(['published','publishing','unknown'].includes(d.status))throw new AppError(409,'Instagram delivery is already claimed.','publication_unknown');await db.query("UPDATE creator.social_deliveries SET status='publishing',updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,delivery.id]);});},
   onPublished:id=>transaction(w,async db=>{await db.query("UPDATE creator.social_deliveries SET status='published',remote_id=$3,published_at=now(),last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,delivery.id,id]);await audit(db,w,null,'post.instagram_published','post',post.id,{remoteId:id,username:destination.username});})});
  try{const media=await remoteJSON(base+'/'+result.id+'?fields=id,permalink',{headers});if(media.permalink)await transaction(w,db=>db.query('UPDATE creator.social_deliveries SET permalink=$3 WHERE workspace_id=$1 AND id=$2',[w,delivery.id,media.permalink]));}catch{}
  return {remoteId:result.id,message:'Instagram image and caption published. Facebook was not resubmitted.'};
 }catch(error){if(error.code!=='instagram_processing')await transaction(w,db=>db.query('UPDATE creator.social_deliveries SET status=$3,last_error=$4,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND status<>\'published\'',[w,delivery.id,error.code==='publication_unknown'?'unknown':'failed',error instanceof AppError?error.message:'Instagram delivery failed.']));throw error;}
}
