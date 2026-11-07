import pg from 'pg';
import {canonicalUrl} from './core.mjs';
import {jsonRequest} from './net.mjs';
import {query} from './db.mjs';

let currentPool,currentConnection;
export class WebsiteError extends Error{}
const fail=message=>new WebsiteError(message);
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cut=(value,length)=>Array.from(String(value||'')).slice(0,length).join('');
export function websiteConfiguration(env=process.env){
  return {enabled:env.NOBLESEEK_ENABLED==='true',databaseConfigured:!!env.NOBLESEEK_DATABASE_URL,requireBeforeFacebook:env.NOBLESEEK_REQUIRE_BEFORE_FACEBOOK==='true',
    siteURL:env.NOBLESEEK_SITE_URL||'https://www.fabrything.com',
    apiBaseURL:env.NOBLESEEK_API_BASE_URL||'https://fabrythingapi.vercel.app/api/store/nobleseek',
    schema:env.NOBLESEEK_DATABASE_SCHEMA||'public',categoryId:env.NOBLESEEK_CATEGORY_ID||'',
    pageIds:(env.NOBLESEEK_FACEBOOK_PAGE_IDS||'').split(',').map(v=>v.trim()).filter(Boolean)};
}
export function websiteApplies(page,env=process.env){const c=websiteConfiguration(env);return c.enabled&&c.pageIds.includes(page.fbPageId);}
export function validateWebsiteConfiguration(env=process.env){
  const c=websiteConfiguration(env);
  if(!c.databaseConfigured)throw fail('Save NOBLESEEK_DATABASE_URL in the local worker environment');
  let db;try{db=new URL(env.NOBLESEEK_DATABASE_URL);}catch{throw fail('Invalid NobleSeek PostgreSQL connection URI');}
  if(!['postgres:','postgresql:'].includes(db.protocol))throw fail('NobleSeek requires a PostgreSQL connection URI');
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.schema))throw fail('Invalid NobleSeek database schema');
  if(c.categoryId&&!/^[1-9]\d*$/.test(c.categoryId))throw fail('NobleSeek category ID must be numeric or blank');
  if(c.enabled&&(!c.pageIds.length||c.pageIds.some(id=>!/^\d+$/.test(id))))throw fail('List the numeric Facebook Page IDs allowed to publish to NobleSeek');
  for(const value of [c.siteURL,c.apiBaseURL]){
    let u;try{u=new URL(value);}catch{throw fail('Invalid NobleSeek public URL');}
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw fail('NobleSeek public URLs must use HTTPS without credentials or query strings');
  }
  if(new URL(c.siteURL).pathname!=='/')throw fail('NOBLESEEK_SITE_URL must be the website origin, without /nobleseek');
  return c;
}
export async function websitePool(env=process.env){
  validateWebsiteConfiguration(env);
  if(currentPool&&currentConnection!==env.NOBLESEEK_DATABASE_URL){await currentPool.end();currentPool=undefined;}
  if(!currentPool){currentConnection=env.NOBLESEEK_DATABASE_URL;currentPool=new pg.Pool({connectionString:currentConnection,max:2,connectionTimeoutMillis:15000,statement_timeout:30000,idleTimeoutMillis:30000});currentPool.on('error',()=>console.error('NobleSeek database connection failed'));}
  return currentPool;
}
export async function closeWebsitePool(){if(currentPool)await currentPool.end();currentPool=undefined;currentConnection=undefined;}
export function websitePayload(article,{status='PUBLISHED',categoryId='',now=new Date()}={}){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(article.id||''))throw fail('Website publication needs a valid EchoLink article ID');
  if(!['DRAFT','PUBLISHED'].includes(status))throw fail('Invalid website publication state');
  const source=canonicalUrl(article.source_url),image=article.image_url||'';
  if(source.length>500||image.length>500)throw fail('The website source/photo URL exceeds its 500-character field; select a shorter valid URL');
  if(image){const u=new URL(image);if(u.protocol!=='https:'||u.username||u.password)throw fail('Website images require an HTTPS URL');}
  const caption=String(article.caption||'').trim();if(!caption)throw fail('Review a generated caption before website publication');
  const tags=[...new Set((caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)||[]).map(tag=>tag.slice(1)))].slice(0,10);
  const prose=caption.replace(/#[\p{L}\p{M}\p{N}_]+/gu,'').trim();
  const publisher=new URL(source).hostname.replace(/^www\./,'');
  const html=prose.split(/\n\s*\n/).filter(Boolean).map(p=>`<p>${escape(p).replace(/\n/g,'<br>')}</p>`).join('\n')
    +`\n<p>সূত্র: <a href="${escape(source)}" rel="noopener noreferrer">${escape(publisher)} — মূল প্রতিবেদন</a></p>`;
  const title=cut(article.title||prose.split('\n')[0],255);
  const timestamp=new Date(now).toISOString();
  return {headline:title,headline_bn:/[\u0980-\u09ff]/u.test(title)?title:'',slug:`echolink-${article.id.toLowerCase()}`,
    excerpt:cut(prose.replace(/\s+/g,' '),300),body_html:html,hero_image:image,hero_image_alt:title,
    // Attribution is not a claim that the image is licensed. The editor still
    // needs permission to reuse the selected image before approving it.
    image_credit:image?cut(`Source image: ${publisher}`,255):'',source_name:publisher,source_url:source,
    tags,status,is_featured:false,is_breaking:false,related_product_ids:[],seo_title:title,
    seo_description:cut(prose.replace(/\s+/g,' '),300),seo_keywords:tags,fb_post_url:'',utm_campaign:'echolink-nobleseek',
    view_count:0,read_time_minutes:Math.max(1,Math.ceil(html.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length/200)),
    published_at:status==='PUBLISHED'?timestamp:null,created_at:timestamp,updated_at:timestamp,category_id:categoryId||null,trend_id:null};
}
export async function checkWebsiteSchema(client,env=process.env){
  const c=validateWebsiteConfiguration(env),table=`"${c.schema}"."nobleseek_article"`;
  const columns=(await client.query('SELECT column_name,data_type,is_nullable,column_default,is_identity FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',[c.schema,'nobleseek_article'])).rows;
  const required=Object.keys(websitePayload({id:'00000000-0000-4000-8000-000000000000',title:'Schema probe',source_url:'https://example.com/',caption:'Probe'},{status:'DRAFT'}));
  if(!columns.some(col=>col.column_name==='id')||required.some(name=>!columns.some(col=>col.column_name===name)))throw fail('NobleSeek article schema differs from the inspected Django model; apply the website migrations first');
  if(columns.some(col=>col.column_name!=='id'&&!required.includes(col.column_name)&&col.is_nullable==='NO'&&!col.column_default&&col.is_identity!=='YES'))throw fail('NobleSeek has an additional required article field; update the connector mapping');
  const unique=(await client.query("SELECT EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=$1::regclass AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND a.attname='slug') AS ok",[table])).rows[0];
  if(!unique.ok)throw fail('NobleSeek needs a unique slug constraint for safe retries');
  if(c.categoryId){const category=await client.query(`SELECT id FROM "${c.schema}"."nobleseek_newscategory" WHERE id=$1 AND is_active=true`,[c.categoryId]);if(!category.rowCount)throw fail('The configured NobleSeek category is missing or inactive');}
  return {table,columns:columns.length};
}
export async function writeWebsiteArticle(client,article,{status='PUBLISHED',env=process.env}={}){
  const c=validateWebsiteConfiguration(env),payload=websitePayload(article,{status,categoryId:c.categoryId}),fields=Object.keys(payload);
  const values=fields.map(key=>Array.isArray(payload[key])?JSON.stringify(payload[key]):payload[key]);
  const preserve=new Set(['slug','created_at','view_count','fb_post_url']);
  const updates=fields.filter(key=>!preserve.has(key)).map(key=>key==='published_at'?'published_at=COALESCE(existing.published_at,EXCLUDED.published_at)':key==='status'?"status=CASE WHEN existing.status='PUBLISHED' THEN existing.status ELSE EXCLUDED.status END":`"${key}"=EXCLUDED."${key}"`);
  const saved=await client.query(`INSERT INTO "${c.schema}"."nobleseek_article" AS existing (${fields.map(key=>`"${key}"`).join(',')}) VALUES(${fields.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT(slug) DO UPDATE SET ${updates.join(',')} WHERE existing.utm_campaign=EXCLUDED.utm_campaign AND existing.source_url=EXCLUDED.source_url RETURNING id,slug,status,published_at`,values);
  if(!saved.rowCount)throw fail('The website slug belongs to another article; no existing content was overwritten');
  const row=saved.rows[0];return {...row,id:String(row.id),url:new URL(`/nobleseek/${encodeURIComponent(row.slug)}`,c.siteURL).toString()};
}
export async function publishWebsite(page,article,{env=process.env,fetcher=jsonRequest}={}){
  if(!websiteApplies(page,env))return null;
  let saved;
  try{
    const c=validateWebsiteConfiguration(env),client=await(await websitePool(env)).connect();
    try{await checkWebsiteSchema(client,env);await client.query('BEGIN');saved=await writeWebsiteArticle(client,article,{env});await client.query('COMMIT');}
    catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
    const endpoint=`${c.apiBaseURL.replace(/\/$/,'')}/articles/${encodeURIComponent(saved.slug)}/`;
    const response=await fetcher(endpoint,{}, {hosts:[new URL(endpoint).hostname],timeoutMs:20000});
    const visible=response.data||response;
    if(String(visible.id)!==saved.id||visible.slug!==saved.slug||visible.body_html!==websitePayload(article,{categoryId:c.categoryId}).body_html)throw fail('Website record saved but the public API has not confirmed this article and content');
    await query("UPDATE echolink.articles SET website_post_id=$2,website_url=$3,website_status='Published',dirty=true,updated_at=now() WHERE id=$1",[article.id,saved.id,saved.url]);
    return {website_post_id:saved.id,website_url:saved.url,website_status:'Published'};
  }catch(error){
    await query("UPDATE echolink.articles SET website_post_id=COALESCE($2,website_post_id),website_url=COALESCE($3,website_url),website_status=$4,dirty=true,updated_at=now() WHERE id=$1",[article.id,saved?.id||null,saved?.url||null,saved?'Unknown':'Failed']).catch(()=>{});
    throw error instanceof WebsiteError?error:fail(saved?'Website may be published, but public confirmation failed. Retry will reuse the same website article.':'NobleSeek website publishing failed. Check database access, schema and connection settings.');
  }
}
export async function testWebsiteConnection({env=process.env,probeDraft=false}={}){
  const client=await(await websitePool(env)).connect();
  let stage='schema';
  try{
    const schema=await checkWebsiteSchema(client,env),c=websiteConfiguration(env);
    stage='permissions';
    const rights=(await client.query('SELECT has_table_privilege(current_user,$1,$2) AS can_insert,has_table_privilege(current_user,$1,$3) AS can_update',[schema.table,'INSERT','UPDATE'])).rows[0];
    if(!rights.can_insert||!rights.can_update)throw fail('The website database account needs INSERT and UPDATE access to nobleseek_article');
    let draftProbe;
    if(probeDraft){
      stage='draft probe';
      const {randomUUID}=await import('node:crypto');
      const article={id:randomUUID(),title:'EchoLink connection test — unpublished',caption:'Connection test only. This article must never be published.',source_url:'https://nobleseek.fabrything.com/nobleseek'};
      await client.query('BEGIN');
      try{
        const first=await writeWebsiteArticle(client,article,{env,status:'DRAFT'}),second=await writeWebsiteArticle(client,article,{env,status:'DRAFT'});
        if(first.id!==second.id||second.status!=='DRAFT'||second.published_at)throw fail('Website draft/idempotency probe failed');
        await client.query('ROLLBACK');
        const remaining=await client.query(`SELECT id FROM "${c.schema}"."nobleseek_article" WHERE slug=$1`,[first.slug]);
        if(remaining.rowCount)throw fail('Website probe rollback failed');
        draftProbe='Draft insert/read/retry succeeded and was rolled back; no article retained';
      }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
    }
    stage='public API';
    const existing=(await client.query(`SELECT id,slug FROM "${c.schema}"."nobleseek_article" WHERE status='PUBLISHED' AND published_at<=now() ORDER BY published_at DESC LIMIT 1`)).rows[0];
    let publicVerified=false,publicCatalogMatches=false,detailWarning;
    if(existing){
      const base=c.apiBaseURL.replace(/\/$/,'')+'/articles/';
      const list=await jsonRequest(base,{}, {hosts:[new URL(base).hostname],timeoutMs:20000});
      const entries=list.results||list.data?.results||list.data||[];
      publicCatalogMatches=Array.isArray(entries)&&entries.some(article=>String(article.id)===String(existing.id)&&article.slug===existing.slug);
      if(!publicCatalogMatches)throw fail('The public website listing does not match the configured database');
      try{const response=await jsonRequest(base+encodeURIComponent(existing.slug)+'/',{}, {hosts:[new URL(base).hostname],timeoutMs:20000});const article=response.data||response;publicVerified=String(article.id)===String(existing.id)&&article.slug===existing.slug;}
      catch(error){if(error.status!==404)throw error;detailWarning='The existing published article detail returned HTTP 404, although the listing matches the database. Repair the website route/deployment; a new live article URL is not verified by this connection test.';}
    }
    return {ok:true,columns:schema.columns,canInsert:true,canUpdate:true,publicCatalogMatchesDatabase:publicCatalogMatches,publicArticleVerified:publicVerified,...(detailWarning?{warning:detailWarning}:{}),...(draftProbe?{draftProbe}:{})};
  }catch(error){const detail=error.status?`HTTP ${error.status}`:/^[A-Z0-9_]{1,30}$/.test(error.code||'')?error.code:'connection or response failure';throw error instanceof WebsiteError?error:fail(`NobleSeek connection test failed at ${stage} (${detail}). Check database permissions, schema and public API access.`);}
  finally{client.release();}
}
