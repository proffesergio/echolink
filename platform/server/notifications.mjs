import {transaction,audit} from './db.mjs';
import {decryptSecret} from './vault.mjs';
import {remoteJSON,publicURL} from './net.mjs';
import {signedMediaURL} from './public-media.mjs';
import {AppError} from './errors.mjs';
export const notificationTypes=[
 {id:'telegram',name:'Telegram approvals',capabilities:['notify']},
 {id:'discord',name:'Discord approvals',capabilities:['notify']},
 {id:'whatsapp_cloud',name:'WhatsApp Cloud approvals',capabilities:['notify']},
 {id:'approval_webhook',name:'Approval webhook / Baileys bridge',capabilities:['notify']},
];
export async function queueApprovalNotification(db,w,page,post,{force=false}={}){
 if(!page.notification_connection_id||!force&&!page.require_review&&!post.seo?.safety?.requiresHuman)return;
 const row=(await db.query('INSERT INTO creator.approval_notifications(workspace_id,page_id,post_id,connection_id,post_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id',[w,page.id,post.id,page.notification_connection_id,post.version])).rows[0];
 if(row)await db.query("INSERT INTO creator.tasks(workspace_id,page_id,post_id,kind,input,phase) VALUES($1,$2,$3,'notify_approval',$4,'Approval notification queued')",[w,page.id,post.id,{notificationId:row.id}]);
 return row;
}
export function approvalPayload(page,post){
 const review=new URL('/',process.env.PLATFORM_ORIGIN||'http://localhost:8790');review.searchParams.set('review',post.id);review.searchParams.set('version',post.version);
 return {postId:post.id,version:post.version,page:page.name,niche:page.niche,state:post.seo?.safety?.requiresHuman?'HIGH_ALERT_MANUAL_REVIEW':'PENDING_APPROVAL',preview:(post.caption||post.title+'\n'+post.body).slice(0,1200),imageUrl:post.creative?.assetId?signedMediaURL(post.workspace_id,post.creative.assetId):null,reviewUrl:review.href};
}
export async function deliverApproval(c,secret,payload,{request=remoteJSON}={}){
 const text=[payload.state.replaceAll('_',' '),payload.page+' · '+payload.niche,payload.preview,'Review version '+payload.version+': '+payload.reviewUrl].join('\n\n');
 if(c.provider==='telegram'){
  if(!/^[0-9]+:[A-Za-z0-9_-]+$/.test(secret.token||''))throw new AppError(400,'Save the Telegram bot token.');
  return request('https://api.telegram.org/bot'+secret.token+'/sendMessage',{method:'POST',body:{chat_id:c.config.chatId,text,reply_markup:{inline_keyboard:[[{text:'Review this draft',url:payload.reviewUrl}]]}},headers:{'content-type':'application/json'}});
 }
 if(c.provider==='discord'){
  const u=publicURL(secret.webhookURL);if(u.hostname!=='discord.com'||!u.pathname.startsWith('/api/webhooks/'))throw new AppError(400,'Save a Discord incoming webhook URL.');u.searchParams.set('wait','true');
  return request(u.href,{method:'POST',body:{allowed_mentions:{parse:[]},embeds:[{title:payload.page+' · '+payload.state,url:payload.reviewUrl,description:payload.preview,fields:[{name:'Niche',value:payload.niche}],...(payload.imageUrl?{image:{url:payload.imageUrl}}:{})}]},headers:{'content-type':'application/json'}});
 }
 if(c.provider==='whatsapp_cloud'){
  if(!/^\d+$/.test(c.config.phoneNumberId||'')||!/^\d{7,16}$/.test(c.config.recipient||'')||!secret.token)throw new AppError(400,'Save the WhatsApp sender phone-number ID, recipient and access token.');
  const body={messaging_product:'whatsapp',to:c.config.recipient,...(c.config.templateName?{type:'template',template:{name:c.config.templateName,language:{code:c.config.locale||'en_US'},components:[{type:'body',parameters:[{type:'text',text:payload.preview.slice(0,800)},{type:'text',text:payload.reviewUrl}]}]}}:{type:'text',text:{preview_url:true,body:text}})};
  return request('https://graph.facebook.com/'+(c.config.version||'v24.0')+'/'+c.config.phoneNumberId+'/messages',{method:'POST',body,headers:{'content-type':'application/json',authorization:'Bearer '+secret.token}});
 }
 if(c.provider==='approval_webhook')return request(publicURL(secret.webhookURL).href,{method:'POST',body:{...payload,to:c.config.recipient},headers:{'content-type':'application/json',...(secret.token?{authorization:'Bearer '+secret.token}:{})}});
 throw new AppError(400,'Choose a supported approval notification channel.');
}
export async function sendApprovalNotification(task,{updateTask,deliver=deliverApproval}={}){
 const w=task.workspace_id,record=await transaction(w,async db=>{
  const n=(await db.query('SELECT * FROM creator.approval_notifications WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[w,task.input.notificationId])).rows[0];if(!n||n.status==='sent'||n.status==='skipped')return null;if(n.status!=='queued')throw new AppError(409,'Check the notification outcome before resending.');
  const post=(await db.query('SELECT * FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,n.post_id])).rows[0],page=(await db.query('SELECT * FROM creator.pages WHERE workspace_id=$1 AND id=$2',[w,n.page_id])).rows[0];
  if(post.deleted_at||post.archived_at||post.version!==n.post_version||post.approved_version===post.version||page.notification_connection_id!==n.connection_id){await db.query("UPDATE creator.approval_notifications SET status='skipped' WHERE id=$1",[n.id]);return null;}
  const c=(await db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=$2',[w,n.connection_id])).rows[0];await db.query("UPDATE creator.approval_notifications SET status='sending' WHERE id=$1",[n.id]);return {n,post,page,c};
 });if(!record)return {message:'Obsolete or completed approval notification skipped.'};
 await updateTask(task,35,'Sending the current draft preview to its configured admin channel');
 try{const result=await deliver(record.c,decryptSecret(record.c.secret_cipher,w),approvalPayload(record.page,record.post));await transaction(w,async db=>{await db.query("UPDATE creator.approval_notifications SET status='sent',remote_id=$3,sent_at=now() WHERE workspace_id=$1 AND id=$2",[w,record.n.id,String(result?.result?.message_id||result?.messages?.[0]?.id||result?.id||'accepted')]);await audit(db,w,null,'approval.notification_sent','post',record.post.id);});return {message:'Approval preview sent. Its link requires the correct workspace account; it cannot approve by opening a URL.'};}
 catch(error){await transaction(w,db=>db.query('UPDATE creator.approval_notifications SET status=$3,last_error=$4 WHERE workspace_id=$1 AND id=$2',[w,record.n.id,error.definiteRejection?'failed':'unknown','Notification delivery could not be confirmed. Check the destination before resending.']));throw new AppError(409,'Approval notification delivery needs checking; the draft remains safely in review.');}
}
