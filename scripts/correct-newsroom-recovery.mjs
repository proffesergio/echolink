import '../platform/server/env.mjs';
import {transaction,workspaceLock,audit,closeDatabase} from '../platform/server/db.mjs';
import {decryptSecret} from '../platform/server/vault.mjs';
import {generateBriefNewsReport,normalizeBriefText,prepareBriefEvidence,briefQuality} from '../platform/server/news-brief-writer.mjs';
import {generateNewsSocial} from '../platform/server/news-report-writer.mjs';
import {textCompletion} from '../platform/server/providers.mjs';
import {criticalEditorialWarnings} from '../platform/server/editorial.mjs';
import {withNobleDatabase,verifyNoblePublic} from '../platform/server/nobleseek.mjs';
import {queuePublication} from '../platform/server/planner.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const id='7676b13f-1a48-4c69-af24-764dab6dbd8c',apply=process.argv.includes('--apply');
const escape=s=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
try{
 const input=await transaction(null,async db=>{
  const post=(await db.query("SELECT p.* FROM creator.posts p JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE p.id=$1 AND lower(a.email)=$2",[id,process.env.PLATFORM_OWNER_EMAIL.toLowerCase()])).rows[0];
  if(!post||!post.website_url||post.fb_post_id||!['review','scheduled'].includes(post.status))throw Error('This correction only handles the known website story before Facebook submission.');
  const page=(await db.query('SELECT * FROM creator.pages WHERE workspace_id=$1 AND id=$2',[post.workspace_id,post.page_id])).rows[0],site=(await db.query('SELECT * FROM creator.websites WHERE workspace_id=$1 AND id=$2',[post.workspace_id,page.website_id])).rows[0];
  const connection=(await db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=$2',[post.workspace_id,page.text_connection_id])).rows[0],website=(await db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=$2',[post.workspace_id,site.connection_id])).rows[0];
  return {post,page,site,connection,website,secret:decryptSecret(connection.secret_cipher,post.workspace_id)};
 },{owner:true});
 const {post,page,site,connection,website}=input,w=post.workspace_id;
 let text=normalizeBriefText(post.seo.article.text,{title:post.title}).replace(/^ঢাকা:\s*/u,'').replace(/ইত্তফাক/gu,'ইত্তেফাক').replace(/অনুরোধ জানিয়েছেন/gu,'অনুরোধ জানিয়েছে').replace(/আহ্বান জানিয়েছেন/gu,'আহ্বান জানিয়েছে');
 // Remove the specific unsupported reversal; the earlier supported denial of
 // misinformation remains intact. No new reporting or background is added.
 text=text.replace(/কৃষি মন্ত্রণালয় আবারও স্পষ্ট করে জানিয়েছে, সার ডিলার নিয়োগ বাতিলের কোনো খবর তাদের নজরে আসেনি।/u,'').trim();
 const quality=briefQuality(text,prepareBriefEvidence(post),page);if(criticalEditorialWarnings(quality.warnings).length)throw Error(quality.warnings.join(' '));
 if(!apply){console.log(JSON.stringify({apply:false,words:quality.wordCount,warnings:quality.warnings,websiteWrites:0}));process.exitCode=0;}
 else{
  await mkdir(new URL('../.codex/backups/',import.meta.url),{recursive:true});await writeFile(new URL('../.codex/backups/newsroom-correction-'+Date.now()+'.json',import.meta.url),JSON.stringify(post),{mode:0o600});
  // Hold only this future Facebook delivery before the independent source review.
  await transaction(w,async db=>{await workspaceLock(db,w);const current=(await db.query('SELECT version,status FROM creator.posts WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[w,id])).rows[0];
   if(current.version!==post.version)throw Error('The story changed before correction.');
   if((await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND post_id=$2 AND kind='publish' AND status='running'",[w,id])).rowCount||(await db.query("SELECT destination FROM creator.publication_deliveries WHERE workspace_id=$1 AND post_id=$2 AND destination='facebook' AND status IN ('running','unknown','confirmed','published')",[w,id])).rowCount)throw Error('Reconcile Facebook delivery before editing.');
   await db.query("UPDATE creator.tasks SET status='canceled',phase='Editorial source/format correction before Facebook',finished_at=now() WHERE workspace_id=$1 AND post_id=$2 AND kind='publish' AND status='queued'",[w,id]);await db.query("UPDATE creator.posts SET status='review',approved_version=NULL,scheduled_at=NULL,last_error='Checking a source qualification and paragraph formatting before Facebook' WHERE workspace_id=$1 AND id=$2",[w,id]);
  });
  const generated=await generateBriefNewsReport(input,{complete:async(c,s,p,o)=>o.purpose==='news_article'?JSON.stringify({text}):textCompletion(c,s,p,o),onMetrics:m=>console.log(JSON.stringify({model:m.model,purpose:m.purpose,seconds:m.seconds})),deferSocial:true});
  if(generated.hold)throw Error(generated.message);
  const updated={...post,title:generated.title,seo:{...post.seo,article:{...generated.article,socialPending:false},newsroomAudit:generated.newsroomAudit,editorialWarnings:generated.warnings,formatCorrection:{at:new Date().toISOString(),removedUnsupportedReversal:true,previousReviewHash:post.seo.article.reviewedTextHash}}};
  const social=await generateNewsSocial({page,post:updated,connection,secret:input.secret});if(criticalEditorialWarnings(social.warnings).length)throw Error(social.warnings.join(' '));updated.caption=social.caption;updated.seo.channelCaptions={};updated.seo.article.socialPreparedForURL=post.website_url;
  const body=generated.article.text.split(/\n\s*\n/).map(p=>'<p>'+escape(p)+'</p>').join('\n'),slug='echolink-'+id;
  await withNobleDatabase(website,decryptSecret(website.secret_cipher,w),async(db,{schema})=>{
   const result=await db.query(`UPDATE "${schema}".nobleseek_article SET body_html=$2,excerpt=$3,seo_description=$3,read_time_minutes=$4,updated_at=now() WHERE slug=$1 AND utm_campaign='echolink-nobleseek' AND status='PUBLISHED' RETURNING slug`,[slug,body,generated.article.text.slice(0,300),Math.max(1,Math.ceil(generated.article.wordCount/200))]);if(result.rowCount!==1)throw Error('The existing owned article was not found. No article was inserted.');
  });
  await verifyNoblePublic(site,slug,{expectedText:generated.article.text});
  const scheduled=await transaction(w,async db=>{await workspaceLock(db,w);const saved=(await db.query("UPDATE creator.posts SET title=$3,caption=$4,seo=$5,version=version+1,approved_version=NULL,last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$6 AND status='review' RETURNING *",[w,id,updated.title,updated.caption,updated.seo,post.version])).rows[0];if(!saved)throw Error('The story changed; website text is corrected, reconcile its local draft before scheduling.');
   await db.query("UPDATE creator.publication_deliveries SET phase='Corrected full report reviewed and exactly verified before Facebook',updated_at=now() WHERE workspace_id=$1 AND post_id=$2 AND destination='website' AND status='confirmed'",[w,id]);await audit(db,w,null,'newsroom.source-format-corrected','post',id,{words:generated.article.wordCount,previousHash:post.seo.article.reviewedTextHash});
   return queuePublication(db,w,null,page,saved,{at:new Date(post.scheduled_at||post.planned_at),approveCurrent:true,fallbackToSlot:true});
  });console.log(JSON.stringify({corrected:true,words:generated.article.wordCount,websiteVerified:true,scheduled:scheduled.not_before,insertedArticle:false}));
 }
}finally{await closeDatabase();}
