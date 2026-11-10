import '../platform/server/env.mjs';
import {transaction,closeDatabase,audit} from '../platform/server/db.mjs';
import {catalogueProductCopy} from '../platform/server/content-bundle.mjs';
import {captionLanguageWarnings} from '../platform/server/caption-generation.mjs';
import {editorialWarnings,criticalEditorialWarnings} from '../platform/server/editorial.mjs';
import {enqueue} from '../platform/server/jobs.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const apply=process.argv.includes('--apply');
try{
 const result=await transaction(null,async db=>{
  const pages=(await db.query("SELECT p.*,r.id AS rule_id FROM creator.pages p JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id LEFT JOIN creator.automation_rules r ON r.page_id=p.id WHERE lower(a.email)=$1",[(process.env.PLATFORM_OWNER_EMAIL||'').toLowerCase()])).rows;
  const posts=(await db.query("SELECT s.*,EXISTS(SELECT 1 FROM creator.tasks history WHERE history.post_id=s.id AND history.input?'pipeline') AS automatic FROM creator.posts s WHERE page_id=ANY($1::uuid[]) AND status IN ('draft','review','approved') AND deleted_at IS NULL AND archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM creator.tasks t WHERE t.post_id=s.id AND t.status IN ('running','queued'))",[pages.map(p=>p.id)])).rows;
  if(apply){await mkdir(new URL('../.codex/backups/',import.meta.url),{recursive:true});await writeFile(new URL('../.codex/backups/prepared-repair-'+Date.now()+'.json',import.meta.url),JSON.stringify({pages,posts},null,2),{mode:0o600});}
  let products=0,reports=0,held=0;
  for(const page of pages)if(apply&&page.kind==='news'){
   const policy={...page.creative_policy,contentFormat:'news_desk_v3',postTypePrompts:{...page.creative_policy.postTypePrompts,news:{...page.creative_policy.postTypePrompts?.news,caption:'Write complete, original, neutral Bangladeshi newspaper reporting in প্রমিত চলিত বাংলা, with a factual lead, developments, verified background, implications and clearly attributed uncertainty. Aim for a substantial report supported by the sources, not a social summary. Do not invent field reporting, quotes or facts. The app creates a short first-comment CTA caption separately.'}}};
   await db.query('UPDATE creator.pages SET creative_policy=$2 WHERE id=$1',[page.id,policy]);
  }
  for(const post of posts){const page=pages.find(p=>p.id===post.page_id);if(!post.automatic||!page.rule_id||post.seo?.safety?.requiresHuman){held++;continue;}
   if(page.kind==='news'&&post.type==='news'&&!post.website_url){reports++;if(apply)await db.query("UPDATE creator.posts SET status='draft',approved_version=NULL,version=version+1,last_error='Queued for a complete website report; earlier short copy will not be published',seo=seo||'{\"rebuildReport\":true}'::jsonb,updated_at=now() WHERE id=$1",[post.id]);continue;}
   if(page.kind!=='ecommerce'||post.type!=='product_sale'||!post.product_id||!(post.seo?.editorialWarnings||[]).length)continue;
   const product=(await db.query('SELECT * FROM creator.products WHERE id=$1 AND workspace_id=$2',[post.product_id,post.workspace_id])).rows[0];if(!product||!product.available){held++;continue;}
   const caption=catalogueProductCopy(page,product),facts={title:product.title,description:product.description,attributes:product.attributes,price:product.price,currency:product.currency},warnings=[...editorialWarnings(caption,facts,page.niche),...captionLanguageWarnings(caption,page),...(post.seo?.editorialWarnings||[]).filter(w=>w.startsWith('Design brief:'))];
   if(criticalEditorialWarnings(warnings).length){held++;continue;}products++;
   if(apply){const seo={...post.seo,editorialWarnings:warnings,channelCaptions:{instagram:caption+' #ShopOnline #ProductDetails #UsefulProducts'},generationNotes:[...(post.seo?.generationNotes||[]),'Prepared copy repaired from verified catalogue facts; previous model language was rejected.'],priceSnapshot:page.creative_policy?.commerce?.includePrice&&product.price!=null?{amount:Number(product.price),currency:product.currency}:null};await db.query("UPDATE creator.posts SET caption=$2,seo=$3,status='review',approved_version=NULL,version=version+1,last_error=NULL,updated_at=now() WHERE id=$1",[post.id,caption,seo]);await enqueue(db,post.workspace_id,'creative',{pageId:page.id,postId:post.id,input:{reuseAsset:true,pipeline:{ruleId:page.rule_id,makeCreative:true,autoPublish:true}}});await audit(db,post.workspace_id,null,'post.preparation_repaired','post',post.id,{kind:'catalogue-grounded-copy'});}
  }
  return {applied:apply,productsReadyForScheduling:products,newsQueuedForFullReports:reports,heldForManualOrUnavailableData:held};
 },{owner:true});console.log(JSON.stringify(result,null,2));
}finally{await closeDatabase();}
