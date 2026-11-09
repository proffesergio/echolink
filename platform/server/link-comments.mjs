import {transaction,audit} from './db.mjs';
import {AppError} from './errors.mjs';
import {publicURL,remoteJSON} from './net.mjs';
import {decryptSecret} from './vault.mjs';
export function commentLink(post,product){
 const raw=product?.url||post.website_url;if(!raw)return null;
 const u=publicURL(raw);if(u.hostname.replace(/^www\./,'')==='fabrything.com'&&u.pathname.startsWith('/nobleseek'))u.hostname='nobleseek.fabrything.com';return u.href;
}
export async function queueLinkComment(db,w,page,post){
 if(!page.creative_policy?.linkComments?.enabled)return;
 const fresh=(await db.query('SELECT * FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,post.id])).rows[0];
 const product=fresh.product_id?(await db.query('SELECT url FROM creator.products WHERE workspace_id=$1 AND id=$2',[w,fresh.product_id])).rows[0]:null,url=commentLink(fresh,product);if(!url||!fresh.fb_post_id)return;
 const d=(await db.query("INSERT INTO creator.link_comments(workspace_id,page_id,post_id,platform,remote_post_id,url,due_at) VALUES($1,$2,$3,'facebook',$4,$5,$6::timestamptz+interval '5 minutes') ON CONFLICT(workspace_id,post_id,platform) DO NOTHING RETURNING id,due_at",[w,page.id,post.id,fresh.fb_post_id,url,fresh.published_at])).rows[0];
 if(d)await db.query("INSERT INTO creator.tasks(workspace_id,page_id,post_id,kind,input,not_before,phase) VALUES($1,$2,$3,'post_link_comment',$4,$5,'Website link comment scheduled · five-minute delay')",[w,page.id,post.id,{commentId:d.id},d.due_at]);
}
export async function sendLinkComment(task,{updateTask,request=remoteJSON}){
 const w=task.workspace_id,record=await transaction(w,async db=>{const d=(await db.query('SELECT * FROM creator.link_comments WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[w,task.input.commentId])).rows[0];if(!d)throw new AppError(404,'Comment delivery not found.');
 if(d.status==='published')return {already:true};if(d.status!=='queued')throw new AppError(409,'Check the existing comment result before retrying.','publication_unknown');
 const page=(await db.query('SELECT * FROM creator.pages WHERE workspace_id=$1 AND id=$2',[w,d.page_id])).rows[0],post=(await db.query('SELECT * FROM creator.posts WHERE workspace_id=$1 AND id=$2',[w,d.post_id])).rows[0];
 if(!page.active||!page.creative_policy?.linkComments?.enabled||post.deleted_at||post.archived_at){await db.query("UPDATE creator.link_comments SET status='skipped',last_error='Page, content or link comments paused' WHERE id=$1",[d.id]);return {skipped:true};}
 if(post.status!=='published'||post.fb_post_id!==d.remote_post_id||!page.fb_verified)throw new AppError(409,'The confirmed Facebook publication or Page authorization changed.');
 if(Date.now()<+new Date(d.due_at))throw new AppError(409,'Wait until the five-minute comment delay has elapsed.');
 const c=(await db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=$2',[w,page.facebook_connection_id])).rows[0];
 await db.query("UPDATE creator.link_comments SET status='publishing',last_error=NULL WHERE id=$1",[d.id]);return {d,c,likeOwnComment:page.creative_policy?.linkComments?.likeOwnComment===true,commentText:String(post.seo?.commentText||'').replace(/https?:\/\/[^\s]+/g,'').trim().slice(0,300)};});
 if(record.already||record.skipped)return {message:record.already?'Comment already recorded.':'Link comment skipped.'};
 const {d,c,commentText,likeOwnComment}=record;let submitted=false;
 try{await updateTask(task,40,'Posting the saved website link in the Facebook comments');submitted=true;
 const r=await request('https://graph.facebook.com/'+c.config.version+'/'+d.remote_post_id+'/comments',{method:'POST',headers:{authorization:'Bearer '+decryptSecret(c.secret_cipher,w).token,'content-type':'application/json'},body:{message:[commentText,d.url].filter(Boolean).join(' ')}});if(!r.id)throw new Error('No comment reference');
 await transaction(w,async db=>{await db.query("UPDATE creator.link_comments SET status='published',remote_id=$3,published_at=now() WHERE workspace_id=$1 AND id=$2",[w,d.id,r.id]);await audit(db,w,null,'post.link_commented','post',d.post_id,{commentId:r.id});});if(likeOwnComment){try{let status='unknown';try{const liked=await request('https://graph.facebook.com/'+c.config.version+'/'+r.id+'/likes',{method:'POST',headers:{authorization:'Bearer '+decryptSecret(c.secret_cipher,w).token,'content-type':'application/json'},body:{}});status=liked.success===true?'confirmed':'unknown';}catch(error){status=error.definiteRejection?'rejected':'unknown';}await transaction(w,db=>db.query('UPDATE creator.link_comments SET engagement=$3 WHERE workspace_id=$1 AND id=$2',[w,d.id,{pageLike:status,checkedAt:new Date().toISOString()}]));}catch{/* Optional Page-like reporting cannot undo a confirmed comment delivery. */}}
 return {remoteId:r.id,message:'Website link comment published after the five-minute delay.'};
 }catch(error){const uncertain=submitted&&!error.definiteRejection;await transaction(w,db=>db.query('UPDATE creator.link_comments SET status=$3,last_error=$4 WHERE workspace_id=$1 AND id=$2',[w,d.id,uncertain?'unknown':'failed',uncertain?'Check Facebook before retrying this comment.':error.message]));throw new AppError(409,uncertain?'Comment outcome is uncertain. Check Facebook; the original post will not be resubmitted.':error.message,uncertain?'publication_unknown':'comment_rejected');}
}
