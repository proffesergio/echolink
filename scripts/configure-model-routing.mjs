import '../platform/server/env.mjs';
import {transaction,audit,closeDatabase} from '../platform/server/db.mjs';
import {NEWS_BUNDLE_PROMPT,COMMERCE_BUNDLE_PROMPT} from '../platform/server/content-bundle.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const mode=process.argv[2],holdFile=new URL('../.codex/qwen-cutover.json',import.meta.url);
try{
 const hold=JSON.parse(await readFile(holdFile,'utf8'));if(hold.phase!=='held')throw new Error('Use the drained generation cutover before configuring or releasing routes.');
 if(mode==='configure'){
  await mkdir(new URL('../.codex/backups/',import.meta.url),{recursive:true});
  const snapshot=await transaction(null,async db=>{
   const pages=(await db.query('SELECT id,workspace_id,name,kind,language,creative_policy FROM creator.pages WHERE id=ANY($1::uuid[])',[hold.pages.map(p=>p.id)])).rows;
   const connections=(await db.query('SELECT id,workspace_id,name,config FROM creator.connections WHERE id=ANY($1::uuid[])',[hold.connections.map(c=>c.id)])).rows;return {at:new Date().toISOString(),pages,connections};
  },{owner:true});
  await writeFile(new URL('../.codex/backups/model-routing-'+Date.now()+'.json',import.meta.url),JSON.stringify(snapshot,null,2),{mode:0o600});
  await transaction(null,async db=>{
   for(const c of snapshot.connections){const config={...c.config,model:'echotent:qwen3-4b',temperature:.3,contextTokens:4096,maxOutputTokens:1800,automaticFallback:false,automaticRouting:true,simpleModel:'echotent:gemma2-2b',complexModel:'echotent:qwen3-4b',taskModels:{research:'echotent:gemma2-2b',product_analysis:'echotent:phi3-3.8b',news_article:'echotent:qwen3-4b',news_caption:'echotent:gemma2-2b',first_comment:'echotent:gemma2-2b',design_brief:'echotent:qwen3-4b',product_caption:'echotent:qwen3-4b',instagram_caption:'echotent:gemma2-2b',storyboard:'echotent:qwen3-4b',reference_analysis:'echotent:qwen3-4b'},taskContextTokens:{research:2048,product_analysis:2048,news_caption:2048,first_comment:1024,instagram_caption:2048,design_brief:2048,product_caption:4096,news_article:4096,storyboard:4096,reference_analysis:4096}};
    await db.query('UPDATE creator.connections SET name=$2,config=$3 WHERE id=$1',[c.id,'Echotent · Task-routed content desk',config]);await audit(db,c.workspace_id,null,'inference.routing_configured','connection',c.id,{models:[...new Set(Object.values(config.taskModels))],researchModelExcluded:'qwen2.5:3b'});
   }
   for(const p of snapshot.pages){const news=p.kind==='news',type=news?'news':'product_sale';const policy={...p.creative_policy,contentFormat:news?'news_desk_v2':'commerce_v2',...(news?{nichePreset:'news_standard'}:{}),commerce:{...p.creative_policy?.commerce,includePrice:!news},captionInstructions:news?'প্রমিত চলিত বাংলায় নিরপেক্ষ, তথ্যনিষ্ঠ সংবাদ লিখুন। অযাচাইকৃত দাবি, পৃথক ইংরেজি অনুবাদ এবং প্রকাশ/কমেন্টের অভ্যন্তরীণ নির্দেশনা পাঠকের লেখায় থাকবে না।':'স্বাভাবিক, স্মার্ট বাংলা ভাষায় লিখুন; প্রয়োজনীয় পণ্যের নাম ও প্রযুক্তিগত শব্দ ইংরেজিতে থাকতে পারে। শুধু এই পণ্যের ক্যাটালগের তথ্য ও বর্তমান দাম ব্যবহার করুন। পোশাকের বৈশিষ্ট্য অন্য পণ্যে প্রয়োগ করবেন না; ভিত্তিহীন ছাড়, ফ্রি ডেলিভারি বা স্টক-সংকট দাবি করবেন না।',postTypePrompts:{...p.creative_policy?.postTypePrompts,[type]:{...p.creative_policy?.postTypePrompts?.[type],caption:news?NEWS_BUNDLE_PROMPT:COMMERCE_BUNDLE_PROMPT}},linkComments:{...p.creative_policy?.linkComments,enabled:true,likeOwnComment:true}};
    await db.query('UPDATE creator.pages SET creative_policy=$2,language=$3 WHERE id=$1',[p.id,policy,news?'Bangla':'Bilingual-Mix']);
   }
  },{owner:true});console.log('Owner task routes and separate Page prompts saved. Page enablement/review flags retained; generation stays held for final verification.');
 }else if(mode==='release'){
  await transaction(null,async db=>{for(const r of hold.rules)await db.query('UPDATE creator.automation_rules SET enabled=$2,next_run_at=now() WHERE id=$1',[r.id,r.enabled]);for(const t of hold.tasks)await db.query("UPDATE creator.tasks SET not_before=GREATEST(now(),$2::timestamptz) WHERE id=$1 AND status='queued'",[t.id,t.not_before]);},{owner:true});hold.phase='routed-active';hold.releasedAt=new Date().toISOString();await writeFile(holdFile,JSON.stringify(hold,null,2));console.log('Original automation enablement restored; pending preparation released.');
 }else throw new Error('Use configure or release.');
}finally{await closeDatabase();}
