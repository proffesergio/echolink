import {readFile} from 'node:fs/promises';
import {transaction,audit,workspaceLock} from './db.mjs';
import {resolveActor,requireOwner,requireVerified} from './auth.mjs';
import {identityStatus} from './identity.mjs';
import {env} from './env.mjs';
import {AppError,uuid} from './errors.mjs';
import {validate} from './validation.mjs';
import {encryptSecret,decryptSecret} from './vault.mjs';
import {providers,connectionTypes} from './providers.mjs';
import {publicURL,remoteJSON} from './net.mjs';
import {entitlements,requirePageCapacity,requireGenerationCapacity,reservePublication,releasePublication} from './quotas.mjs';
import {enqueue,row} from './jobs.mjs';
import {grantPlan,checkout,billingPortal} from './billing.mjs';
import {inWindow} from './scheduling.mjs';
import {editorialWarnings} from './editorial.mjs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {saveAsset,rasterImage} from './creative.mjs';
import {canonicalArticleURL} from './catalog.mjs';
const safeConnections=`id,workspace_id,provider,name,config,status,last_test_at,last_test_result,created_at,(secret_cipher IS NOT NULL) AS has_secret`;
async function save(db,table,w,data,id){
 const names=Object.keys(data),values=Object.values(data).map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x);
 if(id)return(await db.query(`UPDATE creator.${table} SET ${names.map((n,i)=>n+'=$'+(i+3)).join(',')} WHERE workspace_id=$1 AND id=$2 RETURNING *`,[w,id,...values])).rows[0];
 return(await db.query(`INSERT INTO creator.${table}(workspace_id,${names.join(',')}) VALUES($1,${names.map((_,i)=>'$'+(i+2)).join(',')}) RETURNING *`,[w,...values])).rows[0];
}
async function pageChecks(db,w,data,id){
 try{new Intl.DateTimeFormat('en',{timeZone:data.timezone}).format();}catch{throw new AppError(400,'Enter a valid IANA timezone, such as Asia/Dhaka.');}
 if(data.aggregation_enabled&&data.kind!=='news')throw new AppError(400,'RSS aggregation is available only on news Pages.');
 if(data.brand.logoAssetId)await row(db,'assets',w,data.brand.logoAssetId);
 if(data.active&&id){const migration=(await db.query("SELECT detail FROM creator.legacy_imports WHERE workspace_id=$1 AND kind='page' AND resource_id=$2",[w,id])).rows[0];if(migration?.detail.requiresCutover)throw new AppError(409,'Complete the legacy workflow cutover before enabling this migrated Page.');}
 if(data.website_publishing&&!data.website_id)throw new AppError(400,'Choose a website or turn website publishing off.');
 if(data.website_id){const s=await row(db,'websites',w,data.website_id);if(data.website_publishing&&!['wordpress','nobleseek_db'].includes(s.connector))throw new AppError(400,'Choose a supported website publisher or leave website publishing disabled.');}
 for(const [key,capability] of [['text_connection_id','text'],['image_connection_id','image'],['facebook_connection_id','publish']])if(data[key]){const c=await row(db,'connections',w,data[key]);if(!connectionTypes.find(p=>p.id===c.provider)?.capabilities.includes(capability))throw new AppError(400,'Choose a compatible '+capability+' connection.');}
}
export async function api(request,path,body={},identityVerifier){
 const method=request.method;
 if(path==='/api/public'&&method==='GET')return transaction(null,async db=>({identity:identityStatus(),local:!env().production,publishingEnabled:env().publishing,plans:(await db.query('SELECT * FROM creator.plans WHERE enabled ORDER BY page_limit')).rows,providers,paymentMethods:(await db.query('SELECT id,label,markets,instructions,enabled FROM creator.payment_methods ORDER BY id')).rows}));
 const actor=await resolveActor(request,identityVerifier),w=actor.workspaceId;
 if(method!=='GET')requireVerified(actor);
 if(path==='/api/state'&&method==='GET')return transaction(w,async db=>{
  const data={actor:{id:actor.id,name:actor.name,email:actor.email,role:actor.role,email_verified:actor.email_verified},workspace:actor.workspace,workspaces:actor.workspaces,entitlements:await entitlements(db,w,{allowExpired:true}),providers:connectionTypes.filter(p=>!p.ownerOnly||actor.role==='super_admin'),publishingEnabled:env().publishing,environment:env().production?'production':'development'};
  for(const table of ['pages','websites','feeds','products','posts','tasks','campaigns','ad_drafts','payments','automation_rules'])data[table]=(await db.query(`SELECT * FROM creator.${table} WHERE workspace_id=$1 ORDER BY ${table==='feeds'?'name':table==='products'?'fetched_at':'created_at'} DESC LIMIT 300`,[w])).rows;
  data.connections=(await db.query(`SELECT ${safeConnections} FROM creator.connections WHERE workspace_id=$1 ORDER BY created_at DESC`,[w])).rows;
  data.activity=(await db.query('SELECT * FROM creator.activity WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',[w])).rows;
  data.postCounts=Object.fromEntries((await db.query('SELECT status,count(*)::int AS count FROM creator.posts WHERE workspace_id=$1 GROUP BY status',[w])).rows.map(r=>[r.status,r.count]));
  data.pageMirrors=(await db.query('SELECT * FROM creator.page_mirrors WHERE workspace_id=$1',[w])).rows;
  data.mirrorStatus=(await db.query("SELECT post_id,connection_id,status,attempts,last_error FROM creator.mirror_outbox WHERE workspace_id=$1 AND status<>'synced' ORDER BY next_attempt_at LIMIT 50",[w])).rows;
  data.plans=(await db.query('SELECT * FROM creator.plans ORDER BY page_limit')).rows;data.paymentMethods=(await db.query('SELECT id,label,markets,instructions,enabled FROM creator.payment_methods ORDER BY id')).rows;return data;
 });
 if(path==='/api/posts'&&method==='GET'){
  const params=new URL(request.url).searchParams,offset=Math.max(0,Math.min(100000,Number(params.get('offset'))||0)),limit=Math.max(1,Math.min(300,Number(params.get('limit'))||100));return transaction(w,async db=>({posts:(await db.query('SELECT * FROM creator.posts WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',[w,Math.floor(limit),Math.floor(offset)])).rows}));
 }
 if(path==='/api/onboarding'&&method==='POST'){
  const data=validate('onboarding',body);return transaction(w,async db=>{await db.query('UPDATE creator.workspaces SET name=$2,niche=$3,language=$4,desired_pages=$5,onboarded=true WHERE id=$1',[w,data.name,data.niche,data.language,data.desired_pages]);await audit(db,w,actor,'workspace.onboarded','workspace',w);return {ok:true};});
 }
 if(path==='/api/brand-assets'&&method==='POST'){
  if(typeof body.dataURL!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.dataURL))throw new AppError(400,'Upload a PNG, JPEG or WebP logo under 700 KB.');
  const bytes=Buffer.from(body.dataURL.split(',')[1],'base64');if(bytes.length>700000)throw new AppError(413,'Choose a logo under 700 KB.');if(!rasterImage(bytes))throw new AppError(400,'The uploaded logo is not a supported raster image.');let result;try{const image=await sharp(bytes,{limitInputPixels:10000000}).rotate().resize(500,500,{fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});result=await saveAsset(w,null,{bytes:image.data,width:image.info.width,height:image.info.height,mime:'image/png'});}catch{throw new AppError(400,'The logo could not be decoded. Choose a supported image file.');}
  await transaction(w,db=>db.query('INSERT INTO creator.assets(id,workspace_id,path,mime,width,height) VALUES($1,$2,$3,$4,$5,$6)',[result.id,w,result.path,result.mime,result.width,result.height]));return {id:result.id};
 }
 let match=path.match(/^\/api\/(pages|connections|websites|feeds|posts|campaigns)(?:\/([a-f0-9-]{36}))?$/);
 if(match&&['POST','PUT'].includes(method)){
  const [,table,id]=match;if(method==='PUT'&&!id||method==='POST'&&id)throw new AppError(405,'Unsupported operation.');const names={pages:'page',connections:'connection',websites:'website',feeds:'feed',posts:'post',campaigns:'campaign'},data=validate(names[table],body);
  return transaction(w,async db=>{
   await workspaceLock(db,w);
   if(id)await row(db,table,w,id);
   let mirrorIds;
   if(table==='pages'){await workspaceLock(db,w);if(!id)await requirePageCapacity(db,w);if(id&&(await db.query("SELECT id FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status='publishing' LIMIT 1",[w,id])).rowCount)throw new AppError(409,'Wait for the current publication to finish before changing this Page.');await pageChecks(db,w,data,id);mirrorIds=data.mirror_connection_ids;delete data.mirror_connection_ids;for(const cid of mirrorIds){const c=await row(db,'connections',w,cid);if(!['airtable','google_sheets'].includes(c.provider))throw new AppError(400,'Choose a logging connection for mirroring.');}if(id){const old=await row(db,table,w,id);if(old.fb_page_id!==data.fb_page_id||old.facebook_connection_id!==data.facebook_connection_id)data.fb_verified=false;}}
   if(table==='connections'){
    if(id&&(await db.query("SELECT p.id FROM creator.posts p JOIN creator.pages g ON g.workspace_id=p.workspace_id AND g.id=p.page_id WHERE p.workspace_id=$1 AND p.status='publishing' AND g.facebook_connection_id=$2 LIMIT 1",[w,id])).rowCount)throw new AppError(409,'Wait for the current publication to finish before rotating its Page credentials.');
    if(!connectionTypes.some(p=>p.id===data.provider))throw new AppError(400,'Choose a supported connection type.');
    if(connectionTypes.find(p=>p.id===data.provider)?.ownerOnly)requireOwner(actor);
    if(data.config.workflow){requireOwner(actor);data.config.trustedWorkflow=true;}
    if(id&&(await row(db,table,w,id)).provider!==data.provider)throw new AppError(400,'Create a new connection to change provider.');
    if(data.config.url)publicURL(data.config.url);
    if(['wordpress','woocommerce','shopify'].includes(data.provider)&&!data.config.url)throw new AppError(400,'Save the service’s HTTPS URL to scope its credentials.');
    if(data.secret){const prior=id?await row(db,'connections',w,id):null;const changes=Object.fromEntries(Object.entries(data.secret).filter(([,value])=>value));if(Object.keys(changes).length)data.secret_cipher=encryptSecret({...decryptSecret(prior?.secret_cipher,w),...changes},w);}delete data.secret;
    data.status='saved';data.last_test_result=null;data.last_test_at=null;
    if(id)await db.query('UPDATE creator.pages SET fb_verified=false WHERE workspace_id=$1 AND facebook_connection_id=$2',[w,id]);
   }
   if(table==='websites'){publicURL(data.url);if(data.config.catalogURL)publicURL(data.config.catalogURL);if(data.connection_id){const c=await row(db,'connections',w,data.connection_id);if(c.provider!==data.connector||!c.config.url||new URL(c.config.url).origin!==new URL(data.url).origin)throw new AppError(400,'Choose matching service credentials scoped to this website origin.');}}
   if(table==='feeds'){const page=await row(db,'pages',w,data.page_id);if(page.kind!=='news')throw new AppError(400,'Only news Pages can have RSS feeds.');publicURL(data.url);if(data.fallback_url)publicURL(data.fallback_url);}
   if(table==='posts'){
    const page=await row(db,'pages',w,data.page_id);if(data.type==='news'&&page.kind!=='news')throw new AppError(400,'Use a news Page for news articles.');if(data.type==='product_sale'&&page.kind!=='ecommerce')throw new AppError(400,'Use an ecommerce Page for product campaigns.');
    if(data.creative.sourceImage)publicURL(data.creative.sourceImage);
    if(data.product_id){const p=await row(db,'products',w,data.product_id);if(data.type!=='product_sale'||p.website_id!==page.website_id)throw new AppError(400,'Choose a product from this Page’s connected store.');if(!p.available)throw new AppError(409,'This product is out of stock.');}
    if(data.source_url){data.source_url=canonicalArticleURL(data.source_url);if(['news','blog'].includes(data.type)){const prior=id?await row(db,table,w,id):null;data.source_hash=prior?.source_url===data.source_url?prior.source_hash:createHash('sha256').update(data.source_url).digest('hex');}}
    if(['news','product_sale'].includes(data.type)){const product=data.product_id?await row(db,'products',w,data.product_id):null;data.seo={editorialWarnings:editorialWarnings(data.caption,product?{title:product.title,description:product.description,price:product.price,currency:product.currency}:{title:data.title,text:data.body},page.niche),title:data.title.slice(0,60),description:data.caption.slice(0,160)};}
    if(id){const old=await row(db,table,w,id);if(['published','publishing','unknown'].includes(old.status))throw new AppError(409,'Published or unresolved posts cannot be overwritten.');
     const changed=['ratio','style','headline','cta','sourceImage'].some(key=>Object.hasOwn(data.creative,key)&&data.creative[key]!==old.creative[key])||data.title!==old.title||data.product_id!==old.product_id;data.creative={...old.creative,...data.creative};if(changed)delete data.creative.assetId;
     await workspaceLock(db,w);await releasePublication(db,w,id);await db.query("UPDATE creator.tasks SET status='canceled',phase='Post edited',finished_at=now() WHERE workspace_id=$1 AND post_id=$2 AND kind='publish' AND status='queued'",[w,id]);data.version=old.version+1;data.status='draft';data.approved_version=null;data.scheduled_at=null;}
   }
   const result=await save(db,table,w,data,id);if(!result)throw new AppError(404,'Item not found.');
   if(table==='pages'){await db.query('UPDATE creator.page_mirrors SET enabled=false WHERE workspace_id=$1 AND page_id=$2',[w,result.id]);for(const cid of mirrorIds)await db.query('INSERT INTO creator.page_mirrors(workspace_id,page_id,connection_id,enabled) VALUES($1,$2,$3,true) ON CONFLICT(page_id,connection_id) DO UPDATE SET enabled=true',[w,result.id,cid]);}
   await audit(db,w,actor,table+'.saved',table,result.id);if(table==='connections')return {id:result.id,ok:true};return result;
  });
 }
 match=path.match(/^\/api\/(pages|connections|websites|posts)\/([a-f0-9-]{36})\/([a-z-]+)$/);
 if(match&&method==='POST'){
  const [,table,id,action]=match;
  return transaction(w,async db=>{
   await workspaceLock(db,w);const item=await row(db,table,w,id);
   if(table==='connections'&&action==='test')return enqueue(db,w,'test_connection',{input:{connectionId:id}});
   if(table==='pages'&&action==='verify')return enqueue(db,w,'verify_page',{pageId:id});
   if(table==='websites'&&action==='import')return enqueue(db,w,'import_products',{input:{websiteId:id}});
   if(table==='pages'&&action==='aggregate'){await entitlements(db,w);if(item.kind!=='news'||!item.aggregation_enabled)throw new AppError(400,'Aggregation is only enabled for configured news Pages.');return enqueue(db,w,'aggregate',{pageId:id});}
   if(table==='posts'){
    const post=item,page=await row(db,'pages',w,post.page_id);
    if(action==='reconcile'){
     if(post.status!=='unknown'||body.confirmed!==true||typeof body.note!=='string'||body.note.trim().length<10)throw new AppError(400,'Review both the Facebook Page and website, confirm your checks and provide a note.');
     if(body.remote_id){
      if(!new RegExp('^'+page.fb_page_id+'_[0-9]+$').test(body.remote_id))throw new AppError(400,'Enter the full Facebook post ID for this Page.');
      const c=await row(db,'connections',w,page.facebook_connection_id),secret=decryptSecret(c.secret_cipher,w);if(!/^v\d+\.0$/.test(c.config.version||''))throw new AppError(400,'Configure the Graph version first.');
      const proof=await remoteJSON('https://graph.facebook.com/'+c.config.version+'/'+body.remote_id+'?fields=id,created_time',{headers:{authorization:'Bearer '+secret.token}});if(proof.id!==body.remote_id)throw new AppError(400,'The Facebook post could not be verified.');
      await db.query("UPDATE creator.posts SET status='published',fb_post_id=$3,published_at=COALESCE($4::timestamptz,now()),last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,id,proof.id,proof.created_time||null]);await db.query("UPDATE creator.usage_reservations SET status='consumed' WHERE workspace_id=$1 AND post_id=$2",[w,id]);await db.query("UPDATE creator.publish_attempts SET outcome='published',remote_id=$3 WHERE workspace_id=$1 AND post_id=$2 AND outcome IN ('unknown','started')",[w,id,proof.id]);
     }else{
      await db.query("UPDATE creator.posts SET status='draft',approved_version=NULL,scheduled_at=NULL,last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,id]);await db.query("UPDATE creator.usage_reservations SET status='released' WHERE workspace_id=$1 AND post_id=$2",[w,id]);await db.query("UPDATE creator.publish_attempts SET outcome='confirmed_absent' WHERE workspace_id=$1 AND post_id=$2 AND outcome IN ('unknown','started')",[w,id]);
     }
     await audit(db,w,actor,'post.reconciled','post',id,{remoteId:body.remote_id||null,note:body.note.slice(0,1000)});return {ok:true};
    }
    if(['generate','creative'].includes(action)){await requireGenerationCapacity(db,w);return enqueue(db,w,action,{postId:id,pageId:page.id,input:{aiBackground:body.aiBackground===true}});}
    if(['publishing','published','unknown'].includes(post.status))throw new AppError(409,'Reconcile this publication before changing its state.');
    if(action==='approve'){if(!post.caption.trim())throw new AppError(400,'Write or generate a caption first.');if((post.creative.sourceImage||['image','product_sale'].includes(post.type))&&!post.creative.assetId)throw new AppError(409,'Use Design image to prepare and review the photo creative before approval. For a text-only post, remove the source image first.');if(post.seo.editorialWarnings?.length&&body.confirmWarnings!==true)throw new AppError(409,'Review the editorial warnings and explicitly confirm before approving.');await db.query("UPDATE creator.posts SET status='approved',approved_version=version,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,id]);await audit(db,w,actor,'post.approved','post',id,{warningsAcknowledged:body.confirmWarnings===true});return {ok:true};}
    if(action==='draft'){await releasePublication(db,w,id);await db.query("UPDATE creator.tasks SET status='canceled',phase='Returned to draft',finished_at=now() WHERE workspace_id=$1 AND post_id=$2 AND kind='publish' AND status='queued'",[w,id]);await db.query("UPDATE creator.posts SET status='draft',approved_version=NULL,scheduled_at=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,id]);return {ok:true};}
    if(action==='dry-run')return {ok:true,mode:'dry-run',page:page.name,type:post.type,captionReady:!!post.caption,photoReady:!!post.creative.assetId,approvalReady:post.approved_version===post.version,websitePublishing:page.website_publishing,automaticLinkComments:false,checks:['No remote post was submitted.','No publishing allowance was consumed.','Generated captions require factual review.']};
    if(['publish','schedule'].includes(action)){
     if(!env().publishing)throw new AppError(409,'Live publication is disabled by the operator. Dry-run remains available.');
     if(post.approved_version!==post.version)throw new AppError(409,'Approve the current version first.');if(!page.active||!page.fb_verified)throw new AppError(409,'Enable and verify this Page first.');
     const at=action==='schedule'?new Date(body.scheduled_at):new Date();if(!Number.isFinite(+at)||action==='schedule'&&+at<=Date.now())throw new AppError(400,'Choose a future date and time.');if(!inWindow(page,at))throw new AppError(400,'Choose a time within the Page posting window.');
     const existing=(await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND post_id=$2 AND kind='publish' AND status IN ('queued','running')",[w,id])).rows[0];if(existing)throw new AppError(409,'A publication is already queued. Return it to draft to change the schedule.');
     await reservePublication(db,w,id,at);await db.query("UPDATE creator.posts SET status='scheduled',scheduled_at=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,id,at]);const task=await enqueue(db,w,'publish',{postId:id,pageId:page.id,notBefore:at});await audit(db,w,actor,'post.'+action,'post',id,{at});return task;
    }
   }
   throw new AppError(404,'Unknown action.');
  });
 }
 match=path.match(/^\/api\/assets\/([a-f0-9-]{36})$/);
 if(match&&method==='GET'){const asset=await transaction(w,db=>row(db,'assets',w,match[1]));return new Response(await readFile(asset.path),{headers:{'content-type':asset.mime,'cache-control':'private, no-store'}});}
 if(path==='/api/payments'&&method==='POST'){
  const data=validate('payment',body);return transaction(w,async db=>{
   const plan=(await db.query("SELECT * FROM creator.plans WHERE id=$1 AND enabled AND id<>'free'",[data.plan_id])).rows[0],method=(await db.query("SELECT * FROM creator.payment_methods WHERE id=$1 AND enabled AND id<>'stripe'",[data.method])).rows[0];
   const amount=data.currency==='USD'?plan?.usd_minor:plan?.bdt_minor;if(!plan||!method||!amount)throw new AppError(409,'The owner must configure this package price and payment instructions first.');
   const payment=await save(db,'payments',w,{...data,amount_minor:amount});await audit(db,w,actor,'payment.submitted','payment',payment.id);return payment;
  });
 }
 if(path==='/api/billing/checkout'&&method==='POST')return checkout(actor,body);
 if(path==='/api/billing/portal'&&method==='POST')return billingPortal(actor);
 if(path==='/api/automations'&&method==='POST'){
  const data=validate('rule',body);return transaction(w,async db=>{await workspaceLock(db,w);await entitlements(db,w);const page=await row(db,'pages',w,data.page_id);
   if(data.auto_publish&&page.require_review)throw new AppError(400,'Keep auto-publication off while the Page requires human approval.');
   if(data.enabled&&!page.text_connection_id)throw new AppError(400,'Choose a text model on this Page first.');
   if(data.enabled&&page.kind==='news'&&!page.aggregation_enabled)throw new AppError(400,'Enable news aggregation on this Page first.');
   if(data.enabled&&page.kind==='ecommerce'&&!page.website_id)throw new AppError(400,'Choose and import a store catalog first.');
   if(data.enabled&&!['news','ecommerce'].includes(page.kind)&&!data.topic.trim())throw new AppError(400,'Provide verified facts, ideas or a content brief for this automation.');
   const result=(await db.query(`INSERT INTO creator.automation_rules(workspace_id,page_id,name,enabled,interval_minutes,topic,make_creative,auto_publish) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(page_id) DO UPDATE SET name=EXCLUDED.name,enabled=EXCLUDED.enabled,interval_minutes=EXCLUDED.interval_minutes,topic=EXCLUDED.topic,make_creative=EXCLUDED.make_creative,auto_publish=EXCLUDED.auto_publish,next_run_at=now() WHERE creator.automation_rules.workspace_id=$1 RETURNING *`,[w,data.page_id,data.name,data.enabled,data.interval_minutes,data.topic,data.make_creative,data.auto_publish])).rows[0];await audit(db,w,actor,'automation.configured','automation_rule',result.id);return result;
  });
 }
 if(path==='/api/ad-drafts'&&method==='POST'){
  const data=validate('ad',body);return transaction(w,async db=>{await row(db,'campaigns',w,data.campaign_id);const result=await save(db,'ad_drafts',w,data);await audit(db,w,actor,'ad.drafted','ad_draft',result.id);return result;});
 }
 if(path.startsWith('/api/owner/')){requireOwner(actor);return ownerAPI(actor,request,path,body);}
 throw new AppError(404,'This operation was not found.');
}
async function ownerAPI(actor,request,path,body){
 return transaction(null,async db=>{
  if(path==='/api/owner/state'&&request.method==='GET'){
   const result={};for(const table of ['accounts','workspaces','subscriptions','plans','payment_methods'])result[table]=(await db.query('SELECT * FROM creator.'+table)).rows;
   result.payments=(await db.query('SELECT * FROM creator.payments ORDER BY created_at DESC LIMIT 200')).rows;result.activity=(await db.query('SELECT * FROM creator.activity ORDER BY created_at DESC LIMIT 200')).rows;
   result.pages=(await db.query('SELECT id,workspace_id,name,kind,language,active,created_at FROM creator.pages ORDER BY created_at DESC LIMIT 300')).rows;return result;
  }
  let m=path.match(/^\/api\/owner\/(accounts|workspaces)\/([a-f0-9-]{36})$/);
  if(m&&request.method==='PUT'){
   if(!['active','suspended'].includes(body.status))throw new AppError(400,'Choose active or suspended.');
   if(m[1]==='accounts'&&m[2]===actor.id)throw new AppError(400,'You cannot suspend your owner account.');
   if(m[1]==='workspaces'&&(await db.query('SELECT owner_id FROM creator.workspaces WHERE id=$1',[m[2]])).rows[0]?.owner_id===actor.id)throw new AppError(400,'Keep the owner workspace active.');
   const result=await db.query(`UPDATE creator.${m[1]} SET status=$2 WHERE id=$1 RETURNING id`,[m[2],body.status]);if(!result.rowCount)throw new AppError(404,'Item not found.');await audit(db,null,actor,m[1]+'.'+body.status,m[1],m[2]);return {ok:true};
  }
  m=path.match(/^\/api\/owner\/plans\/([a-z0-9-]{1,40})$/);
  if(m&&request.method==='PUT'){
   const data=validate('plan',body);if(m[1]==='free'&&(data.page_limit!==1||data.post_limit!==3||data.period_days!==7))throw new AppError(400,'The free trial stays at one Page, three posts and seven days.');
   await db.query(`UPDATE creator.plans SET name=$2,page_limit=$3,post_limit=$4,generation_limit=$5,period_days=$6,usd_minor=$7,bdt_minor=$8,enabled=$9 WHERE id=$1`,[m[1],data.name,data.page_limit,data.post_limit,data.generation_limit,data.period_days,data.usd_minor,data.bdt_minor,data.enabled]);await audit(db,null,actor,'plan.updated','plan',m[1]);return {ok:true};
  }
  m=path.match(/^\/api\/owner\/workspaces\/([a-f0-9-]{36})\/subscription$/);
  if(m&&request.method==='PUT'){
   const workspace=(await db.query('SELECT id FROM creator.workspaces WHERE id=$1',[m[1]])).rows[0];if(!workspace)throw new AppError(404,'Workspace not found.');
   if(typeof body.note!=='string'||body.note.trim().length<10)throw new AppError(400,'Add an administrative reason for the subscription change.');
   if(body.status==='active')await grantPlan(db,workspace.id,String(body.plan_id||''),{provider:'owner_grant'});
   else if(['canceled','past_due','expired'].includes(body.status))await db.query('UPDATE creator.subscriptions SET status=$2,updated_at=now() WHERE workspace_id=$1',[workspace.id,body.status]);
   else throw new AppError(400,'Choose an active premium package or a subscription status.');
   await audit(db,workspace.id,actor,'subscription.owner_updated','subscription',workspace.id,{plan:body.plan_id,status:body.status,note:body.note.slice(0,1000)});return {ok:true};
  }
  m=path.match(/^\/api\/owner\/workspaces\/([a-f0-9-]{36})\/inspect$/);
  if(m&&request.method==='GET'){
   const workspace=(await db.query('SELECT * FROM creator.workspaces WHERE id=$1',[m[1]])).rows[0];if(!workspace)throw new AppError(404,'Workspace not found.');
   const result={workspace,entitlements:await entitlements(db,workspace.id,{allowExpired:true})};for(const table of ['pages','posts','tasks','campaigns','activity'])result[table]=(await db.query(`SELECT * FROM creator.${table} WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100`,[workspace.id])).rows;
   return result;
  }
  m=path.match(/^\/api\/owner\/payment-methods\/(bank|stripe|crypto|bkash|nagad|cash)$/);
  if(m&&request.method==='PUT'){
   if(typeof body.enabled!=='boolean'||typeof body.instructions!=='string'||body.instructions.length>3000)throw new AppError(400,'Provide payment instructions and an enabled setting.');
   if(body.enabled&&!body.instructions.trim()&&m[1]!=='stripe')throw new AppError(400,'Add receiving instructions before enabling this method.');
   await db.query('UPDATE creator.payment_methods SET enabled=$2,instructions=$3 WHERE id=$1',[m[1],body.enabled,body.instructions]);await audit(db,null,actor,'payment_method.updated','payment_method',m[1]);return {ok:true};
  }
  m=path.match(/^\/api\/owner\/payments\/([a-f0-9-]{36})\/(approve|reject)$/);
  if(m&&request.method==='POST'){
   const payment=(await db.query('SELECT * FROM creator.payments WHERE id=$1 FOR UPDATE',[m[1]])).rows[0];if(!payment)throw new AppError(404,'Payment not found.');if(payment.status!=='pending')throw new AppError(409,'This payment was already reviewed.');
   if(m[2]==='approve')await grantPlan(db,payment.workspace_id,payment.plan_id);await db.query('UPDATE creator.payments SET status=$2,reviewed_by=$3,review_note=$4,reviewed_at=now() WHERE id=$1',[payment.id,m[2]==='approve'?'approved':'rejected',actor.id,String(body.note||'').slice(0,1000)]);await audit(db,payment.workspace_id,actor,'payment.'+m[2],'payment',payment.id);return {ok:true};
  }
  throw new AppError(404,'Owner operation not found.');
 },{owner:true});
}
