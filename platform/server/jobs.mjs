import {selectProductFocus} from './product-focus.mjs';
import {resolvePageFonts} from './fonts.mjs';
import {generateStoryboard,renderVerticalVideo,searchStockImage,synthesizeNarration} from './reels.mjs';
import {fileURLToPath} from 'node:url';
import {preflightContent,crisisMatches} from './safety.mjs';
import {queueApprovalNotification,sendApprovalNotification} from './notifications.mjs';
import {bundleEnabled,generateContentBundle} from './content-bundle.mjs';
import {generateNewsArticle} from './news-article.mjs';
import {queueLoop} from './queue-loop.mjs';
import {collectNewsFeeds,clusterStories,shortlistStories,rankStories,researchStory,articleHash,storySimilarity} from './news-research.mjs';
import {analyzeReferences} from './reference-analysis.mjs';
import {referenceFingerprint,EDITORIAL_VERSION,recordEditorialQuality} from './editorial-memory.mjs';
import {cleanPublicCopy} from './public-copy.mjs';
import {deliveryState,publicationFailure} from './publication-state.mjs';
import {analyzeProduct} from './product-analysis.mjs';
import {designPageBrand,applyPageBrand} from './page-branding.mjs';
import {collectSocialReports} from './social-reporting.mjs';
import {queueLinkComment,sendLinkComment} from './link-comments.mjs';
import {logoAssetFor} from './brand.mjs';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {transaction,audit,workspaceLock} from './db.mjs';
import {AppError} from './errors.mjs';
import {decryptSecret,encryptSecret} from './vault.mjs';
import {testAI,textCompletion,imageGeneration,checkTextCapacity} from './providers.mjs';
import {fetchProducts} from './catalog.mjs';
import {renderCreative,saveAsset} from './creative.mjs';
import {remoteJSON,publicURL,outbound} from './net.mjs';
import {entitlements,reservePublication,releasePublication,requireGenerationCapacity} from './quotas.mjs';
import {publishGate} from './scheduling.mjs';
import {env} from './env.mjs';
import {testNoble,writeNoble,verifyNoblePublic} from './nobleseek.mjs';
import {testMirror,syncOneMirror} from './mirrors.mjs';
import {editorialWarnings,criticalEditorialWarnings} from './editorial.mjs';
import {queuePublication} from './planner.mjs';
import {pageClock} from './scheduling.mjs';
import {resolveFacebookPage,pauseFacebookPage} from './facebook.mjs';
import {backgroundPrompt} from './prompts.mjs';
import {removeProductBackground} from './cutout.mjs';
import {summarizeInsights} from './insights.mjs';
import {publishInstagram,queueInstagramDelivery} from './instagram.mjs';
import {categoryFor,pickCatalogProduct} from './content-policy.mjs';
import {generationBuffer} from './generation-buffer.mjs';
import {liveNews,newsFreshnessProblem,LIVE_NEWS_MAX_AGE_MS} from './news-timing.mjs';
import {bookings} from './scheduling.mjs';
import {generationAvailability,startsGeneration} from './generation-window.mjs';
import {collectReportEvidence,generateNewsReport} from './news-desk.mjs';
import {websiteBeforeDesign} from './website-first.mjs';
import {prepareNewsSocial} from './news-social-stage.mjs';
import {freemem} from 'node:os';
import {inferenceSettings,resourceWait} from './inference-resources.mjs';
import {inferenceIdle} from './inference-idle.mjs';
import {preflightProduct,productFingerprint} from './product-preflight.mjs';
import {formatInstagramCaption} from './channel-captions.mjs';
import {generateFactualCaption} from './caption-generation.mjs';
export async function row(client,table,workspaceId,id){
 if(!['connections','pages','posts','websites','products','campaigns','assets','tasks','feeds','automation_rules'].includes(table))throw new Error('Invalid internal table');
 const result=(await client.query(`SELECT * FROM creator.${table} WHERE workspace_id=$1 AND id=$2`,[workspaceId,id])).rows[0];
 if(!result)throw new AppError(404,'This item was not found in your workspace.');return result;
}
export async function enqueue(client,workspaceId,kind,{pageId=null,postId=null,input={},notBefore=null}={}){
 const count=(await client.query("SELECT count(*)::int AS count FROM creator.tasks WHERE workspace_id=$1 AND kind NOT IN ('publish','manual_handoff','publish_instagram','post_link_comment','apply_page_brand','notify_approval','sync_insights') AND status IN ('queued','running')",[workspaceId])).rows[0].count;
 if(count>=20&&kind!=='sync_insights')throw new AppError(429,'This workspace already has 20 pending tasks. Let them finish before adding more.');
 return(await client.query(`INSERT INTO creator.tasks(workspace_id,kind,page_id,post_id,input,not_before) VALUES($1,$2,$3,$4,$5,COALESCE($6,now())) RETURNING *`,[workspaceId,kind,pageId,postId,JSON.stringify(input),notBefore])).rows[0];
}
export const updateTask=(task,progress,phase)=>transaction(task.workspace_id,client=>client.query(`UPDATE creator.tasks SET progress=$3,phase=$4,heartbeat_at=now(),lease_until=now()+interval '8 minutes',events=events||$5::jsonb WHERE workspace_id=$1 AND id=$2`,[task.workspace_id,task.id,progress,phase,JSON.stringify([{progress,phase,at:new Date().toISOString()}])]));
async function connectionFor(workspaceId,id){return transaction(workspaceId,async client=>{const c=await row(client,'connections',workspaceId,id);return {...c,secret:decryptSecret(c.secret_cipher,workspaceId)};});}
function graph(c){if(!/^v\d+\.0$/.test(c.config.version||''))throw new AppError(400,'Save a supported Meta Graph API version on this connection.');return 'https://graph.facebook.com/'+c.config.version;}
export async function facebookIdentity(c){
 const result=await remoteJSON(graph(c)+'/me?fields=id,name',{headers:{authorization:'Bearer '+(c.secret.token||'')}});if(!/^\d+$/.test(result.id||''))throw new AppError(400,'A Facebook Page token is required.');
 // A User token must never be accepted as ownership proof for a claimed Page.
 await remoteJSON(graph(c)+'/'+result.id+'?fields=category',{headers:{authorization:'Bearer '+c.secret.token}});return {ok:true,id:result.id,name:result.name,message:'Page identity verified. Publishing permissions are checked by Meta on submission.'};
}
async function testConnection(task){
 const c=await connectionFor(task.workspace_id,task.input.connectionId);await updateTask(task,20,'Contacting '+c.provider);
 let result;
 if(c.provider==='facebook')result=await facebookIdentity(c);
 else if(c.provider==='nobleseek_db')result=await testNoble(c,c.secret);
 else if(c.provider==='fabrything_db'){const products=await fetchProducts({url:c.config.url,connector:'fabrything_db',config:{}},c.secret,c);result={ok:true,message:'Read-only catalog connection verified: '+products.length+' products.'};}
 else if(['airtable','google_sheets'].includes(c.provider))result=await testMirror(c,c.secret);
 else if(['wordpress','woocommerce','shopify'].includes(c.provider)){
  if(!c.config.url)throw new AppError(400,'Save the website/store HTTPS origin on this connection.');const base=publicURL(c.config.url).origin;
  if(c.provider==='shopify'){
   const r=await remoteJSON(base+'/api/2026-10/graphql.json',{method:'POST',headers:{'content-type':'application/json','X-Shopify-Storefront-Access-Token':c.secret.apiKey||''},body:{query:'{ shop { name } }'}});if(!r.data?.shop?.name)throw new AppError(400,'Shopify did not return a shop. Check the Storefront token.');result={ok:true,message:'Shopify catalog connection verified.',name:r.data.shop.name};
  }else{await remoteJSON(base+(c.provider==='wordpress'?'/wp-json/wp/v2/users/me?context=edit':'/wp-json/wc/v3/products?per_page=1'),{headers:{authorization:'Basic '+Buffer.from((c.secret.username||'')+':'+(c.secret.password||'')).toString('base64')}});result={ok:true,message:wordsForService(c.provider)+' credentials verified.'};}
 }else if(['pexels','pixabay'].includes(c.provider)){await searchStockImage(c,c.secret,'landscape');result={ok:true,message:'Stock-media API key returned a usable image and attribution.'};}
 else if(['telegram','discord','whatsapp_cloud','approval_webhook'].includes(c.provider))result={ok:true,verified:false,message:'Notification configuration saved. Request a preview from a draft to test actual delivery; no message was sent by this check.'};
 else result=await testAI(c,c.secret);
 await transaction(task.workspace_id,client=>client.query("UPDATE creator.connections SET status=$4,last_test_at=now(),last_test_result=$3 WHERE workspace_id=$1 AND id=$2",[task.workspace_id,c.id,result,result.verified===false?'saved':'connected']));return result;
}
function wordsForService(id){return id==='wordpress'?'WordPress':'WooCommerce';}
async function generate(task){
 const {post,page}=await transaction(task.workspace_id,async client=>{const post=await row(client,'posts',task.workspace_id,task.post_id);if(post.deleted_at||post.archived_at||['published','publishing','unknown','scheduled','ready_manual'].includes(post.status))throw new AppError(409,'Move the post to draft before generating.');return {post,page:await row(client,'pages',task.workspace_id,post.page_id),product:post.product_id?await row(client,'products',task.workspace_id,post.product_id):null};});
 if(post.product_id){await updateTask(task,10,'Checking this product directly against the store before writing');await preflightProduct(task.workspace_id,task.post_id,{checkSavedFacts:false});}
 const product=post.product_id?await transaction(task.workspace_id,db=>row(db,'products',task.workspace_id,post.product_id)):null;
 if(post.type==='news'){const original=post.seo?.research?.sources?.find(s=>s.url===post.source_url)?.title;if(original)post.title=original;}
 const prior=await transaction(task.workspace_id,async db=>(await db.query("SELECT id,title FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status='published' ORDER BY published_at DESC LIMIT 50",[task.workspace_id,page.id])).rows);
 const safety=preflightContent(post,prior,page.creative_policy);
 if(safety.duplicateId){await transaction(task.workspace_id,db=>db.query("UPDATE creator.posts SET status='rejected',archived_at=now(),last_error='Duplicate topic in the last 50 published headlines' WHERE workspace_id=$1 AND id=$2",[task.workspace_id,post.id]));return {postId:post.id,hold:true,message:'Duplicate topic skipped before inference.'};}
 if(safety.highAlert){post.seo={...post.seo,safety:{...post.seo?.safety,requiresHuman:true,matches:safety.matches,fingerprint:safety.fingerprint}};await transaction(task.workspace_id,async db=>{await db.query('UPDATE creator.posts SET seo=$3,status=CASE WHEN $4 THEN \'review\' ELSE status END,last_error=CASE WHEN $4 THEN \'Sensitive topic needs human review before generation\' ELSE last_error END WHERE workspace_id=$1 AND id=$2',[task.workspace_id,post.id,post.seo,safety.hold]);if(safety.hold)await queueApprovalNotification(db,task.workspace_id,page,post,{force:true});});if(safety.hold)return {postId:post.id,hold:true,message:'Sensitive story routed to HIGH_ALERT_MANUAL_REVIEW before inference.'};}
 if(!page.text_connection_id)throw new AppError(400,'Choose a text model on this Page first.');await updateTask(task,15,'Reading source facts and Page instructions');
 const c=await connectionFor(task.workspace_id,page.text_connection_id);
 if(post.type==='news'&&page.creative_policy?.contentFormat==='news_desk_v3'){
  await updateTask(task,20,'Research · reading full reports before newspaper writing');const feeds=await transaction(task.workspace_id,async db=>(await db.query('SELECT * FROM creator.feeds WHERE workspace_id=$1 AND page_id=$2 AND active',[task.workspace_id,page.id])).rows);let additionalSources=[];if(feeds.length&&!post.seo?.reportEvidence?.sources?.some(s=>s.url===post.source_url&&s.text)){const scan=await collectNewsFeeds(task.workspace_id,page.id,feeds);additionalSources=scan.articles.filter(a=>a.url!==post.source_url&&storySimilarity(post.title,a.title)>=.5&&Math.abs(Date.parse(a.date)-Date.parse(post.seo?.research?.sources?.[0]?.publishedAt||new Date()))<2*86400000).sort((a,b)=>a.url.localeCompare(b.url)).slice(0,3);}const enriched=await collectReportEvidence(post,{additionalSources});post.body=enriched.body;post.seo=enriched.seo;
  await transaction(task.workspace_id,db=>db.query('UPDATE creator.posts SET body=$3,seo=$4,title=$6 WHERE workspace_id=$1 AND id=$2 AND version=$5',[task.workspace_id,post.id,post.body,post.seo,post.version,post.title]));
  const fullSafety=preflightContent(post,prior,page.creative_policy);
  if(fullSafety.hold){post.seo={...post.seo,safety:{...post.seo.safety,requiresHuman:true,matches:fullSafety.matches,fingerprint:fullSafety.fingerprint}};await transaction(task.workspace_id,async db=>{await db.query("UPDATE creator.posts SET seo=$3,status='review',last_error='Full-source safety check requires human review before writing' WHERE workspace_id=$1 AND id=$2",[task.workspace_id,post.id,post.seo]);await queueApprovalNotification(db,task.workspace_id,page,post,{force:true});});return {postId:post.id,hold:true,message:'Sensitive material found in the complete source report; human review required.'};}
 }
 const snapshot=await transaction(task.workspace_id,async db=>(await db.query('SELECT records FROM creator.insight_snapshots WHERE workspace_id=$1 AND page_id=$2 ORDER BY observed_at DESC LIMIT 1',[task.workspace_id,page.id])).rows[0]);
 const guidance=snapshot?summarizeInsights(snapshot.records,page.timezone):null;
 if(post.type==='reel'){
  await updateTask(task,30,'Writing a Bengali voiceover and scene-by-scene 9:16 storyboard');const metrics=[];
  const result=await generateStoryboard({page,post,connection:c,secret:c.secret},{onMetrics:m=>metrics.push(m)});
  const caption=result.storyboard.map(s=>s.voiceover_text_bengali).join(' ');
  await transaction(task.workspace_id,async db=>{const saved=await db.query("UPDATE creator.posts SET caption=$3,seo=seo||$4::jsonb,status='review',version=version+1,approved_version=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$5 AND status IN ('draft','review','approved','failed')",[task.workspace_id,post.id,caption,{storyboard:result.storyboard,editorialWarnings:result.warnings,inferenceRuns:metrics},post.version]);if(!saved.rowCount)throw new AppError(409,'The video brief changed during generation.');});return {postId:post.id,message:'Storyboard saved. Configure media and narration, then render the Reel.'};
 }
 const compact=c.provider==='ollama'&&inferenceSettings(c.config).name==='windows_safe';
 await updateTask(task,35,'Model generating caption; waiting for inference');
 const inferenceRuns=[],onMetrics=metrics=>inferenceRuns.push(metrics);
 const productFocus=product?await selectProductFocus({product,connection:c,secret:c.secret},{onMetrics}):null;
 const bundled=bundleEnabled(page,post),report=post.type==='news'&&page.creative_policy?.contentFormat==='news_desk_v3';
 const generated=await (report?generateNewsReport:bundled?generateContentBundle:generateFactualCaption)({page,post,product,connection:c,secret:c.secret,compact,insights:guidance?.sampleSize>=5?guidance.recommendation:null},{deferSocial:report&&page.website_publishing&&!page.require_review&&task.input.pipeline?.autoPublish===true,onMetrics,onCorrection:()=>updateTask(task,45,'Checking source quantities and correcting unsupported claims'),savedDraft:post.seo?.bundleDraft,onProgress:(part,total,detail)=>updateTask(task,detail?.report?10+Math.round(part/total*55):20+part*15+(detail?.paragraph?detail.paragraph*3:0),(detail?.report?'News desk · '+(detail.stage==='quality'?'checking full-report completeness and originality ':detail.stage==='verify'?'independent source check ':detail.stage==='repair'?'correcting evidence section ':'writing evidence section '):'Echotent · writing content section ')+part+' of '+total+(detail?.paragraph?' · article paragraph '+detail.paragraph+' of '+detail.paragraphs:'')+(detail?.checks?.length?' · '+detail.checks[0].slice(0,180):'')),onSection:draft=>transaction(task.workspace_id,async db=>{const saved=await db.query("UPDATE creator.posts SET seo=jsonb_set(seo,'{bundleDraft}',$3::jsonb) WHERE workspace_id=$1 AND id=$2 AND version=$4 AND status IN ('draft','review','approved','failed')",[task.workspace_id,post.id,JSON.stringify(draft),post.version]);if(!saved.rowCount)throw new AppError(409,'The draft changed during section preparation.');})});
 if(generated.hold){await transaction(task.workspace_id,db=>db.query("UPDATE creator.posts SET status='review',last_error=$3 WHERE workspace_id=$1 AND id=$2",[task.workspace_id,post.id,generated.message]));return {postId:post.id,hold:true,message:generated.message};}
 const {caption,notes,facts,warnings,initialWarnings}=generated;
 if(caption.length<60&&!generated.article)throw new AppError(422,'The model returned too little content. Choose a more capable model or edit the draft manually.');
 let instagramCaption,instagramWarnings=[];
 const instagramEnabled=await transaction(task.workspace_id,async db=>(await db.query("SELECT id FROM creator.social_destinations WHERE workspace_id=$1 AND page_id=$2 AND enabled AND platform='instagram'",[task.workspace_id,page.id])).rowCount>0);
 if(generated.instagramCaption){instagramCaption=generated.instagramCaption;}
 else if(instagramEnabled&&!generated.article?.socialPending&&!generated.article?.needsReview){
  if(compact&&page.creative_policy?.captionGeneration!=='separate'){
   instagramCaption=formatInstagramCaption(caption,page);notes.push('Efficient channel mode: Instagram layout derives from the same caption; separate AI instructions are used only in independent mode.');
  }else{
  await updateTask(task,60,'Adapting the same source facts to the Instagram caption style');
  const result=await generateFactualCaption({page,post,product,connection:c,secret:c.secret,compact,channel:'instagram'},{onMetrics,onCorrection:()=>updateTask(task,70,'Checking Instagram source facts before saving')});
  if(result.caption.length<60||result.caption.length>2200)throw new AppError(422,'The Instagram caption needs editing: use 60–2200 characters.');
  instagramCaption=result.caption;instagramWarnings=result.warnings;notes.push(...result.notes);
  }
 }
 await updateTask(task,85,generated.article?.socialPending?'Saving the checked full report; Facebook copy waits for its live website URL':'Saving channel captions together for the same calendar slot');
 if(product)post.seo={...post.seo,productFingerprint:productFingerprint(product)};
  await transaction(task.workspace_id,async client=>{
 const seo={...post.seo,...(generated.newsroomAudit?{newsroomAudit:generated.newsroomAudit}:{}),...(productFocus?{productFocus}:{}),...(product&&page.creative_policy?.commerce?.includePrice&&product.price!=null?{priceSnapshot:{amount:Number(product.price),currency:product.currency}}:{}),...(generated.article?{article:generated.article,commentText:generated.commentText}:{}),...(generated.designBrief?{designBrief:generated.designBrief,priceSnapshot:generated.priceSnapshot}:{}),inferenceRuns,channelCaptions:instagramCaption?{instagram:instagramCaption}:{},title:post.title.slice(0,60),description:caption.replace(/#[\p{L}\p{M}\p{N}_]+/gu,'').trim().slice(0,160),hashtags:caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)||[],alt:product?.title||post.title,language:page.language,editorialWarnings:[...warnings,...instagramWarnings.map(w=>'Instagram: '+w)],editorialProfile:{version:EDITORIAL_VERSION,revision:page.creative_policy?.editorialMemory?.revision||0,referenceAnalyzedAt:page.creative_policy?.referenceAnalysis?.analyzedAt||null},generationNotes:notes};
  if(product)delete seo.priceSnapshot;
  delete seo.bundleDraft;delete seo.rebuildReport;
  const updated=await client.query("UPDATE creator.posts SET caption=$3,title=COALESCE($6,title),status='review',approved_version=NULL,last_error=NULL,version=version+1,updated_at=now(),seo=$5 WHERE workspace_id=$1 AND id=$2 AND version=$4 AND status IN ('draft','review','approved','failed') RETURNING id",[task.workspace_id,post.id,caption,post.version,seo,generated.title||null]);
  if(!updated.rowCount)throw new AppError(409,'The draft changed while the model worked. Generate again from the current version.');
  const currentPolicy=(await client.query('SELECT creative_policy FROM creator.pages WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[task.workspace_id,page.id])).rows[0].creative_policy;
  await client.query('UPDATE creator.pages SET creative_policy=$3 WHERE workspace_id=$1 AND id=$2',[task.workspace_id,page.id,recordEditorialQuality(currentPolicy,{type:post.type,language:page.language,warnings:seo.editorialWarnings,observedWarnings:[...initialWarnings,...seo.editorialWarnings],corrected:notes.some(n=>n.includes('correction pass'))})]);
  await audit(client,task.workspace_id,null,'post.generated','post',post.id);
 });return {postId:post.id,message:'Caption saved for factual review.'};
}
async function writeArticle(task){
 const {post,page}=await transaction(task.workspace_id,async db=>({post:await row(db,'posts',task.workspace_id,task.post_id),page:await row(db,'pages',task.workspace_id,task.page_id)}));
 if(post.type!=='news'||!page.website_publishing) return {postId:post.id,message:'Website article is not required for this Page.'};
 if(!['draft','review','approved','failed'].includes(post.status)||post.deleted_at||post.archived_at)throw new AppError(409,'The post changed before website article preparation.');
 const c=await connectionFor(task.workspace_id,page.text_connection_id),metrics=[];
 const article=await generateNewsArticle({post,page,connection:c,secret:c.secret},{savedDraft:post.seo.articleDraft,onMetrics:m=>metrics.push(m),onProgress:(part,total)=>updateTask(task,10+part*30,'News desk · writing website article section '+part+' of '+total),onSection:draft=>transaction(task.workspace_id,async db=>{const saved=await db.query("UPDATE creator.posts SET seo=jsonb_set(seo,'{articleDraft}',$3::jsonb) WHERE workspace_id=$1 AND id=$2 AND version=$4 AND status IN ('draft','review','approved','failed')",[task.workspace_id,post.id,JSON.stringify(draft),post.version]);if(!saved.rowCount)throw new AppError(409,'The article changed while writing. Continue from the current version.');})});
 await transaction(task.workspace_id,async db=>{const seo={...post.seo,article,inferenceRuns:[...(post.seo.inferenceRuns||[]),...metrics],editorialWarnings:[...(post.seo.editorialWarnings||[]).filter(w=>!w.startsWith('Website article: ')),...article.warnings.map(w=>'Website article: '+w)]};delete seo.articleDraft;
 const result=await db.query("UPDATE creator.posts SET seo=$3,status='review',approved_version=NULL,last_error=NULL,version=version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$4 AND status IN ('draft','review','approved','failed') RETURNING id",[task.workspace_id,post.id,seo,post.version]);if(!result.rowCount)throw new AppError(409,'The article changed before it could be saved.');});
 return {postId:post.id,words:article.wordCount,message:article.needsReview?'Article saved with editorial checks to review.':'Full website article saved separately from the social caption.'};
}
async function creative(task){
 await inferenceIdle.releaseIdle(true);
 const {post,page,product}=await transaction(task.workspace_id,async client=>{const post=await row(client,'posts',task.workspace_id,task.post_id);if(['published','publishing','unknown','scheduled','ready_manual'].includes(post.status))throw new AppError(409,'Move the post to draft first.');return {post,page:await row(client,'pages',task.workspace_id,post.page_id),product:post.product_id?await row(client,'products',task.workspace_id,post.product_id):null};});
 if(task.input.pipeline?.ruleId){const rule=await transaction(task.workspace_id,db=>row(db,'automation_rules',task.workspace_id,task.input.pipeline.ruleId));if(!rule.enabled)return {postId:post.id,hold:true,message:'Automation paused before website/social preparation; no new delivery submitted.'};}
 if(task.input.pipeline?.autoPublish&&post.type==='news'&&post.seo?.article?.policyVersion==='news_desk_v3'&&page.creative_policy?.contentFormat==='news_desk_v3'&&page.website_publishing&&page.active&&!page.require_review&&env().publishing&&!criticalEditorialWarnings(post.seo?.editorialWarnings).length&&!post.seo?.safety?.requiresHuman){
  if(!post.seo?.article?.text)throw new AppError(409,'Write the complete website report before designing its news card.');
  const site=await transaction(task.workspace_id,db=>row(db,'websites',task.workspace_id,page.website_id)),connection=await connectionFor(task.workspace_id,site.connection_id);
  await websiteBeforeDesign({task,page,post,site,connection},{updateTask});
 }
 if(post.type==='news'&&post.seo?.article?.socialPending){const connection=await connectionFor(task.workspace_id,page.text_connection_id);await prepareNewsSocial({task,page,post,connection},{updateTask});}
 if(task.input.reuseAsset&&post.creative.assetId)return {postId:post.id,message:'Existing verified product image retained; updated copy can be scheduled.'};
 await updateTask(task,15,product?'Analysing product category, verified specifications and visual direction':'Preparing brand, format and source photo');let background,sourcePhoto,cutoutQuality,cutout='not-requested',backgroundMethod='designed-studio';const warnings=[],policy=page.creative_policy||{};
 if(product?.image_url&&policy.removeBackground!==false){await updateTask(task,25,'Isolating the real product and checking its edges and full silhouette');const response=await outbound(product.image_url,{maxBytes:12_000_000});if(!response.ok)throw new AppError(502,'The catalog product photo could not be downloaded.');sourcePhoto=response.bytes;try{const result=await removeProductBackground(sourcePhoto,{product});sourcePhoto=result.bytes;cutout=result.method;cutoutQuality=result.quality;}catch(error){cutout='original-photo';warnings.push(error instanceof AppError?error.message:'Background removal unavailable; original photo retained.');}}
 if((product||task.input.aiBackground)&&(task.input.aiBackground||policy.backgroundMode==='ai'||policy.backgroundMode!=='studio'&&page.image_connection_id)){
  if(!page.image_connection_id){if(task.input.aiBackground)throw new AppError(400,'Choose an image tool on this Page.');warnings.push('Connect an image model for AI-generated backdrops. Designed studio background used.');}
  else{const c=await connectionFor(task.workspace_id,page.image_connection_id);await updateTask(task,45,'Generating an empty studio background with the image model');try{background=await imageGeneration(c,c.secret,backgroundPrompt(page,post,product));backgroundMethod='ai-generated';}catch(error){warnings.push('The image provider was unavailable. Designed studio background used.');}}
 }
 let brandLogo;const logoId=logoAssetFor(page,product);if(logoId){const logo=await transaction(task.workspace_id,db=>row(db,'assets',task.workspace_id,logoId));brandLogo=await readFile(logo.path);}
 await updateTask(task,65,'Composing real photo, shaped typography and original brand logo');const site=page.website_id?await transaction(task.workspace_id,db=>row(db,'websites',task.workspace_id,page.website_id)):null;const image=await renderCreative({post,page,product,background,sourcePhoto,brandLogo,website:site}),asset=await saveAsset(task.workspace_id,post.id,image);
 await transaction(task.workspace_id,async client=>{
  const result=await client.query("UPDATE creator.posts SET creative=creative||$3::jsonb,last_error=NULL,status='review',approved_version=NULL,version=version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$4 AND status IN ('draft','review','approved','failed') RETURNING id",[task.workspace_id,post.id,JSON.stringify({assetId:asset.id,designVariant:image.designVariant,designVersion:image.designVersion,headlineHighlight:image.headlineHighlight,highlightColor:image.highlightColor,productAnalysis:image.analysis,photoMode:image.photoMode,photoQuality:cutoutQuality||image.photoQuality,heroBounds:image.heroBounds,backgroundMethod,cutout,warnings}),post.version]);if(!result.rowCount)throw new AppError(409,'The post changed while the creative was being prepared.');
  await client.query('INSERT INTO creator.assets(id,workspace_id,post_id,path,mime,width,height) VALUES($1,$2,$3,$4,$5,$6,$7)',[asset.id,task.workspace_id,post.id,asset.path,asset.mime,asset.width,asset.height]);
 });return {assetId:asset.id,width:asset.width,height:asset.height,backgroundMethod,cutout,warnings};
}
async function renderReel(task){
 const {post,page}=await transaction(task.workspace_id,async db=>({post:await row(db,'posts',task.workspace_id,task.post_id),page:await row(db,'pages',task.workspace_id,task.page_id)}));
 if(post.type!=='reel'||!['draft','review','approved','failed'].includes(post.status)||post.deleted_at||post.archived_at)throw new AppError(409,'Open an editable Reel draft first.');
 const storyboard=post.seo.storyboard;if(!storyboard)throw new AppError(400,'Generate the storyboard first.');const config=page.creative_policy?.reels||{},media=post.seo.reelMedia||{},images=[];
 await inferenceIdle.releaseIdle(true);await updateTask(task,15,'Preparing licensed scene media and Bengali narration');
 const stock=config.stockConnectionId?await connectionFor(task.workspace_id,config.stockConnectionId):null;
 for(let i=0;i<storyboard.length;i++){const image=media.imageURLs?.[i]?{url:media.imageURLs[i],credit:'Admin-supplied licensed media'}:stock?await searchStockImage(stock,stock.secret,storyboard[i].visual_asset_search_query):null;if(!image)throw new AppError(400,'Connect Pexels/Pixabay or provide one permitted image URL per scene in the Reel editor.');const r=await outbound(publicURL(image.url).href,{maxBytes:6_000_000});if(!r.ok)throw new AppError(502,'A scene image could not be downloaded.');images.push({...image,bytes:r.bytes});}
 let audio;if(media.audioURL){const r=await outbound(publicURL(media.audioURL).href,{maxBytes:8_000_000});if(!r.ok)throw new AppError(502,'Voiceover audio could not be downloaded.');audio=r.bytes;}else if(config.ttsConnectionId){const tts=await connectionFor(task.workspace_id,config.ttsConnectionId);audio=await synthesizeNarration(tts,tts.secret,storyboard.map(s=>s.voiceover_text_bengali).join(' '));}else throw new AppError(400,'Choose a speech connection or provide a permitted voiceover audio URL.');
 const styledPage=await resolvePageFonts(page);const logo=page.brand?.logoAssetId?await transaction(task.workspace_id,db=>row(db,'assets',task.workspace_id,page.brand.logoAssetId)):null;
 const video=await renderVerticalVideo({storyboard,images,audio,page,brandLogo:logo?await readFile(logo.path):null,fontFamily:styledPage.designFonts?.headline?.family||'Noto Sans Bengali',fontPath:styledPage.designFonts?.headline?.path||fileURLToPath(new URL('../assets/fonts/NotoSansBengali.ttf',import.meta.url)),onProgress:(i,total)=>updateTask(task,30+Math.round(i/total*50),'Rendering vertical scene '+i+' of '+total+' with FFmpeg')});
 const asset=await saveAsset(task.workspace_id,post.id,video);
 await transaction(task.workspace_id,async db=>{const saved=await db.query("UPDATE creator.posts SET creative=creative||$3::jsonb,seo=jsonb_set(seo,'{mediaCredits}',$4::jsonb),status='review',version=version+1,approved_version=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$5 AND status IN ('draft','review','approved','failed')",[task.workspace_id,post.id,{assetId:asset.id,mime:'video/mp4',ratio:'9:16',duration:video.duration},JSON.stringify(video.credits),post.version]);if(!saved.rowCount)throw new AppError(409,'The Reel changed during rendering.');await db.query('INSERT INTO creator.assets(id,workspace_id,post_id,path,mime,width,height) VALUES($1,$2,$3,$4,$5,$6,$7)',[asset.id,task.workspace_id,post.id,asset.path,asset.mime,asset.width,asset.height]);});return {postId:post.id,assetId:asset.id,message:'Vertical video and narration rendered for review.'};
}
async function importProducts(task){
 const website=await transaction(task.workspace_id,client=>row(client,'websites',task.workspace_id,task.input.websiteId));if(website.kind!=='ecommerce')throw new AppError(400,'Product import requires an ecommerce website.');
 const c=website.connection_id?await connectionFor(task.workspace_id,website.connection_id):null;
 if(c&&c.provider!==website.connector)throw new AppError(400,'The website connector and connection must match.');
 const excludeIds=(await transaction(task.workspace_id,db=>db.query('SELECT external_id FROM creator.products WHERE workspace_id=$1 AND website_id=$2',[task.workspace_id,website.id]))).rows.map(p=>p.external_id);
 await updateTask(task,25,'Fetching the next unseen catalog batch (up to 100 products)');const products=await fetchProducts(website,c?.secret,c,{excludeIds});
 await updateTask(task,75,'Saving product facts and photo references');
 await transaction(task.workspace_id,async client=>{for(const p of products)await client.query(`INSERT INTO creator.products(workspace_id,website_id,external_id,title,description,url,image_url,price,compare_at_price,currency,available,attributes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(website_id,external_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,url=EXCLUDED.url,image_url=EXCLUDED.image_url,price=EXCLUDED.price,compare_at_price=EXCLUDED.compare_at_price,currency=EXCLUDED.currency,available=EXCLUDED.available,attributes=EXCLUDED.attributes,fetched_at=now()`,[task.workspace_id,website.id,p.external_id,p.title,p.description,p.url,p.image_url,p.price,p.compare_at_price,p.currency,p.available,p.attributes]);});
 if(task.input.refreshRuleId)await transaction(task.workspace_id,db=>db.query("UPDATE creator.automation_rules SET next_run_at=CASE WHEN $3::boolean THEN now() ELSE now()+interval '1 minute'*interval_minutes END,refill_until=CASE WHEN $3::boolean THEN refill_until ELSE NULL END WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.input.refreshRuleId,products.length>0]));
 return {imported:products.length,message:products.length?'Next unseen catalog batch imported; source history retained.':'No unseen products remain in this catalog. Published history is retained.'};
}
async function aggregate(task){
 const {page,feeds,recent}=await transaction(task.workspace_id,async client=>({page:await row(client,'pages',task.workspace_id,task.page_id),feeds:(await client.query('SELECT * FROM creator.feeds WHERE workspace_id=$1 AND page_id=$2 AND active ORDER BY id',[task.workspace_id,task.page_id])).rows,recent:(await client.query("SELECT title,source_hash,seo->>'category' AS category FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND created_at>now()-interval '3 days' ORDER BY created_at DESC LIMIT 500",[task.workspace_id,task.page_id])).rows}));
 if(page.kind!=='news'||!page.aggregation_enabled)throw new AppError(400,'Enable aggregation on a news Page first.');
 if(!page.text_connection_id)throw new AppError(400,'Choose this Page’s caption model before ranking news.');
 const connection=await connectionFor(task.workspace_id,page.text_connection_id);
 if(!liveNews(page)){await updateTask(task,5,'Checking caption model capacity before reading news feeds');await checkTextCapacity(connection,{purpose:'research'});}
 const scan=await collectNewsFeeds(task.workspace_id,page.id,feeds,(done,total)=>updateTask(task,10+Math.round(30*done/Math.max(1,total)),'Research · reading '+done+' of '+total+' configured feeds'));
 if(scan.failed===feeds.length&&feeds.length)throw new AppError(502,'All active feeds failed, including configured fallbacks.');
 const latest=liveNews(page),cutoff=latest?new Date(Math.max(Date.now()-LIVE_NEWS_MAX_AGE_MS,Date.parse(page.creative_policy?.editorial?.sourceNotBefore)||0)).toISOString():page.creative_policy?.editorial?.sourceNotBefore;
 const clusters=clusterStories(scan.articles),shortlist=shortlistStories(clusters,{recent,categories:page.creative_policy?.newsCategories||[],notBefore:cutoff,latest});
 if(!shortlist.length)return {draftsCreated:0,feedsFailed:scan.failed,message:'No fresh unseen story remains after related-story and exact-URL checks.'};
 await updateTask(task,50,'Research · ranking '+shortlist.length+' story clusters from '+scan.feedsRead+' feeds');
 const metrics=[];
 const selection=latest?{story:shortlist[0],method:'latest',reason:'Newest unseen source publication first; factual and crisis checks remain mandatory.'}:shortlist.some(s=>crisisMatches(s.primary.title+' '+s.primary.body,page.creative_policy?.sensitiveKeywords).length)?{story:shortlist[0],method:'balanced_safety',reason:'Keyword safety pre-pass kept sensitive research out of model ranking.'}:await rankStories(shortlist,{page,connection,onMetrics:m=>metrics.push(m)});
 const {article,research}=await researchStory(selection,{onProgress:n=>updateTask(task,65+n*5,'Research · reading related report '+n+' (up to two)')});
 research.feedsRead=scan.feedsRead;research.feedsFailed=scan.failed;research.candidatesScanned=scan.articles.length;research.clustersFound=clusters.length;research.inferenceRuns=metrics;
 // Check every related URL, including archived/trashed fingerprints, in the same
 // Page transaction. Normal worker source preparation is serialized.
 const hashes=selection.story.articles.map(a=>articleHash(a.url));
 const inserted=await transaction(task.workspace_id,async db=>{await workspaceLock(db,task.workspace_id);
  if((await db.query('SELECT id FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND source_hash=ANY($3::text[]) LIMIT 1',[task.workspace_id,page.id,hashes])).rowCount)return null;
  const prior=(await db.query("SELECT title FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND created_at>now()-interval '3 days' ORDER BY created_at DESC LIMIT 500",[task.workspace_id,page.id])).rows;
  if(!shortlistStories([selection.story],{recent:prior,notBefore:cutoff,latest}).length)return null;
  return(await db.query(`INSERT INTO creator.posts(workspace_id,page_id,type,title,body,source_url,source_hash,creative,seo) VALUES($1,$2,'news',$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id`,[task.workspace_id,page.id,article.title,article.body,article.url,articleHash(article.url),{sourceImage:article.image,ratio:'4:5',style:'editorial'},{category:categoryFor(article),research}])).rows[0];
 });
 return {postId:inserted?.id,draftsCreated:inserted?1:0,feedsFailed:scan.failed,message:inserted?'Ranked story selected; research evidence saved privately with this draft.':'This story was already selected; the next refill will check another cluster.'};
}
async function analyzePageReferences(task){
 const page=await transaction(task.workspace_id,db=>row(db,'pages',task.workspace_id,task.page_id)),connection=await connectionFor(task.workspace_id,page.text_connection_id);
 const analysis=await analyzeReferences(page,connection,{onProgress:phase=>updateTask(task,50,phase)});
 await transaction(task.workspace_id,async db=>{await workspaceLock(db,task.workspace_id);const current=await row(db,'pages',task.workspace_id,page.id);if(referenceFingerprint(current.creative_policy)!==analysis.fingerprint)throw new AppError(409,'References changed during analysis. Analyze the saved references again.');await db.query('UPDATE creator.pages SET creative_policy=$3 WHERE workspace_id=$1 AND id=$2',[task.workspace_id,page.id,{...current.creative_policy,referenceAnalysis:analysis}]);await audit(db,task.workspace_id,null,'page.references_analyzed','page',page.id);});
 return {message:'Reference style principles saved. Unreadable social links require your notes.',sources:analysis.sources};
}

async function publish(task){
 if(!env().publishing)throw new AppError(409,'Live publishing is disabled in this local environment. Use dry-run, then ask the owner to enable a reviewed publishing test.');
 await updateTask(task,5,'Checking current product availability and saved campaign facts');await preflightProduct(task.workspace_id,task.post_id);
 const w=task.workspace_id;let state;
 await transaction(w,async client=>{
  await workspaceLock(client,w);const account=(await client.query('SELECT a.status FROM creator.workspaces w JOIN creator.accounts a ON a.id=w.owner_id WHERE w.id=$1',[w])).rows[0];if(account.status!=='active')throw new AppError(403,'Workspace owner account is suspended.');
  const post=await row(client,'posts',w,task.post_id),page=await row(client,'pages',w,post.page_id);
  const clean=cleanPublicCopy(post.caption);if(clean.removed.length){if(clean.caption.length<60)throw new AppError(409,'Audience caption needs editing after removing internal delivery instructions.');post.caption=clean.caption;await client.query('UPDATE creator.posts SET caption=$3 WHERE workspace_id=$1 AND id=$2',[w,post.id,post.caption]);}
  if(!['approved','scheduled'].includes(post.status))throw new AppError(409,'The post must be approved or scheduled.');
  await publishGate(client,w,page,post,{execution:true});await reservePublication(client,w,post.id);
  if(!page.fb_verified||!page.facebook_connection_id||!page.fb_page_id)throw new AppError(409,'Verify this Page connection before publishing.');
  await client.query("INSERT INTO creator.publish_attempts(workspace_id,post_id,task_id) VALUES($1,$2,$3)",[w,post.id,task.id]);
  await client.query("UPDATE creator.posts SET status='publishing',updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,post.id]);state={post,page};
 });
 // Track submissions independently: a definite website rejection has no Facebook side effect.
 // Lost submitted responses are held; confirmed destination receipts remain intact.
 let websiteSubmitted=false,websiteConfirmed=false,facebookSubmitted=false,facebookConfirmed=false;const stage=state.page.website_publishing&&['news','blog'].includes(state.post.type)?'website':'facebook';
 try{
  const {post,page}=state;await deliveryState(task,'facebook','pending',{phase:'Waiting for website stage'});
  if(page.website_publishing&&['news','blog'].includes(post.type)){
   await updateTask(task,15,'Website · validating the article schema and destination');await deliveryState(task,'website','running',{phase:'Validating and publishing article'});
   const site=await transaction(w,client=>row(client,'websites',w,page.website_id));if(!['wordpress','nobleseek_db'].includes(site.connector))throw new AppError(400,'This website connector does not support publication.');
   const sc=await connectionFor(w,site.connection_id);let wp;
   if(post.website_url)wp={link:post.website_url,slug:'echolink-'+post.id};
   else if(site.connector==='nobleseek_db')wp=await writeNoble(sc,sc.secret,{...site,imageCredit:page.creative_policy?.editorial?.imageCredit},post,{onWrite:()=>{websiteSubmitted=true;}});
   else{
    const headers={authorization:'Basic '+Buffer.from((sc.secret.username||'')+':'+(sc.secret.password||'')).toString('base64')},base=publicURL(site.url).origin,slug='echolink-'+post.id;
    const existing=await remoteJSON(base+'/wp-json/wp/v2/posts?slug='+slug,{headers});
    if(existing[0])wp=existing[0];else{websiteSubmitted=true;wp=await remoteJSON(base+'/wp-json/wp/v2/posts',{method:'POST',headers:{...headers,'content-type':'application/json'},body:{title:post.title,content:'<p>'+String(post.seo?.article?.text||post.caption).replace(/[<>&]/g,x=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[x])).replace(/\n/g,'</p><p>')+'</p>',status:'publish',slug}});}
   }
   websiteConfirmed=true;await deliveryState(task,'website','confirmed',{phase:'Article committed to website database',url:wp.link,remoteId:wp.slug||String(wp.id||'')});
   await transaction(w,client=>client.query('UPDATE creator.posts SET website_url=$3 WHERE workspace_id=$1 AND id=$2',[w,post.id,publicURL(wp.link).href]));
   await updateTask(task,35,'Website · article saved; verifying it on the live domain');if(site.connector==='nobleseek_db')await verifyNoblePublic(site,wp.slug||'echolink-'+post.id,{expectedText:post.seo?.article?.generationVersion==='newsroom-v4'?post.seo.article.text:undefined});await deliveryState(task,'website','confirmed',{phase:'Live website article verified',url:wp.link});
   await updateTask(task,50,'Website confirmed live · preparing Facebook');
  }
  else await deliveryState(task,'website','skipped',{phase:'Website publishing disabled for this post'});
  await updateTask(task,55,'Facebook · checking this Page’s saved authorization');const c=await connectionFor(w,page.facebook_connection_id),identity=await facebookIdentity(c);if(identity.id!==page.fb_page_id)throw new AppError(400,'The token belongs to another Page.');
  await deliveryState(task,'facebook','running',{phase:'Preparing media and caption'});await updateTask(task,65,'Facebook · uploading image and publishing caption');let response;
  if(post.creative.assetId){
   const asset=await transaction(w,client=>row(client,'assets',w,post.creative.assetId)),bytes=await readFile(asset.path),form=new FormData();const video=asset.mime==='video/mp4';form.set(video?'description':'caption',post.caption);form.set('source',new Blob([bytes],{type:asset.mime}),video?'creative.mp4':'creative.jpg');
   const request=new Request('https://example.com',{method:'POST',body:form});facebookSubmitted=true;response=await remoteJSON(graph(c)+'/'+page.fb_page_id+(asset.mime==='video/mp4'?'/videos':'/photos'),{method:'POST',headers:{authorization:'Bearer '+c.secret.token,'content-type':request.headers.get('content-type')},body:Buffer.from(await request.arrayBuffer()),maxBytes:1000000});
  }else{facebookSubmitted=true;response=await remoteJSON(graph(c)+'/'+page.fb_page_id+'/feed',{method:'POST',headers:{authorization:'Bearer '+c.secret.token,'content-type':'application/json'},body:{message:post.caption}});}
  const remoteId=response.post_id||response.id;if(!remoteId)throw new Error('Missing remote ID');facebookConfirmed=true;
  await deliveryState(task,'facebook','confirmed',{phase:'Facebook publication confirmed',remoteId,url:'https://www.facebook.com/'+remoteId});await updateTask(task,90,'Facebook confirmed · recording delivery and delayed comments');
  await transaction(w,async client=>{await client.query("UPDATE creator.posts SET status='published',fb_post_id=$3,published_at=now(),updated_at=now(),last_error=NULL WHERE workspace_id=$1 AND id=$2",[w,post.id,remoteId]);await client.query("UPDATE creator.publish_attempts SET outcome='published',remote_id=$3 WHERE workspace_id=$1 AND task_id=$2",[w,task.id,remoteId]);await client.query("UPDATE creator.usage_reservations SET status='consumed',updated_at=now() WHERE workspace_id=$1 AND post_id=$2",[w,post.id]);await audit(client,w,null,'post.published','post',post.id,{remoteId});await client.query('SAVEPOINT optional_instagram');try{await queueInstagramDelivery(client,w,page,post);}catch{await client.query('ROLLBACK TO SAVEPOINT optional_instagram');await audit(client,w,null,'post.instagram_queue_failed','post',post.id,{message:'Facebook published; the optional Instagram delivery could not be queued.'});}finally{await client.query('RELEASE SAVEPOINT optional_instagram');}await client.query('SAVEPOINT optional_link_comment');try{await queueLinkComment(client,w,page,post);}catch{await client.query('ROLLBACK TO SAVEPOINT optional_link_comment');await audit(client,w,null,'post.link_comment_queue_failed','post',post.id,{message:'The post was published, but its optional link comment could not be queued.'});}finally{await client.query('RELEASE SAVEPOINT optional_link_comment');}});
  return {postId:post.id,remoteId,message:'Published. Optional website link comments follow this Page’s delivery settings.'};
 }catch(error){const failureState=publicationFailure(error,{websiteSubmitted,websiteConfirmed,facebookSubmitted,facebookConfirmed,stage}),uncertain=failureState.unknown;
  const destination=websiteConfirmed&&!facebookSubmitted?'facebook':failureState.destination;
  // A confirmed website article remains visible even when live verification or Facebook fails.
  if(!facebookConfirmed&&!(websiteConfirmed&&destination==='website'))await deliveryState(task,destination,uncertain?'unknown':'failed',{phase:failureState.message,error:failureState.message});
  if(destination==='website'&&!facebookSubmitted)await deliveryState(task,'facebook','skipped',{phase:uncertain?'Not submitted · website needs reconciliation':'Not submitted · website stage failed'});
  await transaction(w,async client=>{await client.query('UPDATE creator.posts SET status=$4,last_error=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2',[w,task.post_id,failureState.message,uncertain?'unknown':'failed']);await client.query('UPDATE creator.publish_attempts SET outcome=$3 WHERE workspace_id=$1 AND task_id=$2',[w,task.id,uncertain?'unknown':'rejected']);await client.query('UPDATE creator.usage_reservations SET status=$3,updated_at=now() WHERE workspace_id=$1 AND post_id=$2',[w,task.post_id,uncertain?'unknown':'released']);});
  const failure=new AppError(409,failureState.message,uncertain?'publication_unknown':'publication_rejected');if(!uncertain){failure.metaCode=error.metaCode;failure.metaSubcode=error.metaSubcode;}throw failure;}

}
async function verifyPage(task){
 const page=await transaction(task.workspace_id,db=>row(db,'pages',task.workspace_id,task.page_id));if(!page.facebook_connection_id||!page.fb_page_id)throw new AppError(400,'Save the Page ID and Facebook connection first.');
 const c=await connectionFor(task.workspace_id,page.facebook_connection_id),resolved=await resolveFacebookPage({token:c.secret.token,pageId:page.fb_page_id,version:c.config.version});
 await transaction(task.workspace_id,async db=>{await workspaceLock(db,task.workspace_id);const current=await row(db,'pages',task.workspace_id,page.id),credential=await row(db,'connections',task.workspace_id,c.id);if(current.facebook_connection_id!==c.id||current.fb_page_id!==page.fb_page_id||credential.secret_cipher!==c.secret_cipher)throw new AppError(409,'The Page connection changed while verification ran. Verify the current settings again.');await db.query("UPDATE creator.connections SET secret_cipher=$3,status='connected',last_test_at=now(),last_test_result=$4 WHERE workspace_id=$1 AND id=$2",[task.workspace_id,c.id,encryptSecret({token:resolved.token},task.workspace_id),resolved.result]);await db.query('UPDATE creator.pages SET fb_verified=true WHERE workspace_id=$1 AND id=$2',[task.workspace_id,page.id]);});return resolved.result;
}
async function manualHandoff(task){
 await transaction(task.workspace_id,async db=>{await workspaceLock(db,task.workspace_id);const post=await row(db,'posts',task.workspace_id,task.post_id),page=await row(db,'pages',task.workspace_id,task.page_id);if(page.destination_type!=='facebook_profile')throw new AppError(409,'This task is only for a personal-profile handoff.');if(post.status==='ready_manual')return;if(post.status!=='scheduled')throw new AppError(409,'This handoff was canceled or changed.');await publishGate(db,task.workspace_id,page,post);await db.query("UPDATE creator.posts SET status='ready_manual',updated_at=now() WHERE workspace_id=$1 AND id=$2",[task.workspace_id,post.id]);await audit(db,task.workspace_id,null,'post.profile_handoff_ready','post',post.id);});return {message:'Caption and image are ready. Publish them manually on your profile, then confirm the Facebook post link. No Facebook post was submitted by EchoLink.'};
}
async function syncInsights(task){
 const page=await transaction(task.workspace_id,db=>row(db,'pages',task.workspace_id,task.page_id));if(page.destination_type==='facebook_profile')throw new AppError(400,'Import your own profile metrics; the Page insights API does not support this destination.');if(!page.fb_verified||!page.facebook_connection_id)throw new AppError(409,'Connect this Facebook Page first.');
 const c=await connectionFor(task.workspace_id,page.facebook_connection_id);await updateTask(task,15,'Reading connected Facebook and Instagram reporting capabilities');
 const reports=await collectSocialReports({page,connection:c,token:c.secret.token,days:task.input.days||7,onProgress:phase=>updateTask(task,50,phase)});
 await transaction(task.workspace_id,async db=>{for(const report of reports)await db.query('INSERT INTO creator.analytics_reports(workspace_id,page_id,platform,report) VALUES($1,$2,$3,$4)',[task.workspace_id,page.id,report.platform,report]);await db.query("INSERT INTO creator.insight_snapshots(workspace_id,page_id,source,records) VALUES($1,$2,'meta',$3)",[task.workspace_id,page.id,JSON.stringify(reports[0].records)]);});
 return {message:'Facebook and Instagram report saved. Unavailable metrics are labelled, not estimated.',sampleSize:reports[0].records.length};
}
const handlers={render_reel:renderReel,notify_approval:task=>sendApprovalNotification(task,{updateTask}),analyze_references:analyzePageReferences,design_page_brand:task=>designPageBrand(task,{updateTask}),apply_page_brand:task=>applyPageBrand(task,{updateTask}),post_link_comment:task=>sendLinkComment(task,{updateTask}),test_connection:testConnection,verify_page:verifyPage,generate,write_article:writeArticle,creative,import_products:importProducts,aggregate,publish,manual_handoff:manualHandoff,sync_insights:syncInsights,publish_instagram:task=>publishInstagram(task,{updateTask})};
export async function runOne({publishOnly=false,excludePublish=false,taskId=null}={}){
 const task=await transaction(null,async client=>(await client.query(`UPDATE creator.tasks SET status='running',started_at=now(),heartbeat_at=now(),lease_until=now()+interval '8 minutes',phase='Starting',result=CASE WHEN result?'waiting' THEN NULL ELSE result END WHERE id=(SELECT id FROM creator.tasks WHERE status='queued' AND not_before<=now() AND ($3::uuid IS NULL OR id=$3) AND (NOT $1::boolean OR kind IN ('publish','manual_handoff','publish_instagram','post_link_comment','apply_page_brand','notify_approval','sync_insights')) AND (NOT $2::boolean OR kind NOT IN ('publish','manual_handoff','publish_instagram','post_link_comment','apply_page_brand','notify_approval','sync_insights')) ORDER BY CASE WHEN kind IN ('publish','manual_handoff','publish_instagram','post_link_comment','apply_page_brand','notify_approval','sync_insights') THEN 0 WHEN input->>'urgent'='true' THEN 1 WHEN input?'pipeline' AND EXISTS(SELECT 1 FROM creator.pages p WHERE p.id=creator.tasks.page_id AND p.workspace_id=creator.tasks.workspace_id AND p.kind='news' AND p.aggregation_enabled) THEN 2 ELSE 3 END,not_before,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[publishOnly,excludePublish,taskId])).rows[0],{owner:true});
 if(!task)return false;
 try{
  await transaction(task.workspace_id,async client=>{await entitlements(client,task.workspace_id);const account=(await client.query('SELECT a.status FROM creator.accounts a JOIN creator.workspaces w ON w.owner_id=a.id WHERE w.id=$1',[task.workspace_id])).rows[0];if(account.status!=='active')throw new AppError(403,'Account suspended.');});
  if(task.post_id&&['generate','write_article','creative','publish'].includes(task.kind)){const stale=await transaction(task.workspace_id,async db=>newsFreshnessProblem(await row(db,'pages',task.workspace_id,task.page_id),await row(db,'posts',task.workspace_id,task.post_id)));if(stale)throw new AppError(409,stale,'news_stale');}
  if(['generate','write_article','creative','design_page_brand','analyze_references','aggregate'].includes(task.kind)&&freemem()<inferenceSettings().reserveMB*1024*1024)throw resourceWait('Memory reserve protected. Preparation will retry in five minutes; scheduled publishing continues.');
  if((task.input.pipeline||task.input.refreshRuleId)&&startsGeneration(task.kind)){
   const wait=await transaction(task.workspace_id,async db=>{const rule=await row(db,'automation_rules',task.workspace_id,task.input.pipeline?.ruleId||task.input.refreshRuleId),page=await row(db,'pages',task.workspace_id,task.page_id);return generationAvailability(rule,page,await bookings(db,task.workspace_id,page.id,task.post_id),{urgent:task.input.urgent===true});});
   if(!wait.allowed){await transaction(task.workspace_id,db=>db.query("UPDATE creator.tasks SET status='queued',not_before=$3,phase=$4,lease_until=NULL WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,wait.next,wait.message]));return true;}
  }
  const handler=handlers[task.kind];if(!handler)throw new AppError(400,'Unknown task type.');let result;const heartbeat=setInterval(()=>transaction(task.workspace_id,db=>db.query("UPDATE creator.tasks SET heartbeat_at=now(),lease_until=now()+interval '8 minutes' WHERE workspace_id=$1 AND id=$2 AND status='running'",[task.workspace_id,task.id])).catch(()=>{}),15000);try{result=await handler(task);}finally{clearInterval(heartbeat);}await continuePipeline(task,result);await updateTask(task,100,'Complete');await transaction(task.workspace_id,client=>client.query("UPDATE creator.tasks SET status='succeeded',result=$3,finished_at=now(),lease_until=NULL WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,result]));
 }catch(error){const message=error instanceof AppError?error.message:'The task failed. Check the connection configuration and retry from a draft.';
  if(error.code==='news_stale'){await transaction(task.workspace_id,async db=>{await workspaceLock(db,task.workspace_id);const post=await row(db,'posts',task.workspace_id,task.post_id);await holdStaleNews(db,task.workspace_id,post,message);await db.query("UPDATE creator.tasks SET status='canceled',phase=$3,finished_at=now(),lease_until=NULL WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,message]);if(task.input.pipeline?.ruleId)await db.query("UPDATE creator.automation_rules SET next_run_at=now(),refill_until=NULL,last_message='Old source retained for review; collecting current news.' WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.input.pipeline.ruleId]);});return true;}
  const newsHostWait=error.code==='inference_host_wait'&&task.page_id&&await transaction(task.workspace_id,async db=>liveNews(await row(db,'pages',task.workspace_id,task.page_id)));
  if(['inference_resource_wait','inference_host_wait'].includes(error.code)&&(!newsHostWait||(task.input.newsHostRetries||0)<2)){
   const minutes=newsHostWait?1:5,phase=message+' Automatic retry in '+minutes+' minute'+(minutes===1?'':'s')+'.',waiting={code:error.code,...(error.admission?{requiredMB:error.admission.requiredMB,freeMB:error.admission.freeMB,shortfallMB:error.admission.shortfallMB}:{})};
   await transaction(task.workspace_id,db=>db.query("UPDATE creator.tasks SET status='queued',phase=$3,not_before=now()+interval '1 minute'*$5,lease_until=NULL,heartbeat_at=now(),result=$4,input=input||$6::jsonb,events=events||jsonb_build_array(jsonb_build_object('phase',$3::text,'progress',progress,'at',now())) WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,phase,{waiting},minutes,newsHostWait?{newsHostRetries:(task.input.newsHostRetries||0)+1}:{}]));return true;
  }
  if(error.code==='product_refresh_wait'){await transaction(task.workspace_id,db=>db.query("UPDATE creator.tasks SET status='queued',phase=$3,last_error=$3,not_before=now()+interval '15 minutes',lease_until=NULL WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,message]));return true;}
  if(task.kind==='publish_instagram'&&error.code==='instagram_processing'&&(task.input.polls||0)<20){await transaction(task.workspace_id,db=>db.query("UPDATE creator.tasks SET status='queued',phase='Instagram processing image; checking again in 30 seconds',not_before=now()+interval '30 seconds',lease_until=NULL,input=input||$3::jsonb WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,JSON.stringify({polls:(task.input.polls||0)+1})]));return true;}
  if(task.kind==='publish_instagram')await transaction(task.workspace_id,db=>db.query("UPDATE creator.social_deliveries SET status=$3,last_error=$4 WHERE workspace_id=$1 AND post_id=$2 AND platform='instagram' AND status<>'published'",[task.workspace_id,task.post_id,error.code==='publication_unknown'?'unknown':'failed',message]));
  if(task.kind==='design_page_brand')await transaction(task.workspace_id,db=>db.query("UPDATE creator.page_branding SET status='failed',last_error=$3 WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.input.brandingId,message]));
  if(error.metaCode===190&&task.page_id)await transaction(task.workspace_id,async db=>{const page=await row(db,'pages',task.workspace_id,task.page_id);await pauseFacebookPage(db,task.workspace_id,page.id,page.facebook_connection_id,error.message);});
  if(!newsHostWait&&['generate','write_article','creative','aggregate','import_products','sync_insights'].includes(task.kind)&&[502,503,504].includes(error.status)&&(task.input.retries||0)<2){await transaction(task.workspace_id,db=>db.query("UPDATE creator.tasks SET status='queued',phase=$3,last_error=$3,not_before=now()+interval '1 minute',lease_until=NULL,input=input||$4::jsonb WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,'Waiting for the provider; retrying in one minute',JSON.stringify({retries:(task.input.retries||0)+1})]));return true;}
  if(['publish','manual_handoff'].includes(task.kind)&&error.code==='posting_gap'){
   await transaction(task.workspace_id,async db=>{await workspaceLock(db,task.workspace_id);const page=await row(db,'pages',task.workspace_id,task.page_id),latest=(await db.query("SELECT max(published_at) AS at FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status='published'",[task.workspace_id,task.page_id])).rows[0].at,at=new Date(Math.max(Date.now()+15000,+new Date(latest)+page.gap_minutes*60000+1000));await db.query("UPDATE creator.tasks SET status='queued',phase='Waiting for the minimum gap after actual publication',not_before=$3,lease_until=NULL WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,at]);await db.query("UPDATE creator.posts SET scheduled_at=$3,planned_at=$3 WHERE workspace_id=$1 AND id=$2 AND status='scheduled'",[task.workspace_id,task.post_id,at]);});return true;
  }
  if(['publish','manual_handoff'].includes(task.kind)&&['outside_window','daily_cap'].includes(error.code)){
   try{await transaction(task.workspace_id,async db=>{await workspaceLock(db,task.workspace_id);const post=await row(db,'posts',task.workspace_id,task.post_id),page=await row(db,'pages',task.workspace_id,task.page_id);await queuePublication(db,task.workspace_id,null,page,post,{autoPick:true,ignoreTaskId:task.id});await db.query("UPDATE creator.tasks SET status='canceled',phase='Moved to the next available slot',finished_at=now(),lease_until=NULL WHERE id=$1",[task.id]);});return true;}catch{}
  }
  if(['generate','write_article','creative'].includes(task.kind)&&task.post_id)await transaction(task.workspace_id,db=>db.query("UPDATE creator.posts SET last_error=$3 WHERE workspace_id=$1 AND id=$2 AND status IN ('draft','review','approved','failed')",[task.workspace_id,task.post_id,message]));
  await transaction(task.workspace_id,async client=>{await client.query("UPDATE creator.tasks SET status=$3,phase=$4,last_error=$4,finished_at=now(),lease_until=NULL WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,error.code==='publication_unknown'?'unknown':'failed',message]);if(['publish','manual_handoff'].includes(task.kind)){const post=await row(client,'posts',task.workspace_id,task.post_id);if(!['unknown','published'].includes(post.status)){await releasePublication(client,task.workspace_id,post.id);await client.query("UPDATE creator.posts SET status='failed',scheduled_at=NULL,last_error=$3 WHERE workspace_id=$1 AND id=$2",[task.workspace_id,post.id,message]);}}});
  if(task.input.pipeline?.ruleId)await transaction(task.workspace_id,db=>db.query("UPDATE creator.automation_rules SET refill_until=NULL,next_run_at=GREATEST(next_run_at,now()+interval '1 minute'*CASE WHEN EXISTS(SELECT 1 FROM creator.pages p WHERE p.id=creator.automation_rules.page_id AND p.kind='news' AND p.aggregation_enabled) THEN 1 ELSE GREATEST(interval_minutes,15) END),last_message='Preparation failed. The source remains held; the next check will look for another eligible story.' WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.input.pipeline.ruleId]));
 }
 return true;
}
export async function recoverExpiredTasks(){return transaction(null,async client=>{
 const stale=(await client.query("SELECT * FROM creator.tasks WHERE status='running' AND lease_until<now() FOR UPDATE")).rows;
 // Text preparation is resumable and has no external publication side effect.
 // Preserve its post/checkpoints; delivery jobs still require reconciliation.
 for(const task of stale.filter(t=>['generate','write_article'].includes(t.kind)))await client.query("UPDATE creator.tasks SET status='queued',phase='Resuming saved text preparation after an interrupted worker',not_before=now(),started_at=NULL,lease_until=NULL WHERE id=$1",[task.id]);
 for(const task of stale.filter(t=>t.kind==='publish_instagram')){const d=(await client.query("SELECT status FROM creator.social_deliveries WHERE workspace_id=$1 AND post_id=$2 AND platform='instagram'",[task.workspace_id,task.post_id])).rows[0];const uncertain=['publishing','unknown'].includes(d?.status);await client.query("UPDATE creator.tasks SET status=$2,phase=$3,started_at=NULL,lease_until=NULL WHERE id=$1",[task.id,uncertain?'unknown':'queued',uncertain?'Check Instagram before retrying':'Resuming Instagram media preparation']);if(uncertain)await client.query("UPDATE creator.social_deliveries SET status='unknown',last_error='Worker interrupted during Instagram publication; reconcile before retrying.' WHERE workspace_id=$1 AND post_id=$2 AND status<>'published'",[task.workspace_id,task.post_id]);}
 for(const task of stale.filter(t=>t.kind==='apply_page_brand'))await client.query("UPDATE creator.page_branding SET status='unknown',last_error='Worker interrupted during branding update; check Facebook' WHERE workspace_id=$1 AND id=$2 AND status='applying'",[task.workspace_id,task.input.brandingId]);
 for(const task of stale.filter(t=>t.kind==='notify_approval'))await client.query("UPDATE creator.approval_notifications SET status='unknown',last_error='Worker interrupted during notification; check destination' WHERE workspace_id=$1 AND id=$2 AND status='sending'",[task.workspace_id,task.input.notificationId]);
 for(const task of stale.filter(t=>t.kind==='post_link_comment')){await client.query("UPDATE creator.link_comments SET status='unknown',last_error='Worker interrupted during comment submission; check Facebook' WHERE workspace_id=$1 AND id=$2 AND status='publishing'",[task.workspace_id,task.input.commentId]);}
 for(const task of stale.filter(t=>t.kind==='manual_handoff'))await client.query("UPDATE creator.tasks SET status='queued',phase='Resuming profile handoff',started_at=NULL,lease_until=NULL WHERE id=$1",[task.id]);
 for(const task of stale.filter(t=>!['manual_handoff','publish_instagram','generate','write_article'].includes(t.kind))){await client.query("UPDATE creator.tasks SET status='unknown',phase='Worker interrupted; review before retry',finished_at=now() WHERE id=$1",[task.id]);if(task.kind==='publish'){await client.query("UPDATE creator.posts SET status='unknown',last_error='Worker interrupted; reconcile Facebook and website before retrying.' WHERE workspace_id=$1 AND id=$2 AND status='publishing'",[task.workspace_id,task.post_id]);await client.query("UPDATE creator.publish_attempts SET outcome='unknown' WHERE workspace_id=$1 AND task_id=$2 AND outcome='started'",[task.workspace_id,task.id]);await client.query("UPDATE creator.usage_reservations SET status='unknown' WHERE workspace_id=$1 AND post_id=$2 AND status='reserved'",[task.workspace_id,task.post_id]);}}
 return stale.length;
},{owner:true});}
export async function continuePipeline(task,result){
 if(result.hold||!['aggregate','generate','write_article','creative','render_reel'].includes(task.kind))return;
 const w=task.workspace_id,pipeline=task.input.pipeline,postId=task.post_id||result.postId;if(!postId){if(pipeline?.ruleId)await transaction(w,db=>db.query("UPDATE creator.automation_rules SET refill_until=NULL,next_run_at=now()+interval '1 minute'*CASE WHEN EXISTS(SELECT 1 FROM creator.pages p WHERE p.id=creator.automation_rules.page_id AND p.kind='news' AND p.aggregation_enabled) THEN 1 ELSE interval_minutes END,last_message='No fresh source found. Generation is resting until the source cooldown ends.' WHERE workspace_id=$1 AND id=$2",[w,pipeline.ruleId]));return;}
 await transaction(w,async db=>{
  await workspaceLock(db,w);const rule=pipeline?await row(db,'automation_rules',w,pipeline.ruleId):null;
  if(rule&&!rule.enabled)return;const page=await row(db,'pages',w,task.page_id),post=await row(db,'posts',w,postId);if(post.deleted_at||post.archived_at)return;
  if(task.kind==='generate'&&post.type==='reel'){if(page.creative_policy?.reels?.autoRender){await enqueue(db,w,'render_reel',{pageId:page.id,postId,input:{...(pipeline?{pipeline}:{})}});}else await queueApprovalNotification(db,w,page,post);return;}
  if(task.kind==='generate'&&post.type==='news'&&page.website_publishing&&!post.seo?.article?.text){await requireGenerationCapacity(db,w);await enqueue(db,w,'write_article',{pageId:page.id,postId,input:{...(pipeline?{pipeline}:{}),...(task.input.urgent?{urgent:true}:{})}});return;}
  if(['generate','write_article'].includes(task.kind)&&post.type==='news'&&page.creative_policy?.contentFormat==='news_desk_v3'&&criticalEditorialWarnings(post.seo?.editorialWarnings).length){await db.query("UPDATE creator.posts SET status='review',last_error=$3 WHERE workspace_id=$1 AND id=$2",[w,post.id,'Report needs editorial correction: '+criticalEditorialWarnings(post.seo.editorialWarnings).join(' ')]);return;}
  if(!pipeline&&page.require_review){await queueApprovalNotification(db,w,page,post);return;}
  const input={...(pipeline?{pipeline}:{}),...(task.input.urgent?{urgent:true}:{})};
  if(task.kind==='aggregate'){await requireGenerationCapacity(db,w);await enqueue(db,w,'generate',{pageId:page.id,postId,input});}
  else if(['generate','write_article'].includes(task.kind)&&(post.seo?.article?.socialPending||pipeline?.makeCreative||post.creative.sourceImage||['image','product_sale'].includes(post.type))){await requireGenerationCapacity(db,w);await enqueue(db,w,'creative',{pageId:page.id,postId,input});}
  else if(['generate','write_article','creative','render_reel'].includes(task.kind)&&(rule?.auto_schedule??true)){
   const factualHold=criticalEditorialWarnings(post.seo.editorialWarnings).length>0||post.seo?.safety?.requiresHuman&&post.approved_version!==post.version;
   const automatic=!factualHold&&(rule?.auto_publish??true)&&page.active&&!page.require_review&&env().publishing&&(page.fb_verified||page.destination_type==='facebook_profile');
   await queuePublication(db,w,null,page,post,{autoPick:true,at:!liveNews(page)&&post.planned_at&&new Date(post.planned_at)>new Date()?new Date(post.planned_at):undefined,approveCurrent:automatic,planOnly:!automatic,spread:true,target:Math.min(rule?.daily_target||page.daily_cap,page.daily_cap),ignoreTaskId:task.id});
   if(page.require_review||factualHold)await queueApprovalNotification(db,w,page,post,{force:factualHold});
   if(factualHold)await db.query("UPDATE creator.posts SET last_error='Automatic source check needs correction before publication.' WHERE workspace_id=$1 AND id=$2",[w,post.id]);
   if(rule)await db.query('UPDATE creator.automation_rules SET last_message=$3 WHERE workspace_id=$1 AND id=$2',[w,rule.id,factualHold?'Source check needs correction. This draft stays out of automatic publishing.':automatic?'Caption and creative scheduled for automatic publication.':page.require_review?'Calendar slot prepared; waiting for editorial approval.':'Calendar slot prepared; enable and connect this Page to resume publication.']);
  }
 });
}
// Resume only prepared content, never drafts explicitly saved by a user, deleted
// stories, ambiguous deliveries or a post already rejected by Meta.
async function holdStaleNews(db,w,post,message){
 if(['published','publishing','unknown'].includes(post.status))return;
 const active=(await db.query("SELECT 1 FROM creator.publication_deliveries WHERE workspace_id=$1 AND post_id=$2 AND status IN ('running','unknown') LIMIT 1",[w,post.id])).rowCount;
 if(active)return;
 await releasePublication(db,w,post.id);
 await db.query("UPDATE creator.tasks SET status='canceled',phase=$3,finished_at=now(),lease_until=NULL WHERE workspace_id=$1 AND post_id=$2 AND status='queued'",[w,post.id,message]);
 await db.query("UPDATE creator.posts SET status='review',planned_at=NULL,scheduled_at=NULL,last_error=$3,seo=jsonb_set(seo,'{rebuildReport}','false'::jsonb)||jsonb_build_object('newsFreshnessHold',COALESCE(seo->'newsFreshnessHold',jsonb_build_object('reason',$3::text,'priorError',last_error,'at',now()))),updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,post.id,message]);
}
export async function resumePreparedPosts(){
 if(!env().publishing)return {scheduled:0};
 return transaction(null,async db=>{
  const pages=(await db.query("SELECT p.*,r.id AS rule_id,r.make_creative,r.auto_publish,r.auto_schedule,r.daily_target FROM creator.pages p LEFT JOIN creator.automation_rules r ON r.workspace_id=p.workspace_id AND r.page_id=p.id JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE p.active AND (p.fb_verified OR p.destination_type='facebook_profile') AND NOT p.require_review AND w.status='active' AND a.status='active' AND (r.id IS NULL OR (r.enabled AND r.auto_publish AND r.auto_schedule)) ORDER BY p.id")).rows;
  let scheduled=0;for(const page of pages){await workspaceLock(db,page.workspace_id);
   if(page.creative_policy?.contentFormat==='news_desk_v3'&&page.rule_id){const candidates=(await db.query("SELECT p.* FROM creator.posts p WHERE workspace_id=$1 AND page_id=$2 AND status='draft' AND seo->>'rebuildReport'='true' AND deleted_at IS NULL AND archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM creator.tasks t WHERE t.workspace_id=$1 AND t.page_id=$2 AND t.status IN ('queued','running') AND t.kind NOT IN ('publish','publish_instagram','post_link_comment')) ORDER BY created_at DESC LIMIT 25",[page.workspace_id,page.id])).rows;let pending;for(const candidate of candidates){const stale=newsFreshnessProblem(page,candidate);if(stale)await holdStaleNews(db,page.workspace_id,candidate,stale);else if(!pending)pending=candidate;}if(pending){await enqueue(db,page.workspace_id,'generate',{pageId:page.id,postId:pending.id,input:{pipeline:{ruleId:page.rule_id,makeCreative:true,autoPublish:true}}});await db.query("UPDATE creator.posts SET seo=seo||'{\"rebuildReport\":false}'::jsonb,last_error=NULL WHERE id=$1",[pending.id]);}}
   const posts=(await db.query("SELECT p.* FROM creator.posts p WHERE p.workspace_id=$1 AND p.page_id=$2 AND p.status IN ('review','approved') AND p.planned_at IS NOT NULL AND p.deleted_at IS NULL AND p.archived_at IS NULL AND p.last_error IS NULL AND NOT EXISTS(SELECT 1 FROM creator.tasks t WHERE t.workspace_id=p.workspace_id AND t.post_id=p.id AND t.status IN ('queued','running')) ORDER BY p.planned_at LIMIT 20",[page.workspace_id,page.id])).rows;
   for(const post of posts){const stale=newsFreshnessProblem(page,post);if(stale){await holdStaleNews(db,page.workspace_id,post,stale);continue;}await db.query('SAVEPOINT resume_post');try{await queuePublication(db,page.workspace_id,null,page,post,{autoPick:true,at:liveNews(page)?new Date(Date.now()+60000):new Date(Math.max(Date.now()+60000,+new Date(post.planned_at))),target:Math.min(page.daily_target||page.daily_cap,page.daily_cap)});scheduled++;}catch(error){await db.query('ROLLBACK TO SAVEPOINT resume_post');await db.query('UPDATE creator.posts SET last_error=$3 WHERE workspace_id=$1 AND id=$2',[page.workspace_id,post.id,error instanceof AppError?error.message:'Automatic scheduling could not complete.']);}finally{await db.query('RELEASE SAVEPOINT resume_post');}}
  }return {scheduled};
 },{owner:true});
}
export async function tickAutomations(){
 return transaction(null,async db=>{
  const rules=(await db.query(`SELECT r.*,p.kind,p.website_id FROM creator.automation_rules r JOIN creator.pages p ON p.id=r.page_id AND p.workspace_id=r.workspace_id JOIN creator.workspaces w ON w.id=r.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE r.enabled AND r.next_run_at<=now() AND w.status='active' AND a.status='active' ORDER BY r.next_run_at FOR UPDATE OF r SKIP LOCKED LIMIT 5`)).rows;
  let queued=0;for(const rule of rules){
   await db.query("UPDATE creator.automation_rules SET last_run_at=now(),next_run_at=now()+interval '1 minute'*interval_minutes WHERE id=$1",[rule.id]);
   await db.query('SAVEPOINT automation_rule');
   try{await workspaceLock(db,rule.workspace_id);const plan=await requireGenerationCapacity(db,rule.workspace_id),page=await row(db,'pages',rule.workspace_id,rule.page_id);
    const pending=(await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND page_id=$2 AND kind NOT IN ('publish','manual_handoff','publish_instagram','post_link_comment','apply_page_brand','notify_approval','sync_insights') AND status IN ('queued','running') LIMIT 1",[rule.workspace_id,rule.page_id])).rowCount;if(pending){await db.query("UPDATE creator.automation_rules SET last_message=$2,next_run_at=CASE WHEN generation_mode='buffered' OR $3::boolean THEN now()+interval '1 minute' ELSE next_run_at END WHERE id=$1",[rule.id,'A generation task is already running; no extra drafts added.',liveNews(page)]);continue;}
    const reservations=await bookings(db,rule.workspace_id,page.id),availability=generationAvailability(rule,page,reservations);
    if(!availability.allowed){await db.query('UPDATE creator.automation_rules SET next_run_at=$2,last_message=$3 WHERE id=$1',[rule.id,availability.next,availability.message]);continue;}
    const waiting=(await db.query("SELECT count(*)::int AS count FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status IN ('draft','review','approved','scheduled','ready_manual') AND ($3::boolean=false OR status NOT IN ('scheduled','ready_manual')) AND deleted_at IS NULL AND archived_at IS NULL AND ($4::boolean=false OR (last_error IS NULL AND COALESCE(seo->'safety'->>'requiresHuman','false')<>'true'))",[rule.workspace_id,page.id,rule.generation_mode==='buffered',liveNews(page)])).rows[0].count;
    const day=pageClock(page).date,dated=(await db.query("SELECT COALESCE(published_at,scheduled_at,planned_at) AS at FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND deleted_at IS NULL AND archived_at IS NULL AND COALESCE(published_at,scheduled_at,planned_at)>=now()-interval '1 day' AND ($3::boolean=false OR status IN ('published','publishing','unknown','scheduled','ready_manual'))",[rule.workspace_id,page.id,liveNews(page)])).rows.filter(p=>pageClock(page,new Date(p.at)).date===day).length;
    const buffer=rule.generation_mode==='buffered'||liveNews(page)?generationBuffer(rule,page,reservations,{leadMinutes:availability.leadMinutes,periodEnd:availability.emergency?new Date(Math.min(+availability.until,+new Date(plan.period_end))):plan.period_end}):null;
    if(buffer){await db.query('UPDATE creator.automation_rules SET refill_until=$2,next_run_at=$3,last_message=$4 WHERE id=$1',[rule.id,buffer.refillUntil,buffer.nextCheck,buffer.message]);if(!buffer.count)continue;}
    let produced=0;const count=Math.max(0,Math.min(rule.batch_size,rule.backlog_limit-waiting,buffer?buffer.count:Math.min(rule.daily_target,page.daily_cap)-dated,plan.posts_remaining));
    if(!count){await db.query("UPDATE creator.automation_rules SET last_message=$2,refill_until=NULL,next_run_at=CASE WHEN generation_mode='buffered' THEN now()+interval '15 minutes' ELSE next_run_at END WHERE id=$1",[rule.id,waiting>=rule.backlog_limit?'Draft backlog is full. Review or remove queued content before generating more.':'Daily target or plan allowance is filled. No extra draft generated.']);continue;}
    const pipeline={ruleId:rule.id,makeCreative:rule.make_creative,autoPublish:rule.auto_publish};
    for(let batch=0;batch<count;batch++){
    if(rule.kind==='news')await enqueue(db,rule.workspace_id,'aggregate',{pageId:rule.page_id,input:{pipeline}});
    else{
     let product;if(rule.kind==='ecommerce'){const candidates=(await db.query(`SELECT p.* FROM creator.products p WHERE p.workspace_id=$1 AND p.website_id=$2 AND p.available AND NOT EXISTS(SELECT 1 FROM creator.posts s WHERE s.workspace_id=$1 AND s.product_id=p.id AND s.page_id=$3::uuid AND (s.status IN ('published','unknown','publishing') OR s.fb_post_id IS NOT NULL OR s.published_at IS NOT NULL OR (s.deleted_at IS NULL AND s.archived_at IS NULL AND s.status IN ('draft','review','approved','scheduled','ready_manual')))) LIMIT 300`,[rule.workspace_id,rule.website_id,page.id])).rows;const recent=(await db.query(`SELECT p.attributes->>'category' AS category FROM creator.posts s JOIN creator.products p ON p.workspace_id=s.workspace_id AND p.id=s.product_id WHERE s.workspace_id=$1 AND s.page_id=$2 ORDER BY s.created_at DESC LIMIT 5`,[rule.workspace_id,page.id])).rows.map(r=>r.category);product=pickCatalogProduct(candidates,recent);}
     if(rule.kind==='ecommerce'&&!product){if(rule.website_id){await enqueue(db,rule.workspace_id,'import_products',{pageId:page.id,input:{websiteId:rule.website_id,refreshRuleId:rule.id}});queued++;}await db.query('UPDATE creator.automation_rules SET last_message=$2 WHERE id=$1',[rule.id,'Current catalog batch is allocated or published; fetching the next unseen batch.']);break;}
     const post=(await db.query(`INSERT INTO creator.posts(workspace_id,page_id,type,title,body,product_id,creative) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[rule.workspace_id,rule.page_id,product?'product_sale':page.creative_policy?.nichePreset?.startsWith('reels_')?'reel':rule.kind==='quotes'?'quote':'original',product?product.title:rule.name,product?product.description:rule.topic,product?.id||null,JSON.stringify({ratio:product?analyzeProduct(product).recommendedRatio:'1:1',style:'editorial'})])).rows[0];
     await enqueue(db,rule.workspace_id,'generate',{pageId:rule.page_id,postId:post.id,input:{pipeline}});
    }queued++;produced++;}
    if(produced)await db.query('UPDATE creator.automation_rules SET last_message=$2 WHERE id=$1',[rule.id,'Small batch queued. Generation stops at the daily target or backlog limit.']);
   }catch(error){await db.query('ROLLBACK TO SAVEPOINT automation_rule');const message=error instanceof AppError?error.message:'Check automation configuration.';await db.query('UPDATE creator.automation_rules SET last_message=$2 WHERE id=$1',[rule.id,message]);await audit(db,rule.workspace_id,null,'automation.blocked','automation_rule',rule.id,{message});}
   finally{await db.query('RELEASE SAVEPOINT automation_rule');}
  }return {queued};
 },{owner:true});
}
export async function queueInsightRefreshes(){return transaction(null,async db=>{
 const pages=(await db.query("SELECT p.id,p.workspace_id FROM creator.pages p JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE p.fb_verified AND p.facebook_connection_id IS NOT NULL AND p.destination_type='facebook_page' AND w.status='active' AND a.status='active' AND NOT EXISTS(SELECT 1 FROM creator.analytics_reports r WHERE r.page_id=p.id AND r.observed_at>now()-interval '6 hours') AND NOT EXISTS(SELECT 1 FROM creator.tasks t WHERE t.page_id=p.id AND t.kind='sync_insights' AND t.status IN ('queued','running')) LIMIT 20 FOR UPDATE OF p SKIP LOCKED")).rows;
 for(const page of pages)await enqueue(db,page.workspace_id,'sync_insights',{pageId:page.id,input:{days:28}});return pages.length;
},{owner:true});}
let stopPreparation,stopPublication,lastTick=0,lastInsightsCheck=0;
export function startWorker(){
 if(process.env.PLATFORM_QUEUE_BACKEND==='bullmq'&&process.env.REDIS_URL){
  let stop,closing=false;import('./redis-queue.mjs').then(m=>m.startRedisQueue({runTask:taskId=>runOne({taskId}),tick:async()=>{if(Date.now()-lastTick>60000){await recoverExpiredTasks();await resumePreparedPosts();await tickAutomations();lastTick=Date.now();}if(Date.now()-lastInsightsCheck>15*60000){await queueInsightRefreshes();lastInsightsCheck=Date.now();}await syncOneMirror();},onError:()=>console.error('Redis dispatch unavailable. SQL outbox retains pending work; reconnecting.')})).then(fn=>{stop=fn;if(closing)stop();}).catch(()=>console.error('Redis queue could not start. Check REDIS_URL or select the postgres queue backend and restart.'));
  return ()=>{closing=true;stop?.();};
 }

 stopPreparation=queueLoop(async()=>{if(Date.now()-lastTick>60000){await recoverExpiredTasks();await resumePreparedPosts();await tickAutomations();lastTick=Date.now();}if(await runOne({excludePublish:true}))return true;return syncOneMirror();},{onError:()=>console.error('Preparation queue unavailable; backing off before retrying.')});
 stopPublication=queueLoop(async()=>{if(Date.now()-lastInsightsCheck>15*60000){await queueInsightRefreshes();lastInsightsCheck=Date.now();}return runOne({publishOnly:true});},{onError:()=>console.error('Publication queue unavailable; backing off before retrying.')});
 return ()=>{stopPreparation?.();stopPublication?.();};
}
