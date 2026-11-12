import '../platform/server/env.mjs';
import {transaction,closeDatabase,audit,workspaceLock} from '../platform/server/db.mjs';
import {prepareCaption} from '../platform/server/prompts.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const apply=process.argv.includes('--apply');
try{console.log(JSON.stringify(await transaction(null,async db=>{
 const pages=(await db.query("SELECT p.* FROM creator.pages p JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND p.kind='ecommerce'",[process.env.PLATFORM_OWNER_EMAIL.toLowerCase()])).rows;
 let changed=0;
 for(const page of pages){await workspaceLock(db,page.workspace_id);
 const posts=(await db.query("SELECT s.*,to_jsonb(p) AS product FROM creator.posts s JOIN creator.products p ON p.id=s.product_id AND p.workspace_id=s.workspace_id WHERE s.workspace_id=$1 AND s.page_id=$2 AND s.status IN ('draft','review','approved','scheduled','failed') AND s.deleted_at IS NULL AND s.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM creator.tasks t WHERE t.post_id=s.id AND t.status='running') AND NOT EXISTS(SELECT 1 FROM creator.publication_deliveries d WHERE d.post_id=s.id AND d.status IN ('running','unknown','confirmed','published')) FOR UPDATE OF s",[page.workspace_id,page.id])).rows;
 if(apply){await mkdir(new URL('../.codex/backups/',import.meta.url),{recursive:true});await writeFile(new URL('../.codex/backups/commerce-price-policy-'+page.id+'-'+Date.now()+'.json',import.meta.url),JSON.stringify({page,posts}),{mode:0o600});
 const policy={...page.creative_policy,commerce:{...page.creative_policy?.commerce,includePrice:false}};
 await db.query('UPDATE creator.pages SET creative_policy=$3 WHERE workspace_id=$1 AND id=$2',[page.workspace_id,page.id,policy]);page.creative_policy=policy;
 }
 for(const post of posts){if(!post.caption)continue;const caption=prepareCaption(post.caption,page,post.product).caption,seo={...post.seo,channelCaptions:{...post.seo?.channelCaptions}};
 if(seo.channelCaptions.instagram)seo.channelCaptions.instagram=prepareCaption(seo.channelCaptions.instagram,page,post.product).caption;
 delete seo.priceSnapshot;seo.description=caption.replace(/#[\p{L}\p{M}\p{N}_]+/gu,'').trim().slice(0,160);
 seo.editorialWarnings=(seo.editorialWarnings||[]).filter(w=>w!=='Content format: the current catalogue price is missing from the Facebook caption.');
 if(caption===post.caption&&JSON.stringify(seo)===JSON.stringify(post.seo))continue;changed++;
 if(apply){await db.query('UPDATE creator.posts SET caption=$3,seo=$4,version=version+1,approved_version=CASE WHEN approved_version=version THEN version+1 ELSE approved_version END,updated_at=now() WHERE workspace_id=$1 AND id=$2',[post.workspace_id,post.id,caption,seo]);await audit(db,post.workspace_id,null,'post.price-removed-owner-request','post',post.id);}
 }
 }
 return {apply,pages:pages.length,pendingCaptionsUpdated:changed};
},{owner:true})));}finally{await closeDatabase();}
