import '../platform/server/env.mjs';
import {transaction,audit,workspaceLock,closeDatabase} from '../platform/server/db.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {cleanPublicCopy} from '../platform/server/public-copy.mjs';
// Explicit owner-only rollout. No tokens, connections or other tenant settings
// are exported or changed. Existing publication IDs and reservations survive.
try{
 const snapshot=await transaction(null,async db=>(await db.query("SELECT p.id,p.workspace_id,p.name,p.language,p.creative_policy FROM creator.pages p JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND p.id=ANY($2::uuid[])",['fabrything@gmail.com',['c160b424-cc70-486f-b661-b2947a3e3619','2868043e-c90c-4f75-a0ac-fb374dff088c']])).rows,{owner:true});
 if(snapshot.length!==2)throw new Error('Expected both existing owner Pages. No changes applied.');
 await mkdir(new URL('../.codex/',import.meta.url),{recursive:true});
 await writeFile(new URL('../.codex/editorial-before-v2-'+Date.now()+'.json',import.meta.url),JSON.stringify(snapshot,null,2));
 let cleaned=0;for(const item of snapshot)await transaction(item.workspace_id,async db=>{
  await workspaceLock(db,item.workspace_id);
  const page=(await db.query('SELECT kind,creative_policy FROM creator.pages WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[item.workspace_id,item.id])).rows[0],policy={...page.creative_policy};
  if((await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND page_id=$2 AND status='running' AND kind IN ('generate','publish','creative','publish_instagram') LIMIT 1",[item.workspace_id,item.id])).rowCount)throw new Error('Page has active preparation/delivery. Retry after it finishes.');
  const news=page.kind==='news';
  policy.captionInstructions=news?'স্বাভাবিক, প্রাঞ্জল বাংলায় নিজস্ব ভাষায় তথ্যসমৃদ্ধ সংবাদ লিখুন। ঘটনার মূল তথ্য, সময় ও অনিশ্চয়তা অক্ষুণ্ণ রাখুন। অভিযোগ বা কারও বক্তব্যকে প্রতিষ্ঠিত সত্য বানাবেন না। প্রয়োজনীয় ক্ষেত্রে বক্তার পরিচয় রাখুন। উত্তেজনাপূর্ণ শিরোনাম, দ্বৈত অনুবাদ, স্বয়ংক্রিয় প্রকাশ বা কমেন্টের বর্ণনা থাকবে না।':'স্বাভাবিক, প্রাঞ্জল বাংলায় পণ্যের সংক্ষিপ্ত পরিচয় ও ক্যাটালগে নিশ্চিত বৈশিষ্ট্য লিখুন। সহজ ভাষা, সুনির্দিষ্ট তথ্য ও প্রয়োজনীয় একটি ইনবক্স/অর্ডার আহ্বান রাখুন। দাম, ভিত্তিহীন সুবিধা, কৃত্রিম তাগিদ বা আলাদা ইংরেজি অনুবাদ নয়। মডেল নাম ও প্রযুক্তিগত একক প্রয়োজনমতো অপরিবর্তিত থাকবে।';
  policy.editorial={...policy.editorial,learningEnabled:true,newsRanking:'model',styleNotes:news?'প্রথম বাক্যে মূল ঘটনা, তারপর প্রয়োজনীয় প্রেক্ষাপট। স্বাভাবিক সম্পাদিত বাংলা; একই ছাঁচের সূচনা বা অনুবাদ পুনরাবৃত্তি নয়।':'পণ্যের ধরন অনুযায়ী সহজ, পরিমিত বাংলা। শুধু নিশ্চিত বৈশিষ্ট্য, ভিন্ন সূচনা, একটি প্রয়োজনীয় যোগাযোগের আহ্বান।'};
  policy.channelCaptions={...policy.channelCaptions,facebook:{style:news?'editorial':'showcase',instructions:'Use the Page language only. No translated English summary, delivery steps or promised comments. Preserve verified facts.'},instagram:{style:'showcase',instructions:'Use the same Page language and facts, with compact paragraphs. No separate translated caption, prices or delivery instructions.'}};
  await db.query("UPDATE creator.pages SET language='Bangla',creative_policy=$3 WHERE workspace_id=$1 AND id=$2",[item.workspace_id,item.id,policy]);
  const posts=(await db.query("SELECT id,caption,seo,version,approved_version FROM creator.posts p WHERE workspace_id=$1 AND page_id=$2 AND status IN ('draft','review','approved','scheduled','failed') AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM creator.tasks t WHERE t.workspace_id=p.workspace_id AND t.post_id=p.id AND t.status='running')",[item.workspace_id,item.id])).rows;
  for(const post of posts){const copy=cleanPublicCopy(post.caption),instagram=post.seo?.channelCaptions?.instagram,ig=instagram?cleanPublicCopy(instagram):null;if(!copy.removed.length&&!ig?.removed.length)continue;if(copy.caption.length<60)continue;
   const seo={...post.seo,...(ig?{channelCaptions:{...post.seo.channelCaptions,instagram:ig.caption}}:{}),generationNotes:[...(post.seo.generationNotes||[]),'Audience copy cleaned of internal delivery instructions.']};
   await db.query('UPDATE creator.posts SET caption=$3,seo=$4,version=version+1,approved_version=CASE WHEN approved_version=version THEN version+1 ELSE NULL END,updated_at=now() WHERE workspace_id=$1 AND id=$2',[item.workspace_id,post.id,copy.caption,seo]);cleaned++;
  }
  await audit(db,item.workspace_id,null,'page.editorial_v2_configured','page',item.id,{language:'Bangla',deliverySettingsPreserved:true});
 });
 console.log(JSON.stringify({pagesUpdated:snapshot.map(p=>p.name),language:'Bangla',pendingCaptionsCleaned:cleaned,connectionsChanged:false,publishedHistoryChanged:false}));
}finally{await closeDatabase();}
