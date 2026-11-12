import {preserveProfileSettings} from './profile-settings-merge.mjs';
import {workflowMediaProblem} from '../shared/content-workflow.mjs';
import {preparePageProfile,effectiveProfilePage,assertPageConnector} from './profile-config.mjs';
import {nichePresets} from './niches.mjs';
import {contentListQuery} from './content-list.mjs';
import {ATTENTION_SQL} from '../shared/content-status.mjs';
import {pageCatalogue,catalogueFeedURL,newCataloguePolicy} from './meta-catalogue.mjs';
import {queueApprovalNotification} from './notifications.mjs';
import {inferenceHost,inspectInferenceHost,saveInferenceHost} from './inference-host.mjs';
import {listFonts,uploadFont} from './fonts.mjs';
import {postListColumns,productListColumns,taskListColumns} from './read-model.mjs';
import {databaseProfileSchema,parseDatabaseSecret,sealDatabaseSecret,openDatabaseSecret,safeDatabaseProfile,probeDatabase} from './database-profiles.mjs';
import {databaseTelemetry} from './database-telemetry.mjs';
import {operationsSnapshot} from './operations-monitor.mjs';
import {preserveEditorialState,addEditorialFeedback} from './editorial-memory.mjs';
import {analyzeProduct} from './product-analysis.mjs';
import {PRODUCT_DESIGN_VERSION} from './product-design.mjs';
import {readFile} from 'node:fs/promises';
import {transaction,audit,workspaceLock} from './db.mjs';
import {resolveActor,requireOwner,requireVerified} from './auth.mjs';
import {identityStatus} from './identity.mjs';
import {env} from './env.mjs';
import {AppError,uuid} from './errors.mjs';
import {validate} from './validation.mjs';
import {encryptSecret,decryptSecret} from './vault.mjs';
import {providers,connectionTypes} from './providers.mjs';
import {localInferenceGate} from './inference-resources.mjs';
import {publicURL,remoteJSON} from './net.mjs';
import {entitlements,requirePageCapacity,requireGenerationCapacity,reservePublication,releasePublication} from './quotas.mjs';
import {enqueue,row} from './jobs.mjs';
import {grantPlan,checkout,billingPortal} from './billing.mjs';
import {nextSlot,wallTimeToInstant} from './scheduling.mjs';
import {approve,queuePublication} from './planner.mjs';
import {editorialWarnings} from './editorial.mjs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {saveAsset,rasterImage} from './creative.mjs';
import {canonicalArticleURL} from './catalog.mjs';
import {resolveFacebookPage} from './facebook.mjs';
import {insightRecords,summarizeInsights,personalBrandAnalytics} from './insights.mjs';
import {cutoutAvailable} from './cutout.mjs';
import {submitContact} from './contact.mjs';
import {categoryFor} from './content-policy.mjs';
import {discoverInstagram,queueInstagramDelivery} from './instagram.mjs';
import {metaAppProfiles,metaAppCredentials} from './meta-apps.mjs';
const safeConnections=`id,workspace_id,provider,name,config,status,last_test_at,last_test_result,created_at,(secret_cipher IS NOT NULL) AS has_secret`;
async function save(db,table,w,data,id){
 const names=Object.keys(data),values=Object.values(data).map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x);
 if(id)return(await db.query(`UPDATE creator.${table} SET ${names.map((n,i)=>n+'=$'+(i+3)).join(',')} WHERE workspace_id=$1 AND id=$2 RETURNING *`,[w,id,...values])).rows[0];
 return(await db.query(`INSERT INTO creator.${table}(workspace_id,${names.join(',')}) VALUES($1,${names.map((_,i)=>'$'+(i+2)).join(',')}) RETURNING *`,[w,...values])).rows[0];
}
async function pageChecks(db,w,data,id){
 if(data.destination_type==='facebook_profile'){
  if(data.fb_page_id||data.facebook_connection_id)throw new AppError(400,'A personal-profile workspace uses manual handoff and does not accept Page tokens. Create a separate workspace entry for a Facebook Page.');
  if(data.profile_url){const url=publicURL(data.profile_url);if(!['facebook.com','www.facebook.com','m.facebook.com'].includes(url.hostname))throw new AppError(400,'Enter your HTTPS Facebook profile URL.');}
 }
 if(id){const prior=await row(db,'pages',w,id);if(prior.destination_type!==data.destination_type&&(await db.query("SELECT id FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status IN ('published','publishing','scheduled','unknown','ready_manual') LIMIT 1",[w,id])).rowCount)throw new AppError(409,'Create a separate Page/profile entry instead of changing a destination with publishing history.');}
 try{new Intl.DateTimeFormat('en',{timeZone:data.timezone}).format();}catch{throw new AppError(400,'Enter a valid IANA timezone, such as Asia/Dhaka.');}
 if(data.creative_policy.nichePreset&&!nichePresets.some(n=>n.id===data.creative_policy.nichePreset&&n.kind===data.kind))throw new AppError(400,'Choose a niche preset matching this Page type.');
 if(data.aggregation_enabled&&data.kind!=='news')throw new AppError(400,'RSS aggregation is available only on news Pages.');
 for(const key of ['headlineFontAssetId','bodyFontAssetId'])if(effectiveProfilePage(data).brand[key]){const asset=await row(db,'assets',w,effectiveProfilePage(data).brand[key]);if(!['font/ttf','font/otf'].includes(asset.mime))throw new AppError(400,'Choose a font asset for Page typography.');}
 for(const key of ['logoAssetId','logoLightAssetId','logoDarkAssetId'])if(data.brand[key]){const asset=await row(db,'assets',w,data.brand[key]);if(!asset.mime.startsWith('image/'))throw new AppError(400,'Choose an image asset for a logo.');}
 if(data.active&&id){const migration=(await db.query("SELECT detail FROM creator.legacy_imports WHERE workspace_id=$1 AND kind='page' AND resource_id=$2",[w,id])).rows[0];if(migration?.detail.requiresCutover)throw new AppError(409,'Complete the legacy workflow cutover before enabling this migrated Page.');}
 if(data.website_publishing&&!data.website_id)throw new AppError(400,'Choose a website or turn website publishing off.');
 if(data.website_id){const s=await row(db,'websites',w,data.website_id);if(new URL(s.url).hostname==='nobleseek.fabrything.com'&&/^(?:https?:\/\/)?(?:www\.)?fabrything\.com\/nobleseek\/?$/.test(data.creative_policy.websiteLabel||''))data.creative_policy.websiteLabel='nobleseek.fabrything.com';if(data.website_publishing&&!['wordpress','nobleseek_db'].includes(s.connector))throw new AppError(400,'Choose a supported website publisher or leave website publishing disabled.');}
 for(const [key,capability] of [['stockConnectionId','stock'],['ttsConnectionId','audio']])if(data.creative_policy.reels?.[key]){const c=await row(db,'connections',w,data.creative_policy.reels[key]);if(!connectionTypes.find(p=>p.id===c.provider)?.capabilities.includes(capability))throw new AppError(400,'Choose a matching reel media connection.');}
 for(const [key,capability] of [['text_connection_id','text'],['image_connection_id','image'],['facebook_connection_id','publish'],['notification_connection_id','notify']])if(data[key]){const c=await row(db,'connections',w,data[key]);if(!connectionTypes.find(p=>p.id===c.provider)?.capabilities.includes(capability))throw new AppError(400,'Choose a compatible '+capability+' connection.');}
}
export async function api(request,path,body={},identityVerifier){
 const method=request.method;
 if(path==='/api/contact'){
  if(method!=='POST')throw new AppError(405,'Use the contact form to send a message.');
  if(request.headers.get('origin')!==env().origin)throw new AppError(403,'Submit the contact form from EchoLink.');
  return submitContact(body);
 }
 if(path==='/api/public'&&method==='GET')return transaction(null,async db=>({identity:identityStatus(),local:!env().production,publishingEnabled:env().publishing,plans:(await db.query('SELECT * FROM creator.plans WHERE enabled ORDER BY page_limit')).rows,providers,paymentMethods:(await db.query('SELECT id,label,markets,instructions,enabled FROM creator.payment_methods ORDER BY id')).rows}));
 const actor=await resolveActor(request,identityVerifier),w=actor.workspaceId;
 if(method!=='GET')requireVerified(actor);
 const catalogue=path.match(/^\/api\/pages\/([a-f0-9-]{36})\/meta-catalogue$/);
 if(catalogue&&['GET','POST'].includes(method))return transaction(w,async db=>{
  const result=await pageCatalogue(db,w,catalogue[1]);let policy=result.page.creative_policy?.metaCatalogue;
  if(method==='POST'){
   if(!['enable','rotate','disable'].includes(body.action))throw new AppError(400,'Choose enable, rotate or disable.');
   policy=body.action==='enable'&&policy?.enabled?policy:newCataloguePolicy(body.action!=='disable');
   await db.query("UPDATE creator.pages SET creative_policy=jsonb_set(creative_policy,'{metaCatalogue}',$3::jsonb),updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,catalogue[1],JSON.stringify(policy)]);
   await audit(db,w,actor,'catalogue.feed.'+body.action,'page',catalogue[1]);
  }
  return {csv:result.csv,included:result.included,excluded:result.excluded,issues:result.issues,total:result.total,lastImportedAt:result.lastImportedAt,feedURL:catalogueFeedURL(w,catalogue[1],policy),enabled:policy?.enabled===true};
 });
 if(path==='/api/state'&&method==='GET'){const requestStarted=performance.now();return transaction(w,async db=>{
  const contentRevision=(await db.query('SELECT revision::text FROM creator.workspace_revisions WHERE workspace_id=$1',[w])).rows[0]?.revision||'0';
  const data={actor:{id:actor.id,name:actor.name,email:actor.email,role:actor.role,email_verified:actor.email_verified},workspace:actor.workspace,workspaces:actor.workspaces,entitlements:await entitlements(db,w,{allowExpired:true}),providers:connectionTypes.filter(p=>!p.ownerOnly||actor.role==='super_admin'),publishingEnabled:env().publishing,environment:env().production?'production':'development'};
  for(const table of ['pages','websites','feeds','products','posts','tasks','campaigns','ad_drafts','payments','automation_rules','social_destinations','social_deliveries'])data[table]=(await db.query(`SELECT ${table==='posts'?postListColumns:table==='products'?productListColumns+",ARRAY(SELECT DISTINCT s.page_id FROM creator.posts s WHERE s.workspace_id=creator.products.workspace_id AND s.product_id=creator.products.id AND (s.status='published' OR s.fb_post_id IS NOT NULL OR s.published_at IS NOT NULL)) AS published_page_ids":table==='tasks'?taskListColumns:'*'} FROM creator.${table} WHERE workspace_id=$1 ${table==='posts'?'AND archived_at IS NULL AND deleted_at IS NULL':''} ORDER BY ${table==='feeds'?'name':table==='products'?'fetched_at':table==='social_destinations'?'verified_at':table==='posts'?'updated_at':'created_at'} DESC${table==='posts'?', id DESC':''} LIMIT 300`,[w])).rows;
  data.catalogHistory=(await db.query("SELECT g.id AS page_id,count(p.id)::int AS fetched,count(p.id) FILTER(WHERE EXISTS(SELECT 1 FROM creator.posts s WHERE s.workspace_id=p.workspace_id AND s.page_id=g.id AND s.product_id=p.id AND (s.status='published' OR s.fb_post_id IS NOT NULL OR s.published_at IS NOT NULL)))::int AS published FROM creator.pages g LEFT JOIN creator.products p ON p.workspace_id=g.workspace_id AND p.website_id=g.website_id WHERE g.workspace_id=$1 AND g.kind='ecommerce' GROUP BY g.id",[w])).rows;
  data.connections=(await db.query(`SELECT ${safeConnections} FROM creator.connections WHERE workspace_id=$1 ORDER BY created_at DESC`,[w])).rows;
  data.creativeTools={localCutout:cutoutAvailable()};if(actor.role==='super_admin')data.inference=localInferenceGate.status();
  data.metaApps=actor.role==='super_admin'?await metaAppProfiles():[];
  if(actor.role==='super_admin')data.operationalEpoch=(await db.query("SELECT value FROM creator.platform_settings WHERE key='operational_epoch'")).rows[0]?.value||null;
  data.analytics=(await db.query('SELECT DISTINCT ON(page_id,platform) id,page_id,platform,report,observed_at FROM creator.analytics_reports WHERE workspace_id=$1 ORDER BY page_id,platform,observed_at DESC',[w])).rows;
  data.linkComments=(await db.query('SELECT id,page_id,post_id,platform,status,url,due_at,remote_id,last_error,published_at FROM creator.link_comments WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 200',[w])).rows;
  data.publicationDeliveries=(await db.query('SELECT * FROM creator.publication_deliveries WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 300',[w])).rows;
  data.attentionPosts=(await db.query(`SELECT ${postListColumns} FROM creator.posts WHERE workspace_id=$1 AND archived_at IS NULL AND deleted_at IS NULL AND ${ATTENTION_SQL} ORDER BY updated_at DESC LIMIT 200`,[w])).rows;
  data.pageBranding=(await db.query('SELECT * FROM creator.page_branding WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50',[w])).rows;
  data.insights=(await db.query('SELECT DISTINCT ON(page_id) page_id,source,observed_at,records FROM creator.insight_snapshots WHERE workspace_id=$1 ORDER BY page_id,observed_at DESC',[w])).rows.map(s=>({page_id:s.page_id,source:s.source,observed_at:s.observed_at,summary:summarizeInsights(s.records,data.pages.find(p=>p.id===s.page_id)?.timezone),recent:s.records.slice(0,10)}));
  for(const snapshot of data.insights){const page=data.pages.find(p=>p.id===snapshot.page_id);if(page?.entity_type==='PERSONAL_PROFILE'){
   const saved=(await db.query('SELECT records FROM creator.insight_snapshots WHERE workspace_id=$1 AND page_id=$2 ORDER BY observed_at DESC LIMIT 1',[w,page.id])).rows[0];
   snapshot.personalBrand=personalBrandAnalytics(saved?.records||[],page.profile_config?.grounding?.topic_pillars);
  }}
  data.activity=(await db.query(`SELECT a.*,COALESCE(p.page_id,t.page_id,r.page_id,f.page_id) AS page_id FROM creator.activity a LEFT JOIN creator.posts p ON p.workspace_id=a.workspace_id AND p.id::text=a.resource_id LEFT JOIN creator.tasks t ON t.workspace_id=a.workspace_id AND t.id::text=a.resource_id LEFT JOIN creator.automation_rules r ON r.workspace_id=a.workspace_id AND r.id::text=a.resource_id LEFT JOIN creator.feeds f ON f.workspace_id=a.workspace_id AND f.id::text=a.resource_id WHERE a.workspace_id=$1 ORDER BY a.created_at DESC LIMIT 200`,[w])).rows;
  data.pageContentStatusCounts=(await db.query('SELECT page_id,content_status AS status,count(*)::int AS count FROM creator.posts WHERE workspace_id=$1 AND archived_at IS NULL AND deleted_at IS NULL GROUP BY page_id,content_status',[w])).rows;
  data.contentStatusCounts=data.pageContentStatusCounts.reduce((out,r)=>({...out,[r.status]:(out[r.status]||0)+r.count}),{});
  data.postCounts=Object.fromEntries((await db.query('SELECT status,count(*)::int AS count FROM creator.posts WHERE workspace_id=$1 AND archived_at IS NULL AND deleted_at IS NULL GROUP BY status',[w])).rows.map(r=>[r.status,r.count]));
  data.pagePostCounts=(await db.query('SELECT page_id,status,count(*)::int AS count FROM creator.posts WHERE workspace_id=$1 AND archived_at IS NULL AND deleted_at IS NULL GROUP BY page_id,status',[w])).rows;
  data.archiveCounts=(await db.query('SELECT count(*) FILTER(WHERE archived_at IS NOT NULL AND deleted_at IS NULL)::int AS archived,count(*) FILTER(WHERE deleted_at IS NOT NULL)::int AS trash FROM creator.posts WHERE workspace_id=$1',[w])).rows[0];
  data.pageArchiveCounts=(await db.query('SELECT page_id,count(*) FILTER(WHERE archived_at IS NOT NULL AND deleted_at IS NULL)::int AS archived,count(*) FILTER(WHERE deleted_at IS NOT NULL)::int AS trash FROM creator.posts WHERE workspace_id=$1 GROUP BY page_id',[w])).rows;
  data.pageConnections=(await db.query('SELECT * FROM creator.page_connections WHERE workspace_id=$1',[w])).rows;
  data.calendar=(await db.query("SELECT id,page_id,type,title,status,version,approved_version,planned_at,scheduled_at,published_at,jsonb_build_object('assetId',creative->'assetId') AS creative FROM creator.posts WHERE workspace_id=$1 AND deleted_at IS NULL AND archived_at IS NULL AND COALESCE(published_at,scheduled_at,planned_at) BETWEEN now()-interval '7 days' AND now()+interval '14 days' ORDER BY COALESCE(published_at,scheduled_at,planned_at) LIMIT 3000",[w])).rows;
  data.queueCoverage=(await db.query("SELECT p.id AS page_id,min(s.scheduled_at) FILTER(WHERE s.status='scheduled' AND s.scheduled_at>now()) AS next_at,max(s.scheduled_at) FILTER(WHERE s.status='scheduled' AND s.scheduled_at>now()) AS last_at,count(*) FILTER(WHERE s.status='scheduled' AND s.scheduled_at>now())::int AS count,count(*) FILTER(WHERE s.status='published' AND (s.published_at AT TIME ZONE p.timezone)::date=(now() AT TIME ZONE p.timezone)::date)::int AS published_today,count(*) FILTER(WHERE s.status='scheduled' AND (s.scheduled_at AT TIME ZONE p.timezone)::date=(now() AT TIME ZONE p.timezone)::date)::int AS scheduled_today FROM creator.pages p LEFT JOIN creator.posts s ON s.workspace_id=p.workspace_id AND s.page_id=p.id AND s.deleted_at IS NULL AND s.archived_at IS NULL WHERE p.workspace_id=$1 GROUP BY p.id",[w])).rows;
  const integrations=(await db.query("SELECT value FROM creator.platform_settings WHERE key='globalConnections'")).rows[0]?.value||{};data.globalIntegrations={n8nVisible:actor.role==='super_admin'||integrations.n8nVisibleToClients===true,n8nEnabled:integrations.n8nEnabled===true,n8nClientsAllowed:integrations.n8nVisibleToClients===true,n8nConfigured:!!process.env.N8N_BASE_URL&&!!process.env.N8N_API_KEY};
  data.pageMirrors=(await db.query('SELECT * FROM creator.page_mirrors WHERE workspace_id=$1',[w])).rows;
  data.mirrorStatus=(await db.query("SELECT post_id,connection_id,status,attempts,last_error FROM creator.mirror_outbox WHERE workspace_id=$1 AND status<>'synced' ORDER BY next_attempt_at LIMIT 50",[w])).rows;
  data.plans=(await db.query('SELECT * FROM creator.plans ORDER BY page_limit')).rows;data.paymentMethods=(await db.query('SELECT id,label,markets,instructions,enabled FROM creator.payment_methods ORDER BY id')).rows;data.telemetry={contentRevision,serverTime:new Date().toISOString(),stateReadMs:Math.round(performance.now()-requestStarted)};return data;
 },{snapshot:true});}
 // Finite SSE frames survive the existing buffered bridge/serverless proxy.
 // EventSource reconnects every three seconds; each frame reauthenticates and
 // releases its database connection before returning. No tenant data in URLs.
 if(path==='/api/content-events'&&method==='GET'){
  const pulse=await transaction(w,async db=>({revision:(await db.query('SELECT revision::text FROM creator.workspace_revisions WHERE workspace_id=$1',[w])).rows[0]?.revision||'0',at:new Date().toISOString()}));
  return new Response('retry: 3000\nid: '+pulse.revision+'\nevent: content\ndata: '+JSON.stringify(pulse)+'\n\n',{headers:{'content-type':'text/event-stream','cache-control':'no-store','x-accel-buffering':'no'}});
 }
 if(path==='/api/pulse'&&method==='GET')return transaction(w,async db=>({revision:(await db.query('SELECT revision::text FROM creator.workspace_revisions WHERE workspace_id=$1',[w])).rows[0]?.revision||'0',tasks:(await db.query(`SELECT ${taskListColumns} FROM creator.tasks WHERE workspace_id=$1 AND (status IN ('queued','running') OR finished_at>now()-interval '2 hours') ORDER BY created_at DESC LIMIT 40`,[w])).rows,at:new Date().toISOString()}));
 const productDetail=path.match(/^\/api\/products\/([a-f0-9-]{36})$/);if(productDetail&&method==='GET')return transaction(w,db=>row(db,'products',w,productDetail[1]));
 if(path==='/api/calendar'&&method==='GET')return transaction(w,async db=>{
  const params=new URL(request.url).searchParams,from=params.get('from'),to=params.get('to'),page=params.get('page');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(to)<Date.parse(from)||Date.parse(to)-Date.parse(from)>42*86400000||page&&!uuid(page))throw new AppError(400,'Choose a calendar period of up to six weeks.');
  return (await db.query("SELECT id,page_id,type,title,status,version,approved_version,planned_at,scheduled_at,published_at,jsonb_build_object('assetId',creative->'assetId') AS creative FROM creator.posts WHERE workspace_id=$1 AND ($2::uuid IS NULL OR page_id=$2) AND deleted_at IS NULL AND archived_at IS NULL AND COALESCE(published_at,scheduled_at,planned_at) BETWEEN $3::date-interval '1 day' AND $4::date+interval '2 days' ORDER BY COALESCE(published_at,scheduled_at,planned_at) LIMIT 10000",[w,page||null,from,to])).rows;
 });
 if(path==='/api/posts'&&method==='GET'){
  const list=contentListQuery(new URL(request.url).searchParams);return transaction(w,async db=>{
   const values=[w,...list.values],total=(await db.query(`SELECT count(*)::int AS total FROM creator.posts WHERE ${list.where}`,values)).rows[0].total;
   const posts=(await db.query(`SELECT ${postListColumns} FROM creator.posts WHERE ${list.where} ORDER BY ${list.order} LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,list.limit,list.offset])).rows;
   return {posts,total,offset:list.offset,hasMore:list.offset+posts.length<total};
  },{snapshot:true});
 }
 if(path==='/api/onboarding'&&method==='POST'){
  const data=validate('onboarding',body);return transaction(w,async db=>{await db.query('UPDATE creator.workspaces SET name=$2,niche=$3,language=$4,desired_pages=$5,onboarded=true WHERE id=$1',[w,data.name,data.niche,data.language,data.desired_pages]);await audit(db,w,actor,'workspace.onboarded','workspace',w);return {ok:true};});
 }
 if(path==='/api/global-integrations/test'&&method==='POST')return transaction(w,async db=>{
  const settings=(await db.query("SELECT value FROM creator.platform_settings WHERE key='globalConnections'")).rows[0]?.value||{};
  if(actor.role!=='super_admin'&&(!settings.n8nVisibleToClients||!settings.n8nEnabled))throw new AppError(403,'The owner has not enabled the shared n8n service for clients.');
  if(!process.env.N8N_BASE_URL||!process.env.N8N_API_KEY)throw new AppError(503,'The operator must configure the shared n8n server.');
  let response;try{response=await fetch(new URL('/api/v1/workflows?limit=1',process.env.N8N_BASE_URL),{headers:{'X-N8N-API-KEY':process.env.N8N_API_KEY},signal:AbortSignal.timeout(15000)});}catch{throw new AppError(503,'The shared n8n server is offline.');}
  if(!response.ok)throw new AppError(503,'The shared n8n server rejected its operator credentials.');return {ok:true,message:'Shared n8n server is connected. Workspace credentials remain private.'};
 });
 const commentRetry=path.match(/^\/api\/posts\/([a-f0-9-]{36})\/link-comment$/);
 if(commentRetry&&method==='POST')return transaction(w,async db=>{await workspaceLock(db,w);const post=await row(db,'posts',w,commentRetry[1]),page=await row(db,'pages',w,post.page_id),comment=(await db.query('SELECT * FROM creator.link_comments WHERE workspace_id=$1 AND post_id=$2 FOR UPDATE',[w,post.id])).rows[0];if(!comment||comment.status!=='failed'||!page.creative_policy?.linkComments?.enabled)throw new AppError(409,'Only a confirmed failed comment can be retried. Unknown outcomes need inspection on Facebook.');if((await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND post_id=$2 AND kind='post_link_comment' AND status IN ('queued','running')",[w,post.id])).rowCount)throw new AppError(409,'This comment already has an active task.');await db.query("UPDATE creator.link_comments SET status='queued',last_error=NULL WHERE id=$1",[comment.id]);return enqueue(db,w,'post_link_comment',{pageId:page.id,postId:post.id,notBefore:new Date(Math.max(Date.now(),+new Date(comment.due_at))),input:{commentId:comment.id}});});
 let brandingMatch=path.match(/^\/api\/pages\/([a-f0-9-]{36})\/branding$/);
 if(brandingMatch&&method==='POST')return transaction(w,async db=>{await workspaceLock(db,w);const page=await row(db,'pages',w,brandingMatch[1]);if(!['profile','cover'].includes(body.kind)||typeof body.prompt!=='string'||body.prompt.length>2000||String(body.headline||'').length>80)throw new AppError(400,'Choose profile/cover, a prompt up to 2000 characters and headline up to 80.');await requireGenerationCapacity(db,w);if(body.useAI&&!page.image_connection_id)throw new AppError(400,'Choose an image provider on this Page, or use Designed studio.');const draft=(await db.query('INSERT INTO creator.page_branding(workspace_id,page_id,kind,prompt,headline) VALUES($1,$2,$3,$4,$5) RETURNING *',[w,page.id,body.kind,body.prompt,String(body.headline||'')])).rows[0];return enqueue(db,w,'design_page_brand',{pageId:page.id,input:{brandingId:draft.id,useAI:body.useAI===true}});});
 brandingMatch=path.match(/^\/api\/pages\/([a-f0-9-]{36})\/branding\/([a-f0-9-]{36})\/apply$/);
 if(brandingMatch&&method==='POST')return transaction(w,async db=>{await workspaceLock(db,w);const page=await row(db,'pages',w,brandingMatch[1]),draft=(await db.query('SELECT * FROM creator.page_branding WHERE workspace_id=$1 AND page_id=$2 AND id=$3 FOR UPDATE',[w,page.id,brandingMatch[2]])).rows[0];if(!draft)throw new AppError(404,'Branding draft not found.');if(body.confirmed!==true||!['ready','failed'].includes(draft.status)||!draft.asset_id||!page.fb_verified)throw new AppError(409,'Preview a ready design and explicitly choose Apply to this Facebook Page.');if((await db.query("SELECT t.id FROM creator.tasks t JOIN creator.page_branding b ON b.workspace_id=t.workspace_id AND b.id::text=t.input->>'brandingId' WHERE t.workspace_id=$1 AND b.page_id=$2 AND b.kind=$3 AND t.status IN ('queued','running')",[w,page.id,draft.kind])).rowCount)throw new AppError(409,'A branding update for this Page and format already has an active task.');await db.query("UPDATE creator.page_branding SET status='ready',last_error=NULL WHERE workspace_id=$1 AND id=$2",[w,draft.id]);return enqueue(db,w,'apply_page_brand',{pageId:page.id,input:{brandingId:draft.id}});});
 if(path==='/api/brand-fonts'&&method==='GET')return listFonts(w);
 if(path==='/api/brand-fonts'&&method==='POST')return uploadFont(w,body);
 if(path==='/api/brand-assets'&&method==='POST'){
  if(typeof body.dataURL!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.dataURL))throw new AppError(400,'Upload a PNG, JPEG or WebP logo under 700 KB.');
  const bytes=Buffer.from(body.dataURL.split(',')[1],'base64');if(bytes.length>700000)throw new AppError(413,'Choose a logo under 700 KB.');if(!rasterImage(bytes))throw new AppError(400,'The uploaded logo is not a supported raster image.');let result;try{const image=await sharp(bytes,{limitInputPixels:10000000}).rotate().resize(500,500,{fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});result=await saveAsset(w,null,{bytes:image.data,width:image.info.width,height:image.info.height,mime:'image/png'});}catch{throw new AppError(400,'The logo could not be decoded. Choose a supported image file.');}
  await transaction(w,db=>db.query('INSERT INTO creator.assets(id,workspace_id,path,mime,width,height) VALUES($1,$2,$3,$4,$5,$6)',[result.id,w,result.path,result.mime,result.width,result.height]));return {id:result.id};
 }
 let match=path.match(/^\/api\/(pages|connections|websites|feeds|posts|campaigns)(?:\/([a-f0-9-]{36}))?$/);
 if(match&&method==='GET'&&match[1]==='posts'&&match[2])return transaction(w,db=>row(db,'posts',w,match[2]));
 if(match&&['POST','PUT'].includes(method)){
  const [,table,id]=match;if(method==='PUT'&&!id||method==='POST'&&id)throw new AppError(405,'Unsupported operation.');const names={pages:'page',connections:'connection',websites:'website',feeds:'feed',posts:'post',campaigns:'campaign'};let data=table==='pages'&&id?null:validate(names[table],body);
  return transaction(w,async db=>{
   await workspaceLock(db,w);
   if(id){const prior=await row(db,table,w,id);if(table==='pages')data=validate('page',preserveProfileSettings(body,prior));}
   let mirrorIds,connectionPage,websitePage;if(table==='connections'&&body.page_id){connectionPage=await row(db,'pages',w,body.page_id);assertPageConnector(connectionPage,data.provider);}if(table==='websites'&&body.page_id)websitePage=await row(db,'pages',w,body.page_id);
   if(table==='pages'){await workspaceLock(db,w);preparePageProfile(data,body,id?await row(db,'pages',w,id):null);if(id){const prior=await row(db,'pages',w,id);data.creative_policy=preserveEditorialState(data.creative_policy,prior.creative_policy);}for(const link of data.creative_policy.editorial?.referenceLinks||[])publicURL(link);if(id&&!Object.hasOwn(body.creative_policy||{},'linkComments')){const prior=await row(db,'pages',w,id);if(prior.creative_policy.linkComments)data.creative_policy.linkComments=prior.creative_policy.linkComments;}if(!id)await requirePageCapacity(db,w);if(id&&(await db.query("SELECT id FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status='publishing' LIMIT 1",[w,id])).rowCount)throw new AppError(409,'Wait for the current publication to finish before changing this Page.');await pageChecks(db,w,data,id);mirrorIds=data.mirror_connection_ids;delete data.mirror_connection_ids;for(const cid of mirrorIds){const c=await row(db,'connections',w,cid);if(!['airtable','google_sheets'].includes(c.provider))throw new AppError(400,'Choose a logging connection for mirroring.');}if(id){const old=await row(db,table,w,id);if(old.fb_page_id!==data.fb_page_id||old.facebook_connection_id!==data.facebook_connection_id)data.fb_verified=false;}}
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
   if(table==='websites'){if(['nobleseek_db','fabrything_db'].includes(data.connector))requireOwner(actor);publicURL(data.url);if(data.config.catalogURL)publicURL(data.config.catalogURL);if(data.connection_id){const c=await row(db,'connections',w,data.connection_id);if(c.provider!==data.connector||!['nobleseek_db','fabrything_db'].includes(c.provider)&&(!c.config.url||new URL(c.config.url).origin!==new URL(data.url).origin))throw new AppError(400,'Choose matching service credentials scoped to this website origin.');}}
   if(table==='feeds'){const page=await row(db,'pages',w,data.page_id);if(page.kind!=='news')throw new AppError(400,'Only news Pages can have RSS feeds.');publicURL(data.url);if(data.fallback_url)publicURL(data.fallback_url);}
   if(table==='posts'){
    const page=await row(db,'pages',w,data.page_id);if(data.type==='news'&&page.kind!=='news')throw new AppError(400,'Use a news Page for news articles.');if(data.type==='product_sale'&&page.kind!=='ecommerce')throw new AppError(400,'Use an ecommerce Page for product campaigns.');
    if(data.creative.sourceImage)publicURL(data.creative.sourceImage);
    if(data.product_id){const p=await row(db,'products',w,data.product_id);if(data.type!=='product_sale'||p.website_id!==page.website_id)throw new AppError(400,'Choose a product from this Page’s connected store.');if(!p.available)throw new AppError(409,'This product is out of stock.');}
    if(data.source_url){data.source_url=canonicalArticleURL(data.source_url);if(['news','blog'].includes(data.type)){const prior=id?await row(db,table,w,id):null;data.source_hash=prior?.source_url===data.source_url?prior.source_hash:createHash('sha256').update(data.source_url).digest('hex');}}
    if(['news','product_sale'].includes(data.type)){const product=data.product_id?await row(db,'products',w,data.product_id):null;data.seo={...(id?(await row(db,'posts',w,id)).seo:{}),...(data.type==='news'?{category:data.category||(id?(await row(db,'posts',w,id)).seo.category:null)||categoryFor(data)}:{}),editorialWarnings:editorialWarnings(data.caption,product?{title:product.title,description:product.description,price:product.price,currency:product.currency}:{title:data.title,text:data.body},page.niche),title:data.title.slice(0,60),description:data.caption.slice(0,160)};}
    data.seo={...(id?(await row(db,'posts',w,id)).seo:{}),...data.seo};
    if(Object.hasOwn(data,'instagram_caption'))data.seo.channelCaptions={...data.seo.channelCaptions,instagram:data.instagram_caption};
    const warningProduct=data.product_id?await row(db,'products',w,data.product_id):null,warningFacts=warningProduct?{title:warningProduct.title,description:warningProduct.description,attributes:warningProduct.attributes,price:warningProduct.price,currency:warningProduct.currency}:{title:data.title,text:data.body};data.seo.editorialWarnings=[...editorialWarnings(data.caption,warningFacts,page.niche),...(data.seo.channelCaptions?.instagram?editorialWarnings(data.seo.channelCaptions.instagram,warningFacts,page.niche).map(w=>'Instagram: '+w):[])];
    if(Object.hasOwn(data,'design_brief'))data.seo.designBrief=data.design_brief;if(Object.hasOwn(data,'first_comment_text'))data.seo.commentText=data.first_comment_text.replace(/https?:\/\/[^\s]+/g,'').trim();delete data.design_brief;delete data.first_comment_text;
    if(Object.hasOwn(data,'reel_image_urls'))data.seo.reelMedia={...data.seo.reelMedia,imageURLs:data.reel_image_urls};if(data.reel_audio_url)data.seo.reelMedia={...data.seo.reelMedia,audioURL:data.reel_audio_url};delete data.reel_image_urls;delete data.reel_audio_url;
    if(Object.hasOwn(data,'article_text')){const text=data.article_text.trim();data.seo.article={...(data.seo.article||{}),text,wordCount:text.split(/\s+/).filter(Boolean).length,editedAt:new Date().toISOString()};data.seo.editorialWarnings.push(...editorialWarnings(text,warningFacts,page.niche).map(w=>'Website article: '+w));}delete data.article_text;
    delete data.instagram_caption;delete data.category;
    if(id){const old=await row(db,table,w,id);if(['published','publishing','unknown'].includes(old.status))throw new AppError(409,'Published or unresolved posts cannot be overwritten.');
     const changed=(data.type==='reel'&&(data.body!==old.body||JSON.stringify(data.seo.reelMedia)!==JSON.stringify(old.seo.reelMedia)))||['ratio','style','headline','highlight','highlightColor','cta','sourceImage'].some(key=>Object.hasOwn(data.creative,key)&&data.creative[key]!==old.creative[key])||data.title!==old.title||data.product_id!==old.product_id;data.creative={...old.creative,...data.creative};if(changed)delete data.creative.assetId;
     await workspaceLock(db,w);await releasePublication(db,w,id);await db.query("UPDATE creator.tasks SET status='canceled',phase='Post edited',finished_at=now() WHERE workspace_id=$1 AND post_id=$2 AND kind IN ('publish','manual_handoff') AND status='queued'",[w,id]);data.version=old.version+1;data.status='draft';data.approved_version=null;data.scheduled_at=null;data.planned_at=null;}
   }
   const result=await save(db,table,w,data,id);if(!result)throw new AppError(404,'Item not found.');
   if(table==='pages'){await db.query('UPDATE creator.page_mirrors SET enabled=false WHERE workspace_id=$1 AND page_id=$2',[w,result.id]);for(const cid of mirrorIds)await db.query('INSERT INTO creator.page_mirrors(workspace_id,page_id,connection_id,enabled) VALUES($1,$2,$3,true) ON CONFLICT(page_id,connection_id) DO UPDATE SET enabled=true',[w,result.id,cid]);for(const cid of [...new Set([result.notification_connection_id,result.creative_policy.reels?.stockConnectionId,result.creative_policy.reels?.ttsConnectionId,result.facebook_connection_id,result.text_connection_id,result.image_connection_id,...mirrorIds].filter(Boolean))])await db.query('INSERT INTO creator.page_connections(workspace_id,page_id,connection_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[w,result.id,cid]);}
   if(connectionPage)await db.query('INSERT INTO creator.page_connections(workspace_id,page_id,connection_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[w,connectionPage.id,result.id]);
   if(websitePage){await db.query('UPDATE creator.pages SET website_id=$3 WHERE workspace_id=$1 AND id=$2',[w,websitePage.id,result.id]);if(result.connection_id)await db.query('INSERT INTO creator.page_connections(workspace_id,page_id,connection_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[w,websitePage.id,result.connection_id]);}
   await audit(db,w,actor,table+'.saved',table,result.id);if(table==='connections')return {id:result.id,ok:true};return result;
  });
 }
 match=path.match(/^\/api\/products\/([a-f0-9-]{36})\/prepare$/);
 if(match&&method==='POST')return transaction(w,async db=>{
  if(!uuid(body.page_id))throw new AppError(400,'Select the ecommerce Page for this product.');
  await workspaceLock(db,w);const product=await row(db,'products',w,match[1]),page=await row(db,'pages',w,body.page_id);
  if(page.kind!=='ecommerce'||page.website_id!==product.website_id)throw new AppError(400,'Choose a product from this ecommerce Page’s connected catalog.');
  if(!product.available)throw new AppError(409,'This product is out of stock. Refresh the catalog or choose an available item.');

  if(!page.text_connection_id)throw new AppError(400,'Connect a caption model for this Page first.');
  const existing=(await db.query("SELECT id,status FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND product_id=$3 AND deleted_at IS NULL AND archived_at IS NULL AND status IN ('draft','review','approved','scheduled') ORDER BY created_at DESC LIMIT 1",[w,page.id,product.id])).rows[0];
  if(existing)return {ok:true,postId:existing.id,message:'This product already has a '+existing.status+' post. Open Content to manage it.'};
  await requireGenerationCapacity(db,w);const ratio=['1:1','4:5','9:16','16:9'].includes(body.ratio)?body.ratio:analyzeProduct(product).recommendedRatio;
  const post=await save(db,'posts',w,{page_id:page.id,type:'product_sale',title:product.title,body:product.description,product_id:product.id,creative:{ratio,style:'editorial'}});
  const task=await enqueue(db,w,'generate',{pageId:page.id,postId:post.id,input:{urgent:body.urgent===true}});
  await audit(db,w,actor,'product.preparation_requested','post',post.id,{productId:product.id,urgent:body.urgent===true});
  return {...task,postId:post.id,message:body.urgent===true?'Priority preparation queued. Caption and design will use the next available posting slot; publishing gaps still apply.':'Product preparation queued. Follow the real stages in Creative studio.'};
 });
 match=path.match(/^\/api\/(pages|connections|websites|posts)\/([a-f0-9-]{36})\/([a-z-]+)$/);
 if(match&&method==='POST'){
  const [,table,id,action]=match;
  return transaction(w,async db=>{
   await workspaceLock(db,w);const item=await row(db,table,w,id);
   if(table==='posts'&&action==='render-reel'){if(item.type!=='reel')throw new AppError(400,'Choose a Reel draft.');const page=await row(db,'pages',w,item.page_id),problem=workflowMediaProblem(page,item,'render_reel');if(problem)throw new AppError(409,problem);await requireGenerationCapacity(db,w);return enqueue(db,w,'render_reel',{pageId:item.page_id,postId:item.id});}
   if(table==='posts'&&action==='request-approval'){const page=await row(db,'pages',w,item.page_id);if(!page.notification_connection_id)throw new AppError(400,'Choose an approval notification connection on this Page first.');await queueApprovalNotification(db,w,page,item,{force:true});return {ok:true,message:'Current draft notification queued.'};}
   if(table==='posts'&&action==='release-safety'){if(item.version!==body.version)throw new AppError(409,'Review the latest version first.');await db.query("UPDATE creator.posts SET seo=jsonb_set(seo,'{safety,permitGeneration}','true'),last_error=NULL WHERE workspace_id=$1 AND id=$2",[w,item.id]);await audit(db,w,actor,'post.safety_preparation_allowed','post',item.id);return enqueue(db,w,'generate',{pageId:item.page_id,postId:item.id});}
   if(table==='pages'&&action==='analyze-references'){
    if(!item.text_connection_id)throw new AppError(400,'Choose this Page’s caption model first.');await requireGenerationCapacity(db,w);
    if((await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND page_id=$2 AND kind='analyze_references' AND status IN ('queued','running')",[w,id])).rowCount)throw new AppError(409,'Reference analysis is already queued or running.');
    return enqueue(db,w,'analyze_references',{pageId:id});
   }
   if(table==='pages'&&action==='reset-learning'){
    const policy={...item.creative_policy};delete policy.editorialMemory;delete policy.editorialQuality;await db.query('UPDATE creator.pages SET creative_policy=$3 WHERE workspace_id=$1 AND id=$2',[w,id,policy]);await audit(db,w,actor,'page.editorial_memory_reset','page',id);return {ok:true,message:'Editorial examples cleared for this Page. Manual style notes and references remain.'};
   }
   if(table==='pages'&&action==='redesign'){
    const posts=(await db.query("SELECT * FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status IN ('review','approved','scheduled') AND caption<>'' AND archived_at IS NULL AND deleted_at IS NULL AND creative->>'designVersion' IS DISTINCT FROM CASE WHEN type IN ('news','blog') THEN 'studio-v6' WHEN type='product_sale' THEN $3 ELSE 'studio-v5' END ORDER BY COALESCE(scheduled_at,planned_at,created_at) LIMIT 10",[w,id,PRODUCT_DESIGN_VERSION])).rows;
    let queued=0;for(const post of posts){const tasks=(await db.query("SELECT id,kind,status FROM creator.tasks WHERE workspace_id=$1 AND post_id=$2 AND status IN ('queued','running') FOR UPDATE",[w,post.id])).rows;if(tasks.some(t=>t.status==='running'||!['publish','manual_handoff'].includes(t.kind)))continue;await requireGenerationCapacity(db,w);await db.query("UPDATE creator.tasks SET status='canceled',phase='Preparing the updated design',finished_at=now() WHERE workspace_id=$1 AND post_id=$2 AND status='queued'",[w,post.id]);await releasePublication(db,w,post.id);await db.query("UPDATE creator.posts SET status='draft',scheduled_at=NULL,approved_version=NULL WHERE workspace_id=$1 AND id=$2",[w,post.id]);await enqueue(db,w,'creative',{postId:post.id,pageId:id});queued++;}
    return {ok:true,message:queued+' existing posts queued for the updated design. Running and completed deliveries were left alone.'};
   }
   if(table==='pages'&&action==='run'){
    const changed=await db.query('UPDATE creator.automation_rules SET next_run_at=now() WHERE workspace_id=$1 AND page_id=$2 AND enabled RETURNING id',[w,id]);if(!changed.rowCount)throw new AppError(409,'Configure and start this Page’s workflow first.');return {ok:true,message:'Generation check requested. The worker will check this Page within one minute; follow its stages in Creative studio.'};
   }
   if(table==='pages'&&action==='instagram'){
    if(item.destination_type==='facebook_profile'||!item.fb_verified||!item.facebook_connection_id)throw new AppError(409,'Verify this Facebook Page first. Instagram uses its linked professional account.');
    if(body.enabled===false){await db.query("UPDATE creator.social_destinations SET enabled=false WHERE workspace_id=$1 AND page_id=$2 AND platform='instagram'",[w,id]);return {ok:true,message:'Automatic Instagram sharing paused for this Page.'};}
    const c=await row(db,'connections',w,item.facebook_connection_id),account=await discoverInstagram(item,c,decryptSecret(c.secret_cipher,w));
    const existing=(await db.query("SELECT * FROM creator.social_destinations WHERE workspace_id=$1 AND page_id=$2 AND platform='instagram'",[w,id])).rows[0];
    if(existing?.remote_id!==account.id&&(await db.query("SELECT id FROM creator.social_deliveries WHERE workspace_id=$1 AND page_id=$2 AND status IN ('preparing','publishing','unknown') LIMIT 1",[w,id])).rowCount)throw new AppError(409,'Resolve the existing Instagram delivery before replacing its account.');
    await db.query("INSERT INTO creator.social_destinations(workspace_id,page_id,platform,remote_id,username,enabled) VALUES($1,$2,'instagram',$3,$4,$5) ON CONFLICT(workspace_id,page_id,platform) DO UPDATE SET remote_id=EXCLUDED.remote_id,username=EXCLUDED.username,enabled=EXCLUDED.enabled,verified_at=now()",[w,id,account.id,account.username,body.enabled===true||existing?.enabled===true]);
    await audit(db,w,actor,'page.instagram_connected','page',id,{username:account.username,enabled:body.enabled===true||existing?.enabled===true});return {ok:true,username:account.username,message:'Connected Instagram @'+account.username+'. '+(body.enabled===true?'Future finished image posts will be shared after Facebook delivery.':'Enable automatic sharing when ready.')};
   }
   if(table==='pages'&&action==='insights'){
    if(body.records){const records=insightRecords(body.records);await db.query("INSERT INTO creator.insight_snapshots(workspace_id,page_id,source,records) VALUES($1,$2,'import',$3)",[w,id,JSON.stringify(records)]);await audit(db,w,actor,'page.insights_imported','page',id,{records:records.length});return {ok:true,message:'Imported metrics saved. Recommendations use only this Page/profile’s data.'};}
    if(item.destination_type==='facebook_profile')throw new AppError(400,'Import your own profile metrics; Page API sync is not available for this destination.');if((await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND page_id=$2 AND kind='sync_insights' AND status IN ('queued','running')",[w,id])).rowCount)throw new AppError(409,'A report refresh is already running for this Page.');return enqueue(db,w,'sync_insights',{pageId:id,input:{days:[7,28].includes(body.days)?body.days:7}});
   }
   if(table==='pages'&&action==='facebook'){
    assertPageConnector(item,'facebook');
    if((await db.query("SELECT id FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status='publishing' LIMIT 1",[w,id])).rowCount)throw new AppError(409,'Wait for the current publication to finish before changing its connection.');
    const existing=body.connection_id?await row(db,'connections',w,body.connection_id):item.facebook_connection_id?await row(db,'connections',w,item.facebook_connection_id):null;
    if(existing&&existing.provider!=='facebook')throw new AppError(400,'Select a Facebook connection.');
    if(body.token!==undefined&&(typeof body.token!=='string'||body.token.length>8000))throw new AppError(400,'Enter a valid access token.');
    const pageId=body.page_id||item.fb_page_id,version=body.version||existing?.config.version;
    if(body.app_alias!==undefined){requireOwner(actor);if(typeof body.app_alias!=='string'||!/^[A-Z][A-Z0-9_]{1,30}$/.test(body.app_alias))throw new AppError(400,'Choose a configured Meta app profile.');}
    let app={},appAlias=body.app_alias||existing?.config.appAlias||null,privateAppSecret;
    if(body.long_lived===true){
     if(actor.role==='super_admin'&&appAlias&&appAlias!=='CUSTOM'){requireOwner(actor);app=await metaAppCredentials(appAlias);}
     else{appAlias=null;const appId=body.app_id||existing?.config.appId,appSecret=body.app_secret||decryptSecret(existing?.secret_cipher,w).appSecret;if(typeof appId!=='string'||!/^\d+$/.test(appId)||typeof appSecret!=='string'||!appSecret||appSecret.length>1000)throw new AppError(400,'Enter this Meta app’s numeric ID and app secret for the long-lived exchange, or choose an owner-configured app profile.');app={appId,appSecret};privateAppSecret=appSecret;}
    }
    const resolved=await resolveFacebookPage({token:body.token?.trim()||decryptSecret(existing?.secret_cipher,w).token,pageId,version,tokenType:body.token_type||'auto',...app});
    const shared=existing&&(await db.query('SELECT id FROM creator.pages WHERE workspace_id=$1 AND facebook_connection_id=$2 AND id<>$3 LIMIT 1',[w,existing.id,id])).rowCount;
    const c=await save(db,'connections',w,{name:item.name+' · Facebook',provider:'facebook',config:{version,...(appAlias?{appAlias}:{}),...(app.appId?{appId:app.appId}:{})},secret_cipher:encryptSecret({token:resolved.token,...(privateAppSecret?{appSecret:privateAppSecret}:{})},w),status:'connected',last_test_at:new Date(),last_test_result:resolved.result},shared?null:existing?.id);
    await db.query('UPDATE creator.pages SET facebook_connection_id=$3,fb_page_id=$4,fb_verified=true,updated_at=now() WHERE workspace_id=$1 AND id=$2',[w,id,c.id,pageId]);
    await db.query("DELETE FROM creator.page_connections pc USING creator.connections c WHERE pc.workspace_id=$1 AND pc.page_id=$2 AND pc.connection_id=c.id AND c.provider='facebook' AND pc.connection_id<>$3",[w,id,c.id]);
    await db.query('INSERT INTO creator.page_connections(workspace_id,page_id,connection_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[w,id,c.id]);
    await db.query("UPDATE creator.posts SET last_error=NULL,seo=seo-'deliveryBlock' WHERE workspace_id=$1 AND page_id=$2 AND seo->>'deliveryBlock'='facebook_auth' AND status IN ('approved','review')",[w,id]);
    await db.query('UPDATE creator.automation_rules SET next_run_at=now() WHERE workspace_id=$1 AND page_id=$2',[w,id]);
    await audit(db,w,actor,'page.facebook_connected','page',id,{connectionId:c.id,tokenSource:resolved.result.tokenSource});return {...resolved.result,connectionId:c.id};
   }
   if(table==='connections'&&action==='test')return enqueue(db,w,'test_connection',{input:{connectionId:id}});
   if(table==='pages'&&action==='connect'){const c=await row(db,'connections',w,body.connection_id);assertPageConnector(item,c.provider);await db.query('INSERT INTO creator.page_connections(workspace_id,page_id,connection_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[w,id,c.id]);return {ok:true};}
   if(table==='pages'&&action==='verify'){assertPageConnector(item,'facebook');return enqueue(db,w,'verify_page',{pageId:id});}
   if(table==='pages'&&action==='plan'){
    const rule=(await db.query('SELECT * FROM creator.automation_rules WHERE workspace_id=$1 AND page_id=$2',[w,id])).rows[0],posts=(await db.query("SELECT * FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status IN ('draft','review','approved') AND caption<>'' AND archived_at IS NULL AND deleted_at IS NULL AND planned_at IS NULL ORDER BY created_at LIMIT $3",[w,id,Math.min(rule?.daily_target||item.daily_cap,50)])).rows;
    let planned=0;const issues=[];for(const post of posts){await db.query('SAVEPOINT plan_post');try{await queuePublication(db,w,actor,item,post,{autoPick:true,planOnly:(item.require_review&&post.approved_version!==post.version)||!env().publishing||(!item.fb_verified&&item.destination_type!=='facebook_profile')||!item.active,spread:true,target:rule?.daily_target||item.daily_cap});planned++;}catch(e){await db.query('ROLLBACK TO SAVEPOINT plan_post');issues.push(e instanceof AppError?e.message:'Unable to plan this post.');}finally{await db.query('RELEASE SAVEPOINT plan_post');}}
    return {ok:true,planned,message:planned?planned+' posts placed in the calendar. Unapproved content waits for review.':issues[0]||'No ready, unscheduled caption was found.'};
   }
   if(table==='websites'&&action==='import')return enqueue(db,w,'import_products',{input:{websiteId:id}});
   if(table==='pages'&&action==='aggregate'){await entitlements(db,w);if(item.kind!=='news'||!item.aggregation_enabled)throw new AppError(400,'Aggregation is only enabled for configured news Pages.');return enqueue(db,w,'aggregate',{pageId:id});}
   if(table==='posts'){
    const post=item,page=await row(db,'pages',w,post.page_id);
    if(action==='feedback'){
     if(post.deleted_at||post.archived_at)throw new AppError(409,'Restore this caption before saving editorial feedback.');
     const policy=addEditorialFeedback(page.creative_policy,post,body,actor.id);await db.query('UPDATE creator.pages SET creative_policy=$3 WHERE workspace_id=$1 AND id=$2',[w,page.id,policy]);await audit(db,w,actor,'post.editorial_feedback','post',id,{outcome:body.outcome,version:post.version});return {ok:true,message:body.outcome==='prefer'?'Style example saved for future captions on this Page.':'Style to avoid saved for this Page.',revision:policy.editorialMemory.revision};
    }

    if(action==='confirm-manual'){
     if(page.destination_type!=='facebook_profile'||post.status!=='ready_manual'||body.confirmed!==true)throw new AppError(409,'Confirm a ready personal-profile handoff only after you publish it yourself.');
     const link=publicURL(body.url);if(!['facebook.com','www.facebook.com','m.facebook.com'].includes(link.hostname)||link.pathname==='/')throw new AppError(400,'Enter the HTTPS Facebook URL of the post you published.');
     await db.query("UPDATE creator.posts SET status='published',manual_url=$3,published_at=now(),updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,id,link.href]);await db.query("UPDATE creator.usage_reservations SET status='consumed',updated_at=now() WHERE workspace_id=$1 AND post_id=$2",[w,id]);await audit(db,w,actor,'post.manual_publication_confirmed','post',id,{url:link.href});return {ok:true,message:'Recorded as manually published by you. EchoLink did not submit or verify this profile post through Meta.'};
    }
    if(['delete','archive','restore'].includes(action)){
     if(['published','publishing','unknown'].includes(post.status))throw new AppError(409,'Published or unresolved posts stay in history. Reconcile an unknown delivery first.');
     if((await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND post_id=$2 AND status='running' LIMIT 1",[w,id])).rowCount)throw new AppError(409,'Wait for the running task to finish.');
     await releasePublication(db,w,id);await db.query("UPDATE creator.tasks SET status='canceled',phase='Post removed from queue',finished_at=now() WHERE workspace_id=$1 AND post_id=$2 AND status='queued'",[w,id]);
     await db.query(`UPDATE creator.posts SET deleted_at=${action==='delete'?'now()':'NULL'},archived_at=${action==='archive'?'now()':'NULL'},planned_at=NULL,scheduled_at=NULL,status='draft',approved_version=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2`,[w,id]);await audit(db,w,actor,'post.'+action,'post',id);return {ok:true,message:action==='delete'?'Moved to Trash. Its duplicate fingerprint is retained.':action==='archive'?'Archived and removed from the queue.':'Restored as a draft.'};
    }
    if(post.deleted_at||post.archived_at)throw new AppError(409,'Restore this post before editing or publishing it.');
    if(action==='slot'){const plan=await entitlements(db,w);const at=await nextSlot(db,w,page,{postId:id,until:new Date(plan.period_end)});return {at,timezone:page.timezone};}
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
    if(['generate','creative'].includes(action)){if(action==='creative'){const problem=workflowMediaProblem(page,post,'creative');if(problem)throw new AppError(409,problem);}await requireGenerationCapacity(db,w);return enqueue(db,w,action,{postId:id,pageId:page.id,input:{aiBackground:body.aiBackground===true}});}
    if(action==='instagram'){
     if(!(await db.query("SELECT id FROM creator.social_destinations WHERE workspace_id=$1 AND page_id=$2 AND enabled AND platform='instagram'",[w,page.id])).rowCount)throw new AppError(409,'Enable this Page’s Instagram destination first.');
     if(post.status!=='published'||!post.creative.assetId)throw new AppError(409,'Instagram sharing requires the completed image and a recorded Facebook publication.');
     const delivery=(await db.query("SELECT * FROM creator.social_deliveries WHERE workspace_id=$1 AND post_id=$2 AND platform='instagram' FOR UPDATE",[w,id])).rows[0];
     if(delivery?.status==='published')return {ok:true,message:'Already published on Instagram.'};
     if(delivery&&['publishing','unknown','preparing'].includes(delivery.status))throw new AppError(409,'Check Instagram before retrying this in-progress or uncertain delivery.');
     if((await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND post_id=$2 AND kind='publish_instagram' AND status IN ('queued','running')",[w,id])).rowCount)return {ok:true,message:'Instagram delivery is already queued.'};
     if(delivery){await db.query("UPDATE creator.social_deliveries SET status='queued',container_id=NULL,last_error=NULL WHERE workspace_id=$1 AND id=$2",[w,delivery.id]);await db.query("INSERT INTO creator.tasks(workspace_id,page_id,post_id,kind) VALUES($1,$2,$3,'publish_instagram')",[w,page.id,id]);}else await queueInstagramDelivery(db,w,page,post);
     return {ok:true,message:'Instagram delivery queued independently. Facebook will not be resubmitted.'};
    }
    if(['publishing','published','unknown'].includes(post.status))throw new AppError(409,'Reconcile this publication before changing its state.');
    if(action==='approve'){const approved=await approve(db,w,actor,post,{version:body.version,confirmWarnings:body.confirmWarnings===true});const rule=(await db.query('SELECT * FROM creator.automation_rules WHERE workspace_id=$1 AND page_id=$2 AND enabled AND auto_schedule',[w,page.id])).rows[0];if(post.planned_at&&env().publishing&&page.active&&(page.fb_verified||page.destination_type==='facebook_profile'))return queuePublication(db,w,actor,page,approved,{at:new Date(post.planned_at),autoPick:new Date(post.planned_at)<=new Date(),spread:true,target:rule?.daily_target||page.daily_cap});return {ok:true,message:'Current caption and image approved.'};}
    if(action==='draft'){await releasePublication(db,w,id);await db.query("UPDATE creator.tasks SET status='canceled',phase='Returned to draft',finished_at=now() WHERE workspace_id=$1 AND post_id=$2 AND kind IN ('publish','manual_handoff') AND status='queued'",[w,id]);await db.query("UPDATE creator.posts SET status='draft',approved_version=NULL,scheduled_at=NULL,planned_at=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,id]);return {ok:true};}
    if(action==='dry-run')return {ok:true,mode:'dry-run',page:page.name,type:post.type,captionReady:!!post.caption,photoReady:!!post.creative.assetId,approvalReady:post.approved_version===post.version,websitePublishing:page.website_publishing,automaticLinkComments:page.creative_policy?.linkComments?.enabled===true,checks:['No remote post was submitted.','No publishing allowance was consumed.','Generated captions require factual review.']};
    if(['publish','schedule'].includes(action)){
     if(!env().publishing&&body.planOnly!==true)throw new AppError(409,'Live publication is disabled by the operator.');
     const at=body.local_time?wallTimeToInstant(body.local_time,page.timezone):body.scheduled_at?new Date(body.scheduled_at):action==='publish'?new Date():undefined;
     if(action==='schedule'&&at&&+at<=Date.now())throw new AppError(400,'Choose a future time or use the next available slot.');
     return queuePublication(db,w,actor,page,post,{at,autoPick:action==='schedule'&&body.autoPick===true,approveCurrent:body.approve===true,version:body.version,confirmWarnings:body.confirmWarnings===true,planOnly:body.planOnly===true,fallbackToSlot:action==='publish'});
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
   if(page.kind==='news'&&data.buffer_hours>24)throw new AppError(400,'News needs fresh reporting. Keep its buffer within 24 hours; use longer horizons for products and evergreen Pages.');
   const fields=['name','enabled','interval_minutes','topic','make_creative','auto_publish','auto_schedule','daily_target','backlog_limit','batch_size','generation_mode','buffer_hours','refill_minutes','generation_window'];const values=fields.map(f=>data[f]);
   const result=(await db.query('INSERT INTO creator.automation_rules(workspace_id,page_id,'+fields.join(',')+') VALUES($1,$2,'+fields.map((_,i)=>'$'+(i+3)).join(',')+') ON CONFLICT(page_id) DO UPDATE SET '+fields.map(f=>f+'=EXCLUDED.'+f).join(',')+',refill_until=NULL,next_run_at=now() WHERE creator.automation_rules.workspace_id=$1 RETURNING *',[w,data.page_id,...values])).rows[0];await audit(db,w,actor,'automation.configured','automation_rule',result.id);return result;
  });
 }
 if(path==='/api/ad-drafts'&&method==='POST'){
  const data=validate('ad',body);return transaction(w,async db=>{await row(db,'campaigns',w,data.campaign_id);const result=await save(db,'ad_drafts',w,data);await audit(db,w,actor,'ad.drafted','ad_draft',result.id);return result;});
 }
 if(path.startsWith('/api/owner/')){requireOwner(actor);return ownerAPI(actor,request,path,body);}
 throw new AppError(404,'This operation was not found.');
}
async function ownerAPI(actor,request,path,body){
 if(path==='/api/owner/operations'&&request.method==='GET')return operationsSnapshot();
 if(path==='/api/owner/inference'&&request.method==='GET')return inferenceHost();
 if(path==='/api/owner/inference/report'&&request.method==='GET'){let report;try{report=JSON.parse(await readFile(new URL('../../.local/verification/model-comparison.json',import.meta.url),'utf8'));}catch{return {results:[]};}return {at:report.at,results:report.results.map(r=>({model:r.model,task:r.task,passed:r.passed,seconds:r.seconds,warnings:r.warnings,tokensPerSecond:r.metrics?.[0]?.tokensPerSecond,requiredMB:r.admission?.requiredMB}))};}
 if(path==='/api/owner/inference/test'&&request.method==='POST')return inspectInferenceHost(body);
 if(path==='/api/owner/inference'&&request.method==='PUT'){
  const running=await transaction(null,async db=>(await db.query("SELECT count(*)::int AS n FROM creator.tasks WHERE status='running' AND kind IN ('generate','write_article','aggregate','design_page_brand','analyze_references')")).rows[0].n,{owner:true});
  if(running||localInferenceGate.status().active)throw new AppError(409,'Wait for active content preparation to finish before switching inference hosts.');
  return saveInferenceHost(body);
 }
 return transaction(null,async db=>{
  if(path==='/api/owner/databases'&&request.method==='GET')return {profiles:(await db.query('SELECT * FROM creator.database_profiles ORDER BY created_at')).rows.map(safeDatabaseProfile),assignments:(await db.query('SELECT * FROM creator.workspace_database_targets')).rows,traffic:databaseTelemetry(),policy:{activePrimary:'operator-configured DATABASE_URL',automaticFailover:false,dedicatedRouting:false,note:'Client assignments stage dedicated recovery destinations. Live tenant routing requires an isolated import and a verified cutover; no connection is promoted automatically.'}};
  const profileMatch=path.match(/^\/api\/owner\/databases(?:\/([a-f0-9-]{36}))?(?:\/(test))?$/);
  if(profileMatch&&['POST','PUT'].includes(request.method)){
   const id=profileMatch[1],existing=id?(await db.query('SELECT * FROM creator.database_profiles WHERE id=$1 FOR UPDATE',[id])).rows[0]:null;if(id&&!existing)throw new AppError(404,'Database profile not found.');
   if(profileMatch[2]==='test'){const result=await probeDatabase(existing);await db.query('UPDATE creator.database_profiles SET status=$2,last_test_at=now(),last_test_result=$3,updated_at=now() WHERE id=$1',[id,result.ok?'verified':'unavailable',result]);return {...result,message:result.message};}
   const parsed=databaseProfileSchema.safeParse(body);if(!parsed.success)throw new AppError(400,'Choose a database name, provider, role and valid connection settings.');const data=parsed.data,prior=existing?openDatabaseSecret(existing):{};
   const secret=parseDatabaseSecret(data.connectionURL||prior.connectionURL,data.caCertificate||prior.caCertificate||'');
   const values=[data.name,data.provider,data.purpose,sealDatabaseSecret(secret),data.transport,data.max_connections,data.expires_at||null];
   const result=id?(await db.query("UPDATE creator.database_profiles SET name=$2,provider=$3,purpose=$4,secret_cipher=$5,transport=$6,max_connections=$7,expires_at=$8,status='configured',updated_at=now() WHERE id=$1 RETURNING *",[id,...values])).rows[0]:(await db.query('INSERT INTO creator.database_profiles(name,provider,purpose,secret_cipher,transport,max_connections,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',values)).rows[0];
   await audit(db,null,actor,'database.profile_saved','database_profile',result.id);return safeDatabaseProfile(result);
  }
  const targetMatch=path.match(/^\/api\/owner\/workspaces\/([a-f0-9-]{36})\/database$/);
  if(targetMatch&&request.method==='PUT'){
   if(!uuid(body.profile_id)||!['standby','dedicated_candidate'].includes(body.mode))throw new AppError(400,'Choose a database profile and recovery role.');
   if(!(await db.query('SELECT id FROM creator.workspaces WHERE id=$1',[targetMatch[1]])).rowCount)throw new AppError(404,'Workspace not found.');
   const profile=(await db.query('SELECT * FROM creator.database_profiles WHERE id=$1',[body.profile_id])).rows[0];if(!profile)throw new AppError(404,'Database profile not found.');if(profile.status!=='verified')throw new AppError(409,'Test this database successfully before assigning a client recovery destination.');
   await db.query("INSERT INTO creator.workspace_database_targets(workspace_id,profile_id,mode) VALUES($1,$2,$3) ON CONFLICT(workspace_id) DO UPDATE SET profile_id=EXCLUDED.profile_id,mode=EXCLUDED.mode,state='awaiting_snapshot',updated_at=now()",[targetMatch[1],profile.id,body.mode]);
   await audit(db,targetMatch[1],actor,'workspace.database_target_assigned','workspace',targetMatch[1],{profileId:profile.id,mode:body.mode});return {ok:true,message:'Recovery destination assigned. Existing client data and active routing were not moved. Import and reconcile a snapshot before cutover.'};
  }
  if(path==='/api/owner/state'&&request.method==='GET'){
   const result={};for(const table of ['accounts','workspaces','subscriptions','plans','payment_methods'])result[table]=(await db.query('SELECT * FROM creator.'+table)).rows;
   result.payments=(await db.query('SELECT * FROM creator.payments ORDER BY created_at DESC LIMIT 200')).rows;result.activity=(await db.query('SELECT * FROM creator.activity ORDER BY created_at DESC LIMIT 200')).rows;
   result.pages=(await db.query('SELECT id,workspace_id,name,kind,language,active,created_at FROM creator.pages ORDER BY created_at DESC LIMIT 300')).rows;
   result.inquiryCount=(await db.query("SELECT count(*)::int AS count FROM creator.contact_inquiries WHERE status='new'")).rows[0].count;return result;
  }
  if(path==='/api/owner/inquiries'&&request.method==='GET'){
   const offset=Number(new URL(request.url).searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>100000)throw new AppError(400,'Choose a valid inbox page.');
   return {inquiries:(await db.query('SELECT id,name,email,company,topic,message,status,notified_at,created_at FROM creator.contact_inquiries ORDER BY created_at DESC LIMIT 20 OFFSET $1',[offset])).rows};
  }
  if(/^\/api\/owner\/inquiries\/[a-f0-9-]{36}$/.test(path)&&request.method==='PUT'){
   if(!['new','closed'].includes(body.status))throw new AppError(400,'Choose New or Closed.');
   const id=path.split('/').at(-1);if(!uuid(id))throw new AppError(400,'Choose a valid inquiry.');
   const result=await db.query('UPDATE creator.contact_inquiries SET status=$2 WHERE id=$1 RETURNING id',[id,body.status]);if(!result.rowCount)throw new AppError(404,'Inquiry not found.');return {ok:true};
  }
  if(path==='/api/owner/integrations'&&request.method==='PUT'){
   if(typeof body.n8nEnabled!=='boolean'||typeof body.n8nVisibleToClients!=='boolean')throw new AppError(400,'Choose the shared service availability.');
   await db.query("INSERT INTO creator.platform_settings(key,value) VALUES('globalConnections',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",[JSON.stringify({n8nEnabled:body.n8nEnabled,n8nVisibleToClients:body.n8nVisibleToClients})]);await audit(db,null,actor,'integrations.updated','settings','globalConnections');return {ok:true};
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
