import '../server/env.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {transaction,closeDatabase,audit,workspaceLock} from '../server/db.mjs';
import {encryptSecret} from '../server/vault.mjs';
import {env} from '../server/env.mjs';
import {grantPlan} from '../server/billing.mjs';
if(process.env.PLATFORM_BRANCH!=='echolink-platform-local')throw new Error('Import only into the isolated local platform branch.');
if(!process.argv[2])throw new Error('Pass the absolute legacy .env.local path. Secrets are read privately and never printed.');
const sourceEnv=parseEnv(await readFile(process.argv[2],'utf8'));
if(!sourceEnv.DATABASE_URL||sourceEnv.DATABASE_URL===process.env.DATABASE_URL)throw new Error('A separate legacy source database is required.');
const sourceURL=new URL(sourceEnv.DATABASE_URL);sourceURL.searchParams.set('sslmode','verify-full');
const source=new pg.Client({connectionString:sourceURL.href,connectionTimeoutMillis:15000,statement_timeout:30000});
let snapshot;
try{await source.connect();await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');snapshot={configs:(await source.query('SELECT * FROM echolink.configurations ORDER BY kind,id')).rows,articles:(await source.query('SELECT * FROM echolink.articles ORDER BY created_at')).rows};await source.query('ROLLBACK');}finally{await source.end();}
if(sourceEnv.NOBLESEEK_DATABASE_URL){const target=new URL(sourceEnv.NOBLESEEK_DATABASE_URL);const file=new URL('../.env.local',import.meta.url);let content=await readFile(file,'utf8');content=content.replace(/^PLATFORM_NOBLESEEK_DB_HOST=.*\r?\n?/gm,'').trimEnd()+'\nPLATFORM_NOBLESEEK_DB_HOST='+target.hostname+'\n';await writeFile(file,content);}
const fbTokens=JSON.parse(sourceEnv.FB_TOKENS_JSON||'{}'),aiTokens=JSON.parse(sourceEnv.AI_TOKENS_JSON||'{}');
const counts=await transaction(null,async db=>{
 const account=(await db.query("SELECT * FROM creator.accounts WHERE lower(email)=lower($1) AND role='super_admin' AND email_verified=true",[env().ownerEmail])).rows[0];if(!account)throw new Error('The configured owner must complete verified sign-in before importing.');
 const workspace=(await db.query('SELECT * FROM creator.workspaces WHERE owner_id=$1 ORDER BY created_at LIMIT 1',[account.id])).rows[0];await workspaceLock(db,workspace.id);
 const w=workspace.id,result={pages:0,feeds:0,posts:0,connections:0,websites:0,alreadyPresent:0,liveSourceModified:false,importedPublishingEnabled:false};
 async function resource(kind,sourceId,create,detail={}){
  const existing=(await db.query("SELECT resource_id FROM creator.legacy_imports WHERE workspace_id=$1 AND source='legacy-live' AND kind=$2 AND source_id=$3",[w,kind,sourceId])).rows[0];if(existing){result.alreadyPresent++;return existing.resource_id;}
  const id=randomUUID();await create(id);await db.query("INSERT INTO creator.legacy_imports(workspace_id,source,kind,source_id,resource_id,detail) VALUES($1,'legacy-live',$2,$3,$4,$5)",[w,kind,sourceId,id,detail]);return id;
 }
 async function connection(provider,alias,config,secret){return resource('connection',provider+':'+alias,async id=>{await db.query("INSERT INTO creator.connections(id,workspace_id,provider,name,config,secret_cipher,status) VALUES($1,$2,$3,$4,$5,$6,'imported')",[id,w,provider,'Imported · '+alias,config,encryptSecret(secret,w)]);result.connections++;});}
 let websiteId,websiteConnection;
 if(sourceEnv.NOBLESEEK_DATABASE_URL){
  const siteURL=sourceEnv.NOBLESEEK_SITE_URL||'https://www.fabrything.com';websiteConnection=await connection('nobleseek_db','NobleSeek website',{url:siteURL,schema:sourceEnv.NOBLESEEK_DATABASE_SCHEMA||'public'},{databaseURL:sourceEnv.NOBLESEEK_DATABASE_URL});
  websiteId=await resource('website','nobleseek',async id=>{await db.query("INSERT INTO creator.websites(id,workspace_id,name,url,kind,connector,connection_id,config) VALUES($1,$2,'NobleSeek website',$3,'news','nobleseek_db',$4,$5)",[id,w,siteURL,websiteConnection,{categoryId:sourceEnv.NOBLESEEK_CATEGORY_ID||'',apiBaseURL:sourceEnv.NOBLESEEK_API_BASE_URL||'https://fabrythingapi.vercel.app/api/store/nobleseek'}]);result.websites++;});
 }
 if(sourceEnv.AIRTABLE_TOKEN&&sourceEnv.AIRTABLE_BASE_ID)await connection('airtable','Airtable control base',{baseId:sourceEnv.AIRTABLE_BASE_ID,pagesTable:sourceEnv.AIRTABLE_PAGES_TABLE||'[] Page Configurations',feedsTable:sourceEnv.AIRTABLE_FEEDS_TABLE||'[] Ingestion Feeds',logTable:sourceEnv.AIRTABLE_LOG_TABLE||'[] Content Log & Deduplication'},{token:sourceEnv.AIRTABLE_TOKEN});
 if(sourceEnv.GOOGLE_SERVICE_ACCOUNT_JSON)await connection('google_sheets','Google Sheets log',{spreadsheetId:sourceEnv.GOOGLE_SHEET_ID||'',tab:sourceEnv.GOOGLE_SHEET_TAB||'EchoLink Posts'},{serviceAccount:sourceEnv.GOOGLE_SERVICE_ACCOUNT_JSON});
 const pages=new Map();
 for(const record of snapshot.configs.filter(r=>r.kind==='page')){
  const p=record.config,provider=/lm\s?studio/i.test(p.infrastructure)?'lmstudio':/localai/i.test(p.infrastructure)?'localai':'ollama';
  const ai=await connection(provider,'Model for '+p.name,{model:p.model,temperature:p.temperature??0.4},aiTokens[p.aiSecret]?{apiKey:aiTokens[p.aiSecret]}:{});
  const fb=fbTokens[p.fbSecret]?await connection('facebook','Facebook for '+p.name,{version:sourceEnv.META_GRAPH_VERSION},{token:fbTokens[p.fbSecret]}):null;
  const linkedWebsite=websiteId&&(sourceEnv.NOBLESEEK_FACEBOOK_PAGE_IDS||'').split(',').map(x=>x.trim()).includes(p.fbPageId)?websiteId:null;
  const id=await resource('page',record.id,async id=>{
   await db.query(`INSERT INTO creator.pages(id,workspace_id,name,niche,kind,language,fb_page_id,facebook_connection_id,text_connection_id,website_id,website_publishing,aggregation_enabled,active,require_review,timezone,window_start,window_end,daily_cap,gap_minutes,brand)
    VALUES($1,$2,$3,'News','news',$4,$5,$6,$7,$8,$9,true,false,$10,$11,$12,$13,$14,$15,$16)`,[id,w,p.name,p.language,p.fbPageId||null,fb,ai,linkedWebsite,!!linkedWebsite&&sourceEnv.NOBLESEEK_ENABLED==='true',p.approval===true,p.timezone||'Asia/Dhaka',p.start,p.end,p.dailyMax,p.minimumGap,{name:p.name,color:'#ff826b'}]);result.pages++;
  },{originalConfiguration:p,legacyActive:p.active,automaticLinkComments:false,requiresCutover:true});pages.set(record.id,id);
 }
 for(const feed of snapshot.configs.filter(r=>r.kind==='feed'))for(const sourcePage of feed.config.pages||[]){
  const page=pages.get(sourcePage);if(!page)continue;await resource('feed',feed.id+':'+sourcePage,async id=>{const f=feed.config;await db.query('INSERT INTO creator.feeds(id,workspace_id,page_id,name,url,fallback_url,active) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,w,page,f.name||feed.id,f.url,f.fallback||null,f.active===true]);result.feeds++;});
 }
 // Batch insert history. Never carry a live job into the new worker: anything
 // not already published becomes an unscheduled draft/rejected/unknown record.
 const statuses={'Posted':'published','Skipped (Duplicate)':'rejected','Rejected':'rejected','Publish Unknown':'unknown','Publishing':'unknown','Failed':'failed'};
 for(let i=0;i<snapshot.articles.length;i+=150){
  const records=snapshot.articles.slice(i,i+150).filter(a=>pages.has(a.page_id)).map(a=>({id:a.id,workspace_id:w,page_id:pages.get(a.page_id),type:'news',title:a.title.slice(0,140),body:a.body||'',source_url:a.source_url,source_hash:a.url_hash,caption:a.caption||'',creative:{sourceImage:a.image_url,ratio:'1:1',style:'editorial',legacyScheduledAt:a.scheduled_at,legacyImagePrompt:a.image_prompt},seo:{analysis:a.analysis||'',legacyStatus:a.status},status:statuses[a.status]||'draft',published_at:a.published_at,fb_post_id:a.fb_post_id,website_url:a.website_url,last_error:a.last_error,created_at:a.created_at}));
  const inserted=await db.query(`INSERT INTO creator.posts(id,workspace_id,page_id,type,title,body,source_url,source_hash,caption,creative,seo,status,published_at,fb_post_id,website_url,last_error,created_at) SELECT id,workspace_id,page_id,type,title,body,source_url,source_hash,caption,creative,seo,status,published_at,fb_post_id,website_url,last_error,created_at FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,workspace_id uuid,page_id uuid,type text,title text,body text,source_url text,source_hash text,caption text,creative jsonb,seo jsonb,status text,published_at timestamptz,fb_post_id text,website_url text,last_error text,created_at timestamptz) ON CONFLICT DO NOTHING`,[JSON.stringify(records)]);result.posts+=inserted.rowCount;
 }
 const previous=(await db.query('SELECT provider FROM creator.subscriptions WHERE workspace_id=$1',[w])).rows[0];if(previous.provider!=='owner_migration')await grantPlan(db,w,'owner',{provider:'owner_migration'});
 await audit(db,w,account,'workspace.legacy_imported','workspace',w,result);return result;
},{owner:true});
console.log(JSON.stringify(counts,null,2));await closeDatabase();
