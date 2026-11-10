import {articleText} from './news-article.mjs';
import {load} from 'cheerio';
import {databaseDriver} from './database-driver.mjs';
import {AppError} from './errors.mjs';
import {publicURL,remoteJSON} from './net.mjs';
import {definiteDatabaseRejection} from './publication-state.mjs';
const escape=s=>String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
export function nobleConfig(connection,secret){
 let url;try{url=new URL(secret.databaseURL);}catch{throw new AppError(400,'The website database connection is invalid.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==process.env.PLATFORM_NOBLESEEK_DB_HOST||!url.hostname.endsWith('.neon.tech')||url.port&&url.port!=='5432')throw new AppError(400,'This owner connector must use the operator-configured NobleSeek Neon host.');
 url.searchParams.set('sslmode','verify-full');const schema=connection.config.schema||'public';if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw new AppError(400,'Invalid database schema.');return {url:url.href,schema};
}
export async function withNobleDatabase(c,secret,fn){const config=nobleConfig(c,secret),driver=databaseDriver(process.env.PLATFORM_NOBLESEEK_DATABASE_TRANSPORT||'websocket'),db=new driver.Client({connectionString:config.url,connectionTimeoutMillis:15000,statement_timeout:30000,query_timeout:35000});db.on('error',()=>{});try{await db.connect();return await fn(db,config);}finally{await db.end();}}
export async function testNoble(c,secret){return withNobleDatabase(c,secret,async(db,config)=>{await db.query('BEGIN READ ONLY');const fields=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='nobleseek_article'",[config.schema])).rows.map(r=>r.column_name);if(!['id','slug','headline','body_html','status'].every(f=>fields.includes(f)))throw new AppError(400,'NobleSeek article schema could not be verified.');await db.query('ROLLBACK');return {ok:true,message:'Existing NobleSeek schema verified with a read-only query.'};});}
export async function writeNoble(c,secret,site,post,{onWrite=()=>{},database=withNobleDatabase}={}){
 if(!post.source_url)throw new AppError(400,'NobleSeek publication requires an attributed source URL.');
 const canonical=publicURL(post.source_url).href,source=canonical.length>500?decodeURI(canonical):canonical,prose=articleText(post.seo?.article?.text||post.caption),tags=(post.caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)||[]).map(x=>x.slice(1)),title=post.title.slice(0,255),now=new Date().toISOString();
 if(source.length>500||(post.creative.sourceImage||'').length>500)throw new AppError(400,'The website source or image URL exceeds its 500-character field. Choose a shorter valid URL.');
 const payload={headline:title,headline_bn:/[\u0980-\u09ff]/u.test(title)?title:'',slug:'echolink-'+post.id,excerpt:prose.slice(0,300),body_html:prose.split(/\n\s*\n/).filter(Boolean).map(p=>'<p>'+escape(p).replace(/\n/g,'<br>')+'</p>').join('\n'),hero_image:post.creative.sourceImage||'',hero_image_alt:title,image_credit:post.creative.sourceImage?String(site.imageCredit||''):'',source_name:'',source_url:'',tags,status:'PUBLISHED',content_type:'NEWS',is_featured:false,is_breaking:false,related_product_ids:[],seo_title:title,seo_description:prose.slice(0,300),seo_keywords:tags,fb_post_url:'',utm_campaign:'echolink-nobleseek',view_count:0,read_time_minutes:Math.max(1,Math.ceil(prose.split(/\s+/).length/200)),published_at:now,created_at:now,updated_at:now,category_id:site.config.categoryId||null,trend_id:null};
 return database(c,secret,async(db,config)=>{
  const category=post.seo?.category,aliases={technology:['technology','tech','ai'],business:['business','economy'],general:['latest','general']};
  if(category){
   const mapped=site.config.categoryMap?.[category];
   if(mapped)payload.category_id=mapped;
   else{const match=(await db.query(`SELECT id FROM "${config.schema}".nobleseek_newscategory WHERE is_active AND slug=ANY($1::text[]) ORDER BY array_position($1::text[],slug) LIMIT 1`,[aliases[category]||[category]])).rows[0];if(match)payload.category_id=match.id;}
  }
  const columns=(await db.query("SELECT column_name,is_nullable,column_default,is_identity FROM information_schema.columns WHERE table_schema=$1 AND table_name='nobleseek_article'",[config.schema])).rows;
  const known=new Set(columns.map(c=>c.column_name));if(!known.has('content_type'))delete payload.content_type;const missing=columns.filter(c=>c.is_nullable==='NO'&&!c.column_default&&c.is_identity!=='YES'&&!Object.hasOwn(payload,c.column_name));if(missing.length)throw new AppError(409,'Website schema needs connector support for required field: '+missing.map(c=>c.column_name).join(', '));
  const fields=Object.keys(payload),values=Object.values(payload).map(v=>Array.isArray(v)?JSON.stringify(v):v);
  onWrite();
  let result;try{result=await db.query(`INSERT INTO "${config.schema}"."nobleseek_article" AS existing (${fields.map(f=>'"'+f+'"').join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(slug) DO UPDATE SET updated_at=existing.updated_at WHERE existing.utm_campaign=EXCLUDED.utm_campaign AND existing.source_url=EXCLUDED.source_url RETURNING slug,status`,values);}catch(error){if(definiteDatabaseRejection(error)){error.definiteRejection=true;}throw error;}
  if(!result.rowCount||result.rows[0].status!=='PUBLISHED'){const error=new AppError(409,!result.rowCount?'That website slug belongs to another article.':'The existing website article is not published. Review it in the website CMS.');error.definiteRejection=true;throw error;}return {link:new URL('/nobleseek/'+result.rows[0].slug,site.url).href,slug:result.rows[0].slug};
 });
}

export async function verifyNoblePublic(site,slug,{request=remoteJSON,expectedText}={}){
 const endpoint=new URL('/api/store/nobleseek/articles/'+encodeURIComponent(slug)+'/',site.url);
 const result=await request(endpoint.href,{timeout:20000});const article=result.data||result;
 if(article.slug!==slug)throw new AppError(502,'The website API has not exposed this exact article yet. Facebook is waiting; the database article is preserved.');
 if(expectedText){const normalized=text=>String(text).normalize('NFC').replace(/\s+/gu,' ').trim(),actual=load('<div>'+String(article.body_html||article.body||'').replace(/<\/p\s*>/gi,'</p> ')+'</div>')('div').text();if(normalized(actual)!==normalized(expectedText))throw new AppError(502,'The live website article does not yet match the complete checked report. Facebook preparation is waiting; inspect the website CMS/cache.');}
 return {verifiedAt:new Date().toISOString(),url:new URL('/nobleseek/'+slug,site.url).href};
}
