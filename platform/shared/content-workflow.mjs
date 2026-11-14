export const CONTENT_WORKFLOWS=['TEXT','PHOTO_CAPTION','VIDEO_REELS'];
export function contentWorkflow(page){
 const explicit=page.profile_config?.content_workflow;
 if(CONTENT_WORKFLOWS.includes(explicit))return explicit;
 return page.creative_policy?.nichePreset?.startsWith('reels_')?'VIDEO_REELS':'PHOTO_CAPTION';
}
export function workflowPostType(page,{product=false,type='original'}={}){
 const workflow=contentWorkflow(page);
 if(workflow==='VIDEO_REELS')return 'reel';
 if(product||type==='product_sale')return 'product_sale';
 if(['news','blog','quote'].includes(type))return type;
 return workflow==='PHOTO_CAPTION'?'image':'original';
}
export function workflowMediaProblem(page,post,kind,{textOnly=false}={}){
 const workflow=contentWorkflow(page);
 if(kind==='creative'&&textOnly)return workflow==='TEXT'&&post.type==='news'?null:'Text social task held after workflow change.';
 if(kind==='render_reel'&&(workflow!=='VIDEO_REELS'||post.type!=='reel'))return 'Video task held: this profile no longer selects the video workflow. Regenerate the editable draft.';
 if(kind==='creative'&&(workflow!=='PHOTO_CAPTION'||post.type==='reel'))return 'Image task held: this profile no longer selects photo + caption. Regenerate the editable draft.';
 return null;
}
export function workflowPublicationProblem(page,post){
 if(page.destination_type==='website')return post.type!=='blog'||!post.seo?.journal?.reviewedHash?'Generate and review a structured blog article before website publication.':null;
 // Unconfigured legacy posts retain their historical approval behavior.
 if(!page.profile_config?.content_workflow)return null;
 const workflow=contentWorkflow(page);
 if(workflow==='VIDEO_REELS'&&post.type!=='reel'||workflow!=='VIDEO_REELS'&&post.type==='reel')return 'The draft type differs from this profile’s workflow. Regenerate and review it.';
 if(workflow==='TEXT'&&(post.creative?.assetId||post.creative?.sourceImage||post.seo?.storyboard))return 'Text workflow contains stale media. Regenerate and review the text draft.';
 if(workflow==='PHOTO_CAPTION'&&!post.creative?.assetId)return 'Prepare and review a photo before publishing this photo + caption draft.';
 if(workflow==='VIDEO_REELS'&&(!post.creative?.assetId||post.creative?.mime!=='video/mp4'))return 'Render and review the video before publishing this Reel.';
 return null;
}
export function workflowDraftPatch(page,post){
 if(!['draft','review','approved','failed'].includes(post.status)||post.deleted_at||post.archived_at)return null;
 const workflow=contentWorkflow(page),explicit=!!page.profile_config?.content_workflow;
 // Preserve manually selected legacy types except legacy reels superseded by explicit policy.
 const type=explicit?workflowPostType(page,{product:!!post.product_id,type:post.type}):post.type;
 const switched=post.type!==type||post.seo?.contentWorkflow&&post.seo.contentWorkflow!==workflow;
 const staleNonVideo=explicit&&workflow!=='VIDEO_REELS'&&(post.seo?.storyboard||post.seo?.reelMedia||post.creative?.mime==='video/mp4');
 const staleText=workflow==='TEXT'&&(Object.keys(post.creative||{}).some(k=>!['ratio','style'].includes(k))||post.seo?.storyboard||post.seo?.reelMedia);
 if(!switched&&!staleText&&!staleNonVideo)return null;
 const seo={...post.seo,contentWorkflow:workflow};
 for(const key of ['storyboard','reelMedia','mediaCredits','designBrief','bundleDraft'])delete seo[key];
 return {type,creative:{ratio:type==='reel'?'9:16':'1:1',style:'editorial'},seo};
}
