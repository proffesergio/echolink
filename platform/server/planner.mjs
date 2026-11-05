import {AppError} from './errors.mjs';
import {audit} from './db.mjs';
import {reservePublication,entitlements,releasePublication} from './quotas.mjs';
import {nextSlot,publishGate,bookings,slotProblem} from './scheduling.mjs';
export function readyForApproval(post){
 if(!post.caption?.trim())throw new AppError(400,'Generate or write the caption before approval.');
 if((post.creative.sourceImage||['image','product_sale'].includes(post.type))&&!post.creative.assetId)throw new AppError(409,'Design and review the image before approval.');
}
export async function approve(db,w,actor,post,{version,confirmWarnings=false,automatic=false}={}){
 if(version!==undefined&&version!==post.version)throw new AppError(409,'This draft changed. Refresh and review its latest caption and image.','version_changed');
 readyForApproval(post);if(post.seo.editorialWarnings?.length&&!confirmWarnings)throw new AppError(409,'Review the editorial warnings and confirm before approval.');
 await db.query("UPDATE creator.posts SET status='approved',approved_version=version,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,post.id]);await audit(db,w,actor,automatic?'post.auto_authorized':'post.approved','post',post.id,{warningsAcknowledged:confirmWarnings,automatic});return {...post,status:'approved',approved_version:post.version};
}
export async function queuePublication(db,w,actor,page,post,{at,autoPick=false,approveCurrent=false,version,confirmWarnings=false,planOnly=false,spread=false,target,ignoreTaskId=null,fallbackToSlot=false}={}){
 if(post.deleted_at||post.archived_at||['published','publishing','unknown'].includes(post.status))throw new AppError(409,'This post cannot be queued. Restore or reconcile it first.');
 if(version!==undefined&&version!==post.version)throw new AppError(409,'The post changed. Refresh and review the latest version.','version_changed');
 if(!planOnly&&(!page.active||!page.fb_verified))throw new AppError(409,'Enable and verify this Page’s Facebook connection first.');
 const plan=await entitlements(db,w);
 if(autoPick)at=await nextSlot(db,w,page,{postId:post.id,from:at||new Date(Date.now()+60000),until:new Date(plan.period_end),spread,target});
 if(!at||!Number.isFinite(+at))throw new AppError(400,'Choose a valid posting time.');
 if(+at>=new Date(plan.period_end))throw new AppError(402,'Choose a time within your active plan period.');
 if((await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND post_id=$2 AND status IN ('queued','running') AND (kind<>'publish' OR status='running') AND ($3::uuid IS NULL OR id<>$3) LIMIT 1",[w,post.id,ignoreTaskId])).rowCount)throw new AppError(409,'Wait for caption or image preparation to finish before scheduling this post.');
 let conflict=slotProblem(page,await bookings(db,w,page.id,post.id),at);if(conflict&&fallbackToSlot){at=await nextSlot(db,w,page,{postId:post.id,from:new Date(Date.now()+60000),until:new Date(plan.period_end)});conflict=null;}if(conflict)throw new AppError(409,'That slot conflicts with this Page’s window, daily target or another post. Use the next available slot.',conflict);
 await db.query("UPDATE creator.tasks SET status='canceled',phase='Schedule updated',finished_at=now() WHERE workspace_id=$1 AND post_id=$2 AND kind='publish' AND status='queued'",[w,post.id]);
 if(planOnly){await releasePublication(db,w,post.id);await db.query("UPDATE creator.posts SET planned_at=$3,scheduled_at=NULL,status=CASE WHEN approved_version=version THEN 'approved' ELSE 'review' END,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,post.id,at]);return {ok:true,planned:true,plannedAt:at,message:page.require_review?'Calendar slot prepared. Publication waits for your approval.':'Calendar slot prepared. Publication resumes when this Page is enabled and connected.'};}
 const automatic=!page.require_review;
 if(post.approved_version!==post.version){if(!approveCurrent&&!automatic)throw new AppError(409,'Review this post and choose Approve & schedule.');post=await approve(db,w,actor,post,{version,confirmWarnings:confirmWarnings||automatic,automatic});}
 await publishGate(db,w,page,post,{now:at});await reservePublication(db,w,post.id,at);
 await db.query("UPDATE creator.posts SET status='scheduled',planned_at=$3,scheduled_at=$3,last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,post.id,at]);
 const task=(await db.query("INSERT INTO creator.tasks(workspace_id,page_id,post_id,kind,not_before,phase,input) VALUES($1,$2,$3,'publish',$4,'Scheduled for publication',$5) RETURNING *",[w,page.id,post.id,at,JSON.stringify({websitePublishing:page.website_publishing&&['news','blog'].includes(post.type),hasPhoto:!!post.creative.assetId,pageName:page.name})])).rows[0];
 await audit(db,w,actor,'post.scheduled','post',post.id,{at});return {...task,message:+at>Date.now()+60000?'Approved and scheduled. The calendar and Activity show its progress.':'Publication queued. Follow its progress in Activity.'};
}
