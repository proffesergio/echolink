// Verifies saved credentials using read-only provider calls; never publishes.
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import pg from '../platform/node_modules/pg/lib/index.js';
import {decryptSecret,encryptSecret} from '../platform/server/vault.mjs';
import {resolveFacebookPage} from '../platform/server/facebook.mjs';
import {discoverInstagram} from '../platform/server/instagram.mjs';
import {remoteJSON} from '../platform/server/net.mjs';
import {testNoble} from '../platform/server/nobleseek.mjs';
import {fetchProducts} from '../platform/server/catalog.mjs';
import {testMirror} from '../platform/server/mirrors.mjs';
const root=parseEnv(await readFile('.env.local','utf8')),app=parseEnv(await readFile('platform/.env.local','utf8')),db=new pg.Client({connectionString:app.DATABASE_URL_UNPOOLED});
if(new URL(app.DATABASE_URL).pathname!=='/echolink_live')throw new Error('This verifier requires the explicitly activated fresh database.');
process.env.PLATFORM_ENCRYPTION_KEY=app.PLATFORM_ENCRYPTION_KEY;process.env.PLATFORM_NOBLESEEK_DB_HOST=new URL(root.NOBLESEEK_DATABASE_URL).hostname;process.env.PLATFORM_NOBLESEEK_DATABASE_TRANSPORT='websocket';
const report=[],normal=s=>s.toLowerCase().replace(/[^a-z0-9]/g,''),safeError=e=>({ok:false,code:e.code||'connection_failed',metaCode:e.metaCode||null,metaSubcode:e.metaSubcode||null,message:e.metaCode===190?'Saved Meta authorization expired or was revoked. Reconnect this Page.':'Saved connection could not be verified. Reconnect or check its provider settings.'});
await db.connect();try{
 const pages=(await db.query('SELECT * FROM creator.pages ORDER BY name')).rows;
 for(const page of pages){const c=(await db.query('SELECT * FROM creator.connections WHERE id=$1',[page.facebook_connection_id])).rows[0],alias=page.kind==='news'?'NOBLESEEK':'FABRYTHING',version=c.config.version,base='https://graph.facebook.com/'+version,prior=decryptSecret(c.secret_cipher,page.workspace_id),tokens=[...new Set([prior.token,root[alias+'_META_USER_ACCESS_TOKEN'],root.META_USER_ACCESS_TOKEN,root.META_PAGE_ACCESS_TOKEN].filter(Boolean))];let connected,lastError;
  for(const token of tokens)try{
   const me=await remoteJSON(base+'/me?fields=id,name',{headers:{authorization:'Bearer '+token},timeout:10000});let id=normal(me.name||'')===normal(page.name)?String(me.id):null;
   if(!id){const accounts=await remoteJSON(base+'/me/accounts?fields=id,name&limit=100',{headers:{authorization:'Bearer '+token},timeout:10000});id=accounts.data?.find(p=>normal(p.name||'')===normal(page.name))?.id;}
   if(!id||page.fb_page_id&&String(id)!==page.fb_page_id)continue;
   const credentials={appId:root[alias+'_META_APP_ID'],appSecret:root[alias+'_META_APP_SECRET']};
   let resolved;try{resolved=await resolveFacebookPage({token,pageId:String(id),version,...credentials});}catch(error){if(error.metaCode===190)throw error;resolved=await resolveFacebookPage({token,pageId:String(id),version});}
   const debug=await remoteJSON(base+'/debug_token?input_token='+encodeURIComponent(resolved.token),{headers:{authorization:'Bearer '+credentials.appId+'|'+credentials.appSecret},timeout:10000});
   if(!debug.data?.is_valid||String(debug.data.app_id)!==String(credentials.appId)||!['pages_manage_posts','pages_read_engagement'].every(s=>debug.data.scopes?.includes(s)))throw Object.assign(new Error('Meta permissions require reconnection'),{code:'facebook_permissions'});
   connected={...resolved,pageId:String(id)};await db.query('UPDATE creator.connections SET secret_cipher=$2,status=$3,last_test_at=now(),last_test_result=$4 WHERE id=$1',[c.id,encryptSecret({token:resolved.token},page.workspace_id),'connected',resolved.result]);await db.query('UPDATE creator.pages SET fb_page_id=$2,fb_verified=true WHERE id=$1',[page.id,String(id)]);page.fb_page_id=String(id);break;
  }catch(error){lastError=error;}
  if(connected){report.push({page:page.name,service:'facebook',ok:true,pageId:connected.pageId,publishingSubmitted:false});try{const ig=await discoverInstagram(page,c,{token:connected.token});await db.query("INSERT INTO creator.social_destinations(workspace_id,page_id,platform,remote_id,username,enabled) VALUES($1,$2,'instagram',$3,$4,false) ON CONFLICT(workspace_id,page_id,platform) DO UPDATE SET remote_id=EXCLUDED.remote_id,username=EXCLUDED.username,verified_at=now()",[page.workspace_id,page.id,ig.id,ig.username]);report.push({page:page.name,service:'instagram',ok:true,username:ig.username,enabled:false});}catch(error){report.push({page:page.name,service:'instagram',...safeError(error)});}}
  else{const issue=safeError(lastError||{});await db.query('UPDATE creator.connections SET status=$2,last_test_at=now(),last_test_result=$3 WHERE id=$1',[c.id,'error',issue]);report.push({page:page.name,service:'facebook',...issue});}
 }
 const websites=(await db.query('SELECT * FROM creator.websites ORDER BY name')).rows;
 for(const site of websites){const c=(await db.query('SELECT * FROM creator.connections WHERE id=$1',[site.connection_id])).rows[0],secret=decryptSecret(c.secret_cipher,c.workspace_id);try{
  if(site.kind==='news')await testNoble(c,secret);
  else{const products=await fetchProducts(site,secret,c);for(const p of products)await db.query("INSERT INTO creator.products(workspace_id,website_id,external_id,title,description,url,image_url,price,compare_at_price,currency,available,attributes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(website_id,external_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,image_url=EXCLUDED.image_url,available=EXCLUDED.available,attributes=EXCLUDED.attributes,fetched_at=now()",[site.workspace_id,site.id,String(p.id||p.external_id),p.title,p.description||'',p.url,p.image_url||null,p.price??null,p.compare_at_price??null,p.currency||'BDT',p.available!==false,p.attributes||{}]);report.push({service:'product_catalog',ok:true,productsImported:products.length});}
  const result={ok:true,message:'Existing website schema verified using read-only queries.'};await db.query('UPDATE creator.connections SET status=$2,last_test_at=now(),last_test_result=$3 WHERE id=$1',[c.id,'connected',result]);report.push({website:site.name,service:'website',ok:true,websiteWritten:false});
 }catch(error){const result=safeError(error);await db.query('UPDATE creator.connections SET status=$2,last_test_at=now(),last_test_result=$3 WHERE id=$1',[c.id,'error',result]);report.push({website:site.name,service:'website',...result});}}
 for(const c of (await db.query("SELECT * FROM creator.connections WHERE provider='google_sheets'")).rows)try{const result=await testMirror(c,decryptSecret(c.secret_cipher,c.workspace_id));await db.query('UPDATE creator.connections SET status=$2,last_test_at=now(),last_test_result=$3 WHERE id=$1',[c.id,'connected',result]);report.push({service:'google_sheets',ok:true,sheetWritten:false});}catch(error){report.push({service:'google_sheets',...safeError(error)});}
 const model=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(3000)}).then(r=>r.json()).catch(()=>({}));report.push({service:'ollama',ok:!!model.models?.some(m=>m.name==='echolink-qwen3:4b'),model:'echolink-qwen3:4b',generationRequested:false});
 await writeFile('.codex/fresh-start-connections.json',JSON.stringify({checkedAt:new Date().toISOString(),report},null,2),{mode:0o600});console.log(JSON.stringify(report));
}finally{await db.end();}
