import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {transaction,audit,workspaceLock} from './db.mjs';
import {AppError} from './errors.mjs';
import {decryptSecret} from './vault.mjs';
import {testAI,textCompletion,imageGeneration} from './providers.mjs';
import {fetchProducts,readFeed,articleDetails,canonicalArticleURL} from './catalog.mjs';
import {renderCreative,saveAsset} from './creative.mjs';
import {remoteJSON,publicURL} from './net.mjs';
import {entitlements,reservePublication,releasePublication,requireGenerationCapacity} from './quotas.mjs';
import {publishGate} from './scheduling.mjs';
import {env} from './env.mjs';
import {testNoble,writeNoble} from './nobleseek.mjs';
import {testMirror,syncOneMirror} from './mirrors.mjs';
import {editorialWarnings} from './editorial.mjs';
import {queuePublication} from './planner.mjs';
import {pageClock} from './scheduling.mjs';
export async function row(client,table,workspaceId,id){
 if(!['connections','pages','posts','websites','products','campaigns','assets','tasks','feeds','automation_rules'].includes(table))throw new Error('Invalid internal table');
 const result=(await client.query(`SELECT * FROM creator.${table} WHERE workspace_id=$1 AND id=$2`,[workspaceId,id])).rows[0];
 if(!result)throw new AppError(404,'This item was not found in your workspace.');return result;
}
export async function enqueue(client,workspaceId,kind,{pageId=null,postId=null,input={},notBefore=null}={}){
 const count=(await client.query("SELECT count(*)::int AS count FROM creator.tasks WHERE workspace_id=$1 AND status IN ('queued','running')",[workspaceId])).rows[0].count;
 if(count>=20)throw new AppError(429,'This workspace already has 20 pending tasks. Let them finish before adding more.');
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
 }else result=await testAI(c,c.secret);
 await transaction(task.workspace_id,client=>client.query("UPDATE creator.connections SET status='connected',last_test_at=now(),last_test_result=$3 WHERE workspace_id=$1 AND id=$2",[task.workspace_id,c.id,result]));return result;
}
function wordsForService(id){return id==='wordpress'?'WordPress':'WooCommerce';}
async function generate(task){
 const {post,page,product}=await transaction(task.workspace_id,async client=>{const post=await row(client,'posts',task.workspace_id,task.post_id);if(post.deleted_at||post.archived_at||['published','publishing','unknown','scheduled'].includes(post.status))throw new AppError(409,'Move the post to draft before generating.');return {post,page:await row(client,'pages',task.workspace_id,post.page_id),product:post.product_id?await row(client,'products',task.workspace_id,post.product_id):null};});
 if(!page.text_connection_id)throw new AppError(400,'Choose a text model on this Page first.');if(product&&Date.now()-new Date(product.fetched_at)>86400000)throw new AppError(409,'Refresh this product catalog before generating a sale post.');await updateTask(task,15,'Reading source facts and Page instructions');
 const c=await connectionFor(task.workspace_id,page.text_connection_id);
 const language=page.language==='Bangla'?'Write natural, clear Bangla. Use short paragraphs and an engaging but factual tone.':page.language==='Bilingual-Mix'?'Use a natural mix of Bangla and English.':'Write clear, engaging '+page.language+'.';
 const facts=product?{title:product.title,description:product.description.slice(0,7000),price:product.price,currency:product.currency,available:product.available}: {title:post.title,text:post.body.slice(0,7000)};
 await updateTask(task,35,'Model generating caption; waiting for inference');
 const caption=await textCompletion(c,c.secret,`${language}\nCreate a ${post.type} Facebook caption for a ${page.niche} Page. Use a natural descriptive opening with the main topic or product keyword. For news: write two short paragraphs with useful detail, generally 4–6 sentences, about 400–800 characters when enough facts are supplied. Never pad sparse sources. Attribute reported claims; do not claim our Page did the original reporting. Use only these source facts. Paraphrase without changing names, numbers, dates or attribution. No invented features, audience demographics, urgency, discounts or other claims. Do not put external links in the caption. Include 3 relevant hashtags, never unrelated trending tags. Return the caption only. Source facts as JSON:\n${JSON.stringify(facts)}`);
 if(caption.length<60)throw new AppError(422,'The model returned too little content. Choose a more capable model or edit the draft manually.');
 await updateTask(task,85,'Saving a reviewable draft');
 await transaction(task.workspace_id,async client=>{
 const seo={title:post.title.slice(0,60),description:caption.replace(/#[\p{L}\p{M}\p{N}_]+/gu,'').trim().slice(0,160),hashtags:caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)||[],alt:product?.title||post.title,language:page.language,editorialWarnings:editorialWarnings(caption,facts,page.niche)};
  const updated=await client.query("UPDATE creator.posts SET caption=$3,status='review',approved_version=NULL,version=version+1,updated_at=now(),seo=$5 WHERE workspace_id=$1 AND id=$2 AND version=$4 AND status IN ('draft','review','approved','failed') RETURNING id",[task.workspace_id,post.id,caption,post.version,seo]);
  if(!updated.rowCount)throw new AppError(409,'The draft changed while the model worked. Generate again from the current version.');
  await audit(client,task.workspace_id,null,'post.generated','post',post.id);
 });return {postId:post.id,message:'Caption saved for factual review.'};
}
async function creative(task){
 const {post,page,product}=await transaction(task.workspace_id,async client=>{const post=await row(client,'posts',task.workspace_id,task.post_id);if(['published','publishing','unknown','scheduled'].includes(post.status))throw new AppError(409,'Move the post to draft first.');return {post,page:await row(client,'pages',task.workspace_id,post.page_id),product:post.product_id?await row(client,'products',task.workspace_id,post.product_id):null};});
 await updateTask(task,15,'Preparing brand, format and source photo');let background;
 if(task.input.aiBackground){if(!page.image_connection_id)throw new AppError(400,'Choose an image tool on this Page.');const c=await connectionFor(task.workspace_id,page.image_connection_id);await updateTask(task,30,'Image model generating background');background=await imageGeneration(c,c.secret,`Create a modern abstract graphic background for ${page.niche}. No text, logos, people, product claims or product depictions. Use negative space and ${page.brand.color||'coral'} accents.`);}
 let brandLogo;if(page.brand.logoAssetId){const logo=await transaction(task.workspace_id,db=>row(db,'assets',task.workspace_id,page.brand.logoAssetId));brandLogo=await readFile(logo.path);}
 await updateTask(task,65,'Composing source photo, headline and brand');const image=await renderCreative({post,page,product,background,brandLogo}),asset=await saveAsset(task.workspace_id,post.id,image);
 await transaction(task.workspace_id,async client=>{
  const result=await client.query("UPDATE creator.posts SET creative=creative||$3::jsonb,status='review',approved_version=NULL,version=version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$4 AND status IN ('draft','review','approved','failed') RETURNING id",[task.workspace_id,post.id,JSON.stringify({assetId:asset.id}),post.version]);if(!result.rowCount)throw new AppError(409,'The post changed while the creative was being prepared.');
  await client.query('INSERT INTO creator.assets(id,workspace_id,post_id,path,mime,width,height) VALUES($1,$2,$3,$4,$5,$6,$7)',[asset.id,task.workspace_id,post.id,asset.path,asset.mime,asset.width,asset.height]);
 });return {assetId:asset.id,width:asset.width,height:asset.height};
}
async function importProducts(task){
 const website=await transaction(task.workspace_id,client=>row(client,'websites',task.workspace_id,task.input.websiteId));if(website.kind!=='ecommerce')throw new AppError(400,'Product import requires an ecommerce website.');
 const c=website.connection_id?await connectionFor(task.workspace_id,website.connection_id):null;
 if(c&&c.provider!==website.connector)throw new AppError(400,'The website connector and connection must match.');
 await updateTask(task,25,'Fetching the first catalog batch (up to 100 products)');const products=await fetchProducts(website,c?.secret,c);
 await updateTask(task,75,'Saving product facts and photo references');
 await transaction(task.workspace_id,async client=>{for(const p of products)await client.query(`INSERT INTO creator.products(workspace_id,website_id,external_id,title,description,url,image_url,price,compare_at_price,currency,available,attributes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(website_id,external_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,url=EXCLUDED.url,image_url=EXCLUDED.image_url,price=EXCLUDED.price,compare_at_price=EXCLUDED.compare_at_price,currency=EXCLUDED.currency,available=EXCLUDED.available,attributes=EXCLUDED.attributes,fetched_at=now()`,[task.workspace_id,website.id,p.external_id,p.title,p.description,p.url,p.image_url,p.price,p.compare_at_price,p.currency,p.available,p.attributes]);});
 if(task.input.refreshRuleId)await transaction(task.workspace_id,db=>db.query('UPDATE creator.automation_rules SET next_run_at=now() WHERE workspace_id=$1 AND id=$2',[task.workspace_id,task.input.refreshRuleId]));
 return {imported:products.length,message:'Catalog batch imported. Existing source IDs were updated.'};
}
async function aggregate(task){
 const {page,feeds}=await transaction(task.workspace_id,async client=>({page:await row(client,'pages',task.workspace_id,task.page_id),feeds:(await client.query('SELECT * FROM creator.feeds WHERE workspace_id=$1 AND page_id=$2 AND active',[task.workspace_id,task.page_id])).rows}));
 if(page.kind!=='news'||!page.aggregation_enabled)throw new AppError(400,'Enable aggregation on a news Page first.');
 let candidates=[],failed=0;for(let i=0;i<feeds.length;i++){await updateTask(task,10+Math.round(50*i/Math.max(1,feeds.length)),'Reading feed '+(i+1)+' of '+feeds.length);try{candidates.push(...await readFeed(feeds[i]));}catch{failed++;}}
 candidates=candidates.filter(x=>!x.date||new Date(x.date)>new Date(Date.now()-86400000)).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
 let created=0,postId;
 for(const candidate of candidates){
  const hash=createHash('sha256').update(canonicalArticleURL(candidate.url)).digest('hex');const seen=await transaction(task.workspace_id,client=>client.query('SELECT id FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND source_hash=$3',[task.workspace_id,page.id,hash]));if(seen.rowCount)continue;
  await updateTask(task,70,'Reading a recent, unseen article');let article=candidate;try{article=await articleDetails(candidate);}catch{}
  const inserted=await transaction(task.workspace_id,client=>client.query(`INSERT INTO creator.posts(workspace_id,page_id,type,title,body,source_url,source_hash,creative) VALUES($1,$2,'news',$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,[task.workspace_id,page.id,article.title,article.body,article.url,hash,{sourceImage:article.image,ratio:'1:1',style:'editorial'}]));postId=inserted.rows[0]?.id;if(postId)created++;break;
 }
 if(!created&&failed===feeds.length&&feeds.length)throw new AppError(502,'All active feeds failed, including their configured fallbacks.');
 return {postId,draftsCreated:created,feedsFailed:failed,message:created?'A recent unseen story is ready to edit and generate.':'No new story in the last 24 hours. This is a recency selection, not a verified popularity ranking.'};
}
async function publish(task){
 if(!env().publishing)throw new AppError(409,'Live publishing is disabled in this local environment. Use dry-run, then ask the owner to enable a reviewed publishing test.');
 const w=task.workspace_id;let state;
 await transaction(w,async client=>{
  await workspaceLock(client,w);const account=(await client.query('SELECT a.status FROM creator.workspaces w JOIN creator.accounts a ON a.id=w.owner_id WHERE w.id=$1',[w])).rows[0];if(account.status!=='active')throw new AppError(403,'Workspace owner account is suspended.');
  const post=await row(client,'posts',w,task.post_id),page=await row(client,'pages',w,post.page_id);
  if(!['approved','scheduled'].includes(post.status))throw new AppError(409,'The post must be approved or scheduled.');
  await publishGate(client,w,page,post);await reservePublication(client,w,post.id);
  if(!page.fb_verified||!page.facebook_connection_id||!page.fb_page_id)throw new AppError(409,'Verify this Page connection before publishing.');
  await client.query("INSERT INTO creator.publish_attempts(workspace_id,post_id,task_id) VALUES($1,$2,$3)",[w,post.id,task.id]);
  await client.query("UPDATE creator.posts SET status='publishing',updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,post.id]);state={post,page};
 });
 // From this point a lost response is ambiguous. Never auto-retry a remote
 // write; an owner must reconcile the remote Page before a retry is offered.
 let remoteWriteStarted=false;
 try{
  const {post,page}=state,c=await connectionFor(w,page.facebook_connection_id),identity=await facebookIdentity(c);if(identity.id!==page.fb_page_id)throw new AppError(400,'The token belongs to another Page.');
  if(page.website_publishing&&['news','blog'].includes(post.type)&&!post.website_url){
   await updateTask(task,30,'Publishing the article to the connected website');
   const site=await transaction(w,client=>row(client,'websites',w,page.website_id));if(!['wordpress','nobleseek_db'].includes(site.connector))throw new AppError(400,'This website connector does not support publication.');
   const sc=await connectionFor(w,site.connection_id);let wp;
   if(site.connector==='nobleseek_db')wp=await writeNoble(sc,sc.secret,site,post,{onWrite:()=>{remoteWriteStarted=true;}});
   else{
    const headers={authorization:'Basic '+Buffer.from((sc.secret.username||'')+':'+(sc.secret.password||'')).toString('base64')},base=publicURL(site.url).origin,slug='echolink-'+post.id;
    const existing=await remoteJSON(base+'/wp-json/wp/v2/posts?slug='+slug,{headers});
    if(existing[0])wp=existing[0];else{remoteWriteStarted=true;wp=await remoteJSON(base+'/wp-json/wp/v2/posts',{method:'POST',headers:{...headers,'content-type':'application/json'},body:{title:post.title,content:'<p>'+post.caption.replace(/[<>&]/g,x=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[x])).replace(/\n/g,'</p><p>')+'</p>',status:'publish',slug}});}
   }
   await transaction(w,client=>client.query('UPDATE creator.posts SET website_url=$3 WHERE workspace_id=$1 AND id=$2',[w,post.id,publicURL(wp.link).href]));
   await updateTask(task,50,'Website article published; preparing Facebook');
  }
  await updateTask(task,65,'Publishing caption and image to Facebook');let response;
  if(post.creative.assetId){
   const asset=await transaction(w,client=>row(client,'assets',w,post.creative.assetId)),bytes=await readFile(asset.path),form=new FormData();form.set('caption',post.caption);form.set('source',new Blob([bytes],{type:asset.mime}),'creative.jpg');
   const request=new Request('https://example.com',{method:'POST',body:form});remoteWriteStarted=true;response=await remoteJSON(graph(c)+'/'+page.fb_page_id+'/photos',{method:'POST',headers:{authorization:'Bearer '+c.secret.token,'content-type':request.headers.get('content-type')},body:Buffer.from(await request.arrayBuffer()),maxBytes:1000000});
  }else{remoteWriteStarted=true;response=await remoteJSON(graph(c)+'/'+page.fb_page_id+'/feed',{method:'POST',headers:{authorization:'Bearer '+c.secret.token,'content-type':'application/json'},body:{message:post.caption}});}
  const remoteId=response.post_id||response.id;if(!remoteId)throw new Error('Missing remote ID');
  await updateTask(task,90,'Facebook publication confirmed; saving delivery records');
  await transaction(w,async client=>{await client.query("UPDATE creator.posts SET status='published',fb_post_id=$3,published_at=now(),updated_at=now(),last_error=NULL WHERE workspace_id=$1 AND id=$2",[w,post.id,remoteId]);await client.query("UPDATE creator.publish_attempts SET outcome='published',remote_id=$3 WHERE workspace_id=$1 AND task_id=$2",[w,task.id,remoteId]);await client.query("UPDATE creator.usage_reservations SET status='consumed',updated_at=now() WHERE workspace_id=$1 AND post_id=$2",[w,post.id]);await audit(client,w,null,'post.published','post',post.id,{remoteId});});
  return {postId:post.id,remoteId,message:'Published. Automatic website/source-link comments remain disabled.'};
 }catch(error){const uncertain=remoteWriteStarted&&!error.definiteRejection;await transaction(w,async client=>{await client.query('UPDATE creator.posts SET status=$4,last_error=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2',[w,task.post_id,error instanceof AppError?error.message:'The remote publication outcome is unknown. Check the Page before retrying.',uncertain?'unknown':'failed']);await client.query('UPDATE creator.publish_attempts SET outcome=$3 WHERE workspace_id=$1 AND task_id=$2',[w,task.id,uncertain?'unknown':'rejected']);await client.query('UPDATE creator.usage_reservations SET status=$3,updated_at=now() WHERE workspace_id=$1 AND post_id=$2',[w,task.post_id,uncertain?'unknown':'released']);});
  throw new AppError(409,uncertain?'Check the Facebook Page and optional website before retrying: delivery needs reconciliation.':error instanceof AppError?error.message:'Publication preparation failed. Check the Page credentials and media.',uncertain?'publication_unknown':'publication_rejected');}
}
async function verifyPage(task){
 const page=await transaction(task.workspace_id,db=>row(db,'pages',task.workspace_id,task.page_id));if(!page.facebook_connection_id||!page.fb_page_id)throw new AppError(400,'Save the Page ID and Facebook connection first.');
 const c=await connectionFor(task.workspace_id,page.facebook_connection_id),result=await facebookIdentity(c);if(result.id!==page.fb_page_id)throw new AppError(400,'The Page token does not belong to this numeric Page ID.');
 await transaction(task.workspace_id,db=>db.query('UPDATE creator.pages SET fb_verified=true WHERE workspace_id=$1 AND id=$2 AND facebook_connection_id=$3 AND fb_page_id=$4',[task.workspace_id,page.id,c.id,result.id]));return result;
}
const handlers={test_connection:testConnection,verify_page:verifyPage,generate,creative,import_products:importProducts,aggregate,publish};
export async function runOne({publishOnly=false,excludePublish=false}={}){
 const task=await transaction(null,async client=>(await client.query(`UPDATE creator.tasks SET status='running',started_at=now(),heartbeat_at=now(),lease_until=now()+interval '8 minutes',phase='Starting' WHERE id=(SELECT id FROM creator.tasks WHERE status='queued' AND not_before<=now() AND (NOT $1::boolean OR kind='publish') AND (NOT $2::boolean OR kind<>'publish') ORDER BY CASE WHEN kind='publish' THEN 0 ELSE 1 END,not_before,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[publishOnly,excludePublish])).rows[0],{owner:true});
 if(!task)return false;
 try{
  await transaction(task.workspace_id,async client=>{await entitlements(client,task.workspace_id);const account=(await client.query('SELECT a.status FROM creator.accounts a JOIN creator.workspaces w ON w.owner_id=a.id WHERE w.id=$1',[task.workspace_id])).rows[0];if(account.status!=='active')throw new AppError(403,'Account suspended.');});
  const handler=handlers[task.kind];if(!handler)throw new AppError(400,'Unknown task type.');const result=await handler(task);await continuePipeline(task,result);await updateTask(task,100,'Complete');await transaction(task.workspace_id,client=>client.query("UPDATE creator.tasks SET status='succeeded',result=$3,finished_at=now(),lease_until=NULL WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,result]));
 }catch(error){const message=error instanceof AppError?error.message:'The task failed. Check the connection configuration and retry from a draft.';
  if(task.kind==='publish'&&['posting_gap','outside_window','daily_cap'].includes(error.code)){
   try{await transaction(task.workspace_id,async db=>{await workspaceLock(db,task.workspace_id);const post=await row(db,'posts',task.workspace_id,task.post_id),page=await row(db,'pages',task.workspace_id,task.page_id);await queuePublication(db,task.workspace_id,null,page,post,{autoPick:true,ignoreTaskId:task.id});await db.query("UPDATE creator.tasks SET status='canceled',phase='Moved to the next available slot',finished_at=now(),lease_until=NULL WHERE id=$1",[task.id]);});return true;}catch{}
  }
  await transaction(task.workspace_id,async client=>{await client.query("UPDATE creator.tasks SET status=$3,phase=$4,last_error=$4,finished_at=now(),lease_until=NULL WHERE workspace_id=$1 AND id=$2",[task.workspace_id,task.id,error.code==='publication_unknown'?'unknown':'failed',message]);if(task.kind==='publish'){const post=await row(client,'posts',task.workspace_id,task.post_id);if(post.status!=='unknown'){await releasePublication(client,task.workspace_id,post.id);await client.query("UPDATE creator.posts SET status='approved',scheduled_at=NULL,last_error=$3 WHERE workspace_id=$1 AND id=$2",[task.workspace_id,post.id,message]);}}});
 }
 return true;
}
export async function recoverExpiredTasks(){return transaction(null,async client=>{
 const stale=(await client.query("SELECT * FROM creator.tasks WHERE status='running' AND lease_until<now() FOR UPDATE")).rows;
 for(const task of stale){await client.query("UPDATE creator.tasks SET status='unknown',phase='Worker interrupted; review before retry',finished_at=now() WHERE id=$1",[task.id]);if(task.kind==='publish'){await client.query("UPDATE creator.posts SET status='unknown',last_error='Worker interrupted; reconcile Facebook and website before retrying.' WHERE workspace_id=$1 AND id=$2 AND status='publishing'",[task.workspace_id,task.post_id]);await client.query("UPDATE creator.publish_attempts SET outcome='unknown' WHERE workspace_id=$1 AND task_id=$2 AND outcome='started'",[task.workspace_id,task.id]);await client.query("UPDATE creator.usage_reservations SET status='unknown' WHERE workspace_id=$1 AND post_id=$2 AND status='reserved'",[task.workspace_id,task.post_id]);}}
 return stale.length;
},{owner:true});}
async function continuePipeline(task,result){
 if(!task.input.pipeline)return;
 const w=task.workspace_id,pipeline=task.input.pipeline,postId=task.post_id||result.postId;if(!postId)return;
 await transaction(w,async db=>{
  await workspaceLock(db,w);const rule=await row(db,'automation_rules',w,pipeline.ruleId);if(!rule.enabled)return;
  if(task.kind==='aggregate'){await requireGenerationCapacity(db,w);await enqueue(db,w,'generate',{pageId:task.page_id,postId,input:{pipeline}});}
  else if(task.kind==='generate'&&pipeline.makeCreative){await requireGenerationCapacity(db,w);await enqueue(db,w,'creative',{pageId:task.page_id,postId,input:{pipeline}});}
  else if(['generate','creative'].includes(task.kind)&&rule.auto_schedule){
   const page=await row(db,'pages',w,task.page_id),post=await row(db,'posts',w,postId);if(post.deleted_at||post.archived_at)return;
   const automatic=rule.auto_publish&&page.active&&!page.require_review&&!post.seo.editorialWarnings?.length&&env().publishing&&page.fb_verified;
   await queuePublication(db,w,null,page,post,{autoPick:true,approveCurrent:automatic,planOnly:!automatic,spread:true,target:Math.min(rule.daily_target,page.daily_cap),ignoreTaskId:task.id});
   await db.query('UPDATE creator.automation_rules SET last_message=$3 WHERE workspace_id=$1 AND id=$2',[w,rule.id,automatic?'Caption and creative scheduled for automatic publication.':'Calendar slot prepared; waiting for editorial approval.']);
  }
 });
}
export async function tickAutomations(){
 return transaction(null,async db=>{
  const rules=(await db.query(`SELECT r.*,p.kind,p.website_id FROM creator.automation_rules r JOIN creator.pages p ON p.id=r.page_id AND p.workspace_id=r.workspace_id JOIN creator.workspaces w ON w.id=r.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE r.enabled AND r.next_run_at<=now() AND w.status='active' AND a.status='active' ORDER BY r.next_run_at FOR UPDATE OF r SKIP LOCKED LIMIT 5`)).rows;
  let queued=0;for(const rule of rules){
   await db.query("UPDATE creator.automation_rules SET last_run_at=now(),next_run_at=now()+interval '1 minute'*interval_minutes WHERE id=$1",[rule.id]);
   await db.query('SAVEPOINT automation_rule');
   try{await workspaceLock(db,rule.workspace_id);const plan=await requireGenerationCapacity(db,rule.workspace_id),page=await row(db,'pages',rule.workspace_id,rule.page_id);
    const pending=(await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND page_id=$2 AND kind<>'publish' AND status IN ('queued','running') LIMIT 1",[rule.workspace_id,rule.page_id])).rowCount;if(pending){await db.query('UPDATE creator.automation_rules SET last_message=$2 WHERE id=$1',[rule.id,'A generation task is already running; no extra drafts added.']);continue;}
    const waiting=(await db.query("SELECT count(*)::int AS count FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status IN ('draft','review','approved','scheduled') AND deleted_at IS NULL AND archived_at IS NULL",[rule.workspace_id,page.id])).rows[0].count;
    const day=pageClock(page).date,dated=(await db.query("SELECT COALESCE(published_at,scheduled_at,planned_at) AS at FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND deleted_at IS NULL AND archived_at IS NULL AND COALESCE(published_at,scheduled_at,planned_at)>=now()-interval '1 day'",[rule.workspace_id,page.id])).rows.filter(p=>pageClock(page,new Date(p.at)).date===day).length;
    let produced=0;const count=Math.max(0,Math.min(rule.batch_size,rule.backlog_limit-waiting,Math.min(rule.daily_target,page.daily_cap)-dated,plan.posts_remaining));
    if(!count){await db.query('UPDATE creator.automation_rules SET last_message=$2 WHERE id=$1',[rule.id,waiting>=rule.backlog_limit?'Draft backlog is full. Review or remove queued content before generating more.':'Daily target or plan allowance is filled. No extra draft generated.']);continue;}
    const pipeline={ruleId:rule.id,makeCreative:rule.make_creative,autoPublish:rule.auto_publish};
    for(let batch=0;batch<count;batch++){
    if(rule.kind==='news')await enqueue(db,rule.workspace_id,'aggregate',{pageId:rule.page_id,input:{pipeline}});
    else{
     let product;if(rule.kind==='ecommerce')product=(await db.query(`SELECT p.* FROM creator.products p WHERE p.workspace_id=$1 AND p.website_id=$2 AND p.available AND p.fetched_at>now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM creator.posts s WHERE s.workspace_id=$1 AND s.product_id=p.id AND s.deleted_at IS NULL AND s.archived_at IS NULL AND s.created_at>now()-interval '7 days') ORDER BY p.fetched_at DESC LIMIT 1`,[rule.workspace_id,rule.website_id])).rows[0];
     if(rule.kind==='ecommerce'&&!product){const fresh=(await db.query("SELECT id FROM creator.products WHERE workspace_id=$1 AND website_id=$2 AND fetched_at>now()-interval '1 day' LIMIT 1",[rule.workspace_id,rule.website_id])).rowCount;if(!fresh&&rule.website_id){await enqueue(db,rule.workspace_id,'import_products',{pageId:page.id,input:{websiteId:rule.website_id,refreshRuleId:rule.id}});queued++;}await db.query('UPDATE creator.automation_rules SET last_message=$2 WHERE id=$1',[rule.id,!fresh?'Refreshing the store catalog before the next draft.':'No unused in-stock product is available in the recent catalog.']);break;}
     const post=(await db.query(`INSERT INTO creator.posts(workspace_id,page_id,type,title,body,product_id,creative) VALUES($1,$2,$3,$4,$5,$6,'{"ratio":"1:1","style":"editorial"}') RETURNING id`,[rule.workspace_id,rule.page_id,product?'product_sale':rule.kind==='quotes'?'quote':'original',product?product.title:rule.name,product?product.description:rule.topic,product?.id||null])).rows[0];
     await enqueue(db,rule.workspace_id,'generate',{pageId:rule.page_id,postId:post.id,input:{pipeline}});
    }queued++;produced++;}
    if(produced)await db.query('UPDATE creator.automation_rules SET last_message=$2 WHERE id=$1',[rule.id,'Small batch queued. Generation stops at the daily target or backlog limit.']);
   }catch(error){await db.query('ROLLBACK TO SAVEPOINT automation_rule');const message=error instanceof AppError?error.message:'Check automation configuration.';await db.query('UPDATE creator.automation_rules SET last_message=$2 WHERE id=$1',[rule.id,message]);await audit(db,rule.workspace_id,null,'automation.blocked','automation_rule',rule.id,{message});}
   finally{await db.query('RELEASE SAVEPOINT automation_rule');}
  }return {queued};
 },{owner:true});
}
let timer,publishTimer,busy=false,publishBusy=false,lastTick=0;
export function startWorker(){
 timer=setInterval(async()=>{if(busy)return;busy=true;try{if(Date.now()-lastTick>60000){await recoverExpiredTasks();await tickAutomations();lastTick=Date.now();}if(!await runOne({excludePublish:true}))await syncOneMirror();}catch{console.error('Platform worker could not process the queue.');}finally{busy=false;}},1500);
 publishTimer=setInterval(async()=>{if(publishBusy)return;publishBusy=true;try{await runOne({publishOnly:true});}catch{console.error('Publication queue check failed.');}finally{publishBusy=false;}},1500);
 return ()=>{clearInterval(timer);clearInterval(publishTimer);};
}
