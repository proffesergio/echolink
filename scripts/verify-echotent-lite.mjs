import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {generateContentBundle,NEWS_BUNDLE_PROMPT,COMMERCE_BUNDLE_PROMPT} from '../platform/server/content-bundle.mjs';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
const model=process.argv.find(x=>x.startsWith('--model='))?.slice(8)||'echotent:qwen2.5-1.5b',modelSlug=model.replace(/[^a-zA-Z0-9_.-]/g,'-');
try{
 await transaction(null,async db=>{
  await db.query("SELECT id FROM creator.tasks WHERE status='queued' AND kind NOT IN ('publish','publish_instagram','post_link_comment','manual_handoff','apply_page_brand') FOR UPDATE SKIP LOCKED");
  const n=(await db.query("SELECT count(*)::int AS n FROM creator.tasks WHERE status='running' AND kind NOT IN ('publish','publish_instagram','post_link_comment','manual_handoff','apply_page_brand')")).rows[0].n;
  if(n)throw new Error('Content preparation is already running. Retry the output check after it drains.');
  const pages=(await db.query("SELECT p.* FROM creator.pages p JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND p.kind IN ('news','ecommerce') ORDER BY p.kind",[process.env.PLATFORM_OWNER_EMAIL])).rows;
  await mkdir(new URL('../.local/verification/',import.meta.url),{recursive:true});
  for(const original of pages){
   const pageFilter=process.argv.find(x=>x.startsWith('--page='))?.slice(7);if(pageFilter&&original.kind!==pageFilter)continue;
   const type=original.kind==='news'?'news':'product_sale',page={...original,language:type==='news'?'Bangla':'Bilingual-Mix',creative_policy:{...original.creative_policy,contentFormat:type==='news'?'news_desk_v2':'commerce_v2',commerce:{includePrice:true},postTypePrompts:{[type]:{caption:type==='news'?NEWS_BUNDLE_PROMPT:COMMERCE_BUNDLE_PROMPT}}}};
   const product=type==='product_sale'?(await db.query('SELECT * FROM creator.products WHERE website_id=$1 AND available ORDER BY fetched_at DESC LIMIT 1',[page.website_id])).rows[0]:null;
   const post=type==='news'?(await db.query("SELECT * FROM creator.posts WHERE page_id=$1 AND type='news' AND length(body)>600 ORDER BY created_at DESC LIMIT 1",[page.id])).rows[0]:{type,title:product?.title};
   if(!post||type==='product_sale'&&!product)throw new Error('Source evidence missing for '+page.name);
   let savedDraft;const checkpoint=new URL('../.local/verification/checkpoint-'+type+'-'+modelSlug+'.json',import.meta.url);try{savedDraft=JSON.parse(await readFile(checkpoint,'utf8'));}catch{};
   const metrics=[],start=Date.now();console.log('Checking '+page.name+' three-part output with '+model+'; publication is not part of this check.');
   const result=await generateContentBundle({page,post,product,connection:{provider:'ollama',config:{model,researchEvaluation:true,temperature:.3,contextTokens:4096,maxOutputTokens:1800}},secret:{}},{savedDraft,onSection:async draft=>writeFile(checkpoint,JSON.stringify(draft)),onProgress:async(part)=>console.log('Writing section '+part+' of 3.'),onMetrics:m=>metrics.push(m),onCorrection:async()=>console.log('Repairing the structured output format once.')});
   await writeFile(new URL('../.local/verification/echotent-'+type+'-'+modelSlug+'.json',import.meta.url),JSON.stringify({result,metrics,seconds:(Date.now()-start)/1000},null,2));
   console.log(JSON.stringify({page:page.name,seconds:Math.round((Date.now()-start)/1000),metrics,warnings:result.warnings,articleWords:result.article?.wordCount,captionLength:result.caption.length,instagramLength:result.instagramCaption?.length}));
  }
 },{owner:true});
}catch(error){console.error(error.message);process.exitCode=1;}finally{await closeDatabase();}
