import '../platform/server/env.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {transaction,workspaceLock,audit,closeDatabase} from '../platform/server/db.mjs';
import {releasePublication} from '../platform/server/quotas.mjs';
import {prepareBriefEvidence} from '../platform/server/news-brief-writer.mjs';
import {preflightContent} from '../platform/server/safety.mjs';
import {enqueue} from '../platform/server/jobs.mjs';
const apply=process.argv.includes('--apply');
const first=process.argv.find(a=>a.startsWith('--first='))?.slice(8);if(first&&!/^[a-f0-9-]{36}$/.test(first))throw Error('Use a valid first-story UUID.');
try{console.log(JSON.stringify(await transaction(null,async db=>{
 const pages=(await db.query("SELECT p.*,r.id AS rule_id FROM creator.pages p JOIN creator.automation_rules r ON r.page_id=p.id AND r.workspace_id=p.workspace_id JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND p.kind='news' AND p.creative_policy->>'contentFormat'='news_desk_v3' AND p.active AND NOT p.require_review AND r.enabled AND r.auto_publish AND r.auto_schedule",[process.env.PLATFORM_OWNER_EMAIL.toLowerCase()])).rows;
 const selected=[],held=[];
 for(const page of pages){await workspaceLock(db,page.workspace_id);
 const posts=(await db.query("SELECT s.* FROM creator.posts s WHERE s.workspace_id=$1 AND s.page_id=$2 AND s.type='news' AND s.status IN ('draft','review','approved','failed') AND s.website_url IS NULL AND s.deleted_at IS NULL AND s.archived_at IS NULL AND COALESCE(s.seo->'article'->>'briefMode','')<>'context-brief-v1' AND COALESCE(s.seo->'safety'->>'requiresHuman','false')<>'true' AND EXISTS(SELECT 1 FROM creator.tasks t WHERE t.post_id=s.id AND t.input?'pipeline') AND NOT EXISTS(SELECT 1 FROM creator.tasks t WHERE t.post_id=s.id AND t.status IN ('queued','running')) AND NOT EXISTS(SELECT 1 FROM creator.publication_deliveries d WHERE d.post_id=s.id AND d.status IN ('running','unknown','confirmed','published')) AND NOT EXISTS(SELECT 1 FROM creator.publish_attempts a WHERE a.post_id=s.id AND a.outcome NOT IN ('rejected','failed')) AND NOT EXISTS(SELECT 1 FROM creator.usage_reservations u WHERE u.post_id=s.id AND u.status='unknown') FOR UPDATE",[page.workspace_id,page.id])).rows;
 const manual=new Set((await db.query("SELECT resource_id FROM creator.activity WHERE workspace_id=$1 AND actor_id IS NOT NULL AND action='posts.saved' AND resource_id=ANY($2::text[])",[page.workspace_id,posts.map(p=>p.id)])).rows.map(r=>r.resource_id));
 for(const post of posts){const safety=preflightContent(post,[],page.creative_policy),evidence=prepareBriefEvidence(post);if(manual.has(post.id)||safety.highAlert||evidence.hold){held.push({id:post.id,reason:manual.has(post.id)?'Explicitly saved manual draft retained':safety.highAlert?'Crisis/manual review retained':evidence.message});continue;}selected.push(post);}
 }
 if(apply){await mkdir(new URL('../.codex/backups/',import.meta.url),{recursive:true});await writeFile(new URL('../.codex/backups/newsroom-context-'+Date.now()+'.json',import.meta.url),JSON.stringify({pages,posts:selected}),{mode:0o600});
 for(const page of pages){const policy={...page.creative_policy,editorial:{...page.creative_policy?.editorial,articleWritingMode:'brief',newsRanking:'balanced'}};
 await db.query('UPDATE creator.pages SET creative_policy=$3 WHERE workspace_id=$1 AND id=$2',[page.workspace_id,page.id,policy]);await db.query("UPDATE creator.automation_rules SET next_run_at=now(),last_message='80–500-word context briefs enabled; one whole-report review, then automatic website/social scheduling' WHERE workspace_id=$1 AND id=$2",[page.workspace_id,page.rule_id]);
 await audit(db,page.workspace_id,null,'newsroom.context-mode-enabled','page',page.id);
 }
 for(const post of selected){await releasePublication(db,post.workspace_id,post.id);
 const seo={...post.seo,previousNewsroomWarnings:{warnings:post.seo?.editorialWarnings||[],error:post.last_error,at:new Date().toISOString()},editorialWarnings:[],rebuildReport:true};for(const key of ['article','bundleDraft','articleDraft','newsroomAudit','channelCaptions'])delete seo[key];
 await db.query("UPDATE creator.posts SET status='draft',caption='',seo=$3,planned_at=NULL,scheduled_at=NULL,approved_version=NULL,version=version+1,last_error='Queued for a complete 80–500-word brief and one factual/context review',updated_at=now() WHERE workspace_id=$1 AND id=$2",[post.workspace_id,post.id,seo]);await audit(db,post.workspace_id,null,'newsroom.context-upgraded','post',post.id);
 }
 if(first){const post=selected.find(p=>p.id===first);if(!post)throw Error('The first story is not eligible; no upgrade was committed.');const page=pages.find(p=>p.id===post.page_id);
 await enqueue(db,post.workspace_id,'generate',{pageId:post.page_id,postId:post.id,input:{urgent:true,pipeline:{ruleId:page.rule_id,makeCreative:true,autoPublish:true}}});await db.query("UPDATE creator.posts SET seo=jsonb_set(seo,'{rebuildReport}','false') WHERE workspace_id=$1 AND id=$2",[post.workspace_id,post.id]);
 }
 }
 return {apply,pages:pages.length,requeued:selected.length,firstQueued:apply&&!!first,held};
},{owner:true}),null,2));}finally{await closeDatabase();}
