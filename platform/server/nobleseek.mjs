import {databaseDriver} from './database-driver.mjs';
import {AppError} from './errors.mjs';
import {publicURL} from './net.mjs';
const escape=s=>String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
export function nobleConfig(connection,secret){
 let url;try{url=new URL(secret.databaseURL);}catch{throw new AppError(400,'The website database connection is invalid.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==process.env.PLATFORM_NOBLESEEK_DB_HOST||!url.hostname.endsWith('.neon.tech')||url.port&&url.port!=='5432')throw new AppError(400,'This owner connector must use the operator-configured NobleSeek Neon host.');
 url.searchParams.set('sslmode','verify-full');const schema=connection.config.schema||'public';if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw new AppError(400,'Invalid database schema.');return {url:url.href,schema};
}
export async function withNobleDatabase(c,secret,fn){const config=nobleConfig(c,secret),driver=databaseDriver(),db=new driver.Client({connectionString:config.url,connectionTimeoutMillis:15000,statement_timeout:30000});try{await db.connect();return await fn(db,config);}finally{await db.end();}}
export async function testNoble(c,secret){return withNobleDatabase(c,secret,async(db,config)=>{await db.query('BEGIN READ ONLY');const fields=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='nobleseek_article'",[config.schema])).rows.map(r=>r.column_name);if(!['id','slug','headline','body_html','status'].every(f=>fields.includes(f)))throw new AppError(400,'NobleSeek article schema could not be verified.');await db.query('ROLLBACK');return {ok:true,message:'Existing NobleSeek schema verified with a read-only query.'};});}
export async function writeNoble(c,secret,site,post,{onWrite=()=>{}}={}){
 if(!post.source_url)throw new AppError(400,'NobleSeek publication requires an attributed source URL.');
 const canonical=publicURL(post.source_url).href,source=canonical.length>500?decodeURI(canonical):canonical,prose=post.caption.replace(/#[\p{L}\p{M}\p{N}_]+/gu,'').trim(),tags=(post.caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)||[]).map(x=>x.slice(1)),title=post.title.slice(0,255),now=new Date().toISOString();
 if(source.length>500||(post.creative.sourceImage||'').length>500)throw new AppError(400,'The website source or image URL exceeds its 500-character field. Choose a shorter valid URL.');
 const payload={headline:title,headline_bn:/[\u0980-\u09ff]/u.test(title)?title:'',slug:'echolink-'+post.id,excerpt:prose.slice(0,300),body_html:prose.split(/\n\s*\n/).filter(Boolean).map(p=>'<p>'+escape(p).replace(/\n/g,'<br>')+'</p>').join('\n')+'\n<p>সূত্র: <a href="'+escape(source)+'" rel="noopener noreferrer">'+escape(new URL(source).hostname)+' — মূল প্রতিবেদন</a></p>',hero_image:post.creative.sourceImage||'',hero_image_alt:title,image_credit:post.creative.sourceImage?'Source image: '+new URL(source).hostname:'',source_name:new URL(source).hostname,source_url:source,tags,status:'PUBLISHED',is_featured:false,is_breaking:false,related_product_ids:[],seo_title:title,seo_description:prose.slice(0,300),seo_keywords:tags,fb_post_url:'',utm_campaign:'echolink-nobleseek',view_count:0,read_time_minutes:Math.max(1,Math.ceil(prose.split(/\s+/).length/200)),published_at:now,created_at:now,updated_at:now,category_id:site.config.categoryId||null,trend_id:null};
 return withNobleDatabase(c,secret,async(db,config)=>{
  const category=post.seo?.category,aliases={technology:['technology','tech','ai'],business:['business','economy'],general:['latest','general']};
  if(category){
   const mapped=site.config.categoryMap?.[category];
   if(mapped)payload.category_id=mapped;
   else{const match=(await db.query(`SELECT id FROM "${config.schema}".nobleseek_newscategory WHERE is_active AND slug=ANY($1::text[]) ORDER BY array_position($1::text[],slug) LIMIT 1`,[aliases[category]||[category]])).rows[0];if(match)payload.category_id=match.id;}
  }
  const fields=Object.keys(payload),values=Object.values(payload).map(v=>Array.isArray(v)?JSON.stringify(v):v);
  onWrite();
  const result=await db.query(`INSERT INTO "${config.schema}"."nobleseek_article" AS existing (${fields.map(f=>'"'+f+'"').join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(slug) DO UPDATE SET updated_at=existing.updated_at WHERE existing.utm_campaign=EXCLUDED.utm_campaign AND existing.source_url=EXCLUDED.source_url RETURNING slug`,values);
  if(!result.rowCount)throw new AppError(409,'That website slug belongs to another article.');return {link:new URL('/nobleseek/'+result.rows[0].slug,site.url).href};
 });
}
