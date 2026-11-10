import {generateNewsSocial} from './news-report-writer.mjs';
import {transaction} from './db.mjs';
import {criticalEditorialWarnings} from './editorial.mjs';
import {AppError} from './errors.mjs';
import {formatInstagramCaption} from './channel-captions.mjs';
export async function prepareNewsSocial({task,page,post,connection},{updateTask,generate=generateNewsSocial,transact=transaction}={}){
 if(!post.seo?.article?.socialPending)return;
 if(page.website_publishing&&!post.website_url)throw new AppError(409,'Publish and verify the complete website report before generating its Facebook version.');
 if(post.seo.article.needsReview)throw new AppError(409,'The report needs editorial correction before preparing social content.');
 await updateTask(task,15,'Facebook · preparing a concise version of the confirmed website report');const metrics=[];
 const social=await generate({page,post,connection,secret:connection.secret},{onMetrics:m=>metrics.push(m)});
 if(criticalEditorialWarnings(social.warnings).length)throw new AppError(422,'Facebook summary needs source correction. The confirmed website report is preserved.');
 const seo={...post.seo,article:{...post.seo.article,socialPending:false,socialPreparedForURL:post.website_url||null},description:social.caption.replace(/#[\p{L}\p{M}\p{N}_]+/gu,'').trim().slice(0,160),hashtags:social.caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)||[],inferenceRuns:[...(post.seo.inferenceRuns||[]),...metrics],channelCaptions:{...post.seo.channelCaptions,instagram:formatInstagramCaption(social.caption,page)},editorialWarnings:[...(post.seo.editorialWarnings||[]),...social.warnings],generationNotes:[...(post.seo.generationNotes||[]),...social.notes]};
 await transact(task.workspace_id,async db=>{const result=await db.query("UPDATE creator.posts SET caption=$3,seo=$4,version=version+1,approved_version=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$5 AND status IN ('draft','review','approved','failed') RETURNING version",[task.workspace_id,post.id,social.caption,seo,post.version]);if(!result.rowCount)throw new AppError(409,'The article changed during Facebook preparation. Refresh this draft.');post.version=result.rows[0].version;});
 post.caption=social.caption;post.seo=seo;
}
