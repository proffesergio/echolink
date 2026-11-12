import '../platform/server/env.mjs';
import {transaction,closeDatabase,audit,workspaceLock} from '../platform/server/db.mjs';
import {evidenceLedger,evidenceConflicts,newsWords} from '../platform/server/news-quality.mjs';
import {preflightContent} from '../platform/server/safety.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const apply=process.argv.includes('--apply');
try{console.log(JSON.stringify(await transaction(null,async db=>{
 const pages=(await db.query("SELECT p.* FROM creator.pages p JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id JOIN creator.automation_rules r ON r.page_id=p.id AND r.workspace_id=p.workspace_id WHERE lower(a.email)=$1 AND p.kind='news' AND p.creative_policy->>'contentFormat'='news_desk_v3' AND p.active AND r.enabled AND r.auto_publish AND r.auto_schedule",[process.env.PLATFORM_OWNER_EMAIL.toLowerCase()])).rows;
 const selected=[],held=[];
 for(const page of pages){await workspaceLock(db,page.workspace_id);
 const posts=(await db.query("SELECT s.* FROM creator.posts s WHERE s.workspace_id=$1 AND s.page_id=$2 AND s.type='news' AND s.status IN ('draft','review','failed') AND s.website_url IS NULL AND s.deleted_at IS NULL AND s.archived_at IS NULL AND COALESCE(s.seo->'safety'->>'requiresHuman','false')<>'true' AND (s.last_error LIKE 'Full newsroom report needs%' OR s.last_error LIKE 'Related sources contain conflicting%' OR s.last_error LIKE 'The caption reached the local output limit%') AND EXISTS(SELECT 1 FROM creator.tasks t WHERE t.post_id=s.id AND t.input?'pipeline') AND NOT EXISTS(SELECT 1 FROM creator.tasks t WHERE t.post_id=s.id AND t.status IN ('queued','running')) AND NOT EXISTS(SELECT 1 FROM creator.publication_deliveries d WHERE d.post_id=s.id AND d.status IN ('running','unknown','confirmed','published')) FOR UPDATE",[page.workspace_id,page.id])).rows;
 for(const post of posts){const facts=evidenceLedger(post),conflicts=evidenceConflicts(facts);
 if(preflightContent(post,[],page.creative_policy).highAlert||conflicts.length){held.push({id:post.id,conflictPairs:conflicts.length});continue;}
 selected.push(post);
 }
 }
 if(apply&&selected.length){await mkdir(new URL('../.codex/backups/',import.meta.url),{recursive:true});await writeFile(new URL('../.codex/backups/newsroom-briefs-'+Date.now()+'.json',import.meta.url),JSON.stringify(selected,null,2),{mode:0o600});
 for(const post of selected){await db.query("UPDATE creator.posts SET status='draft',seo=(seo-'bundleDraft'-'reportEvidence')||'{\"rebuildReport\":true}'::jsonb,last_error='Waiting for fresh full-source research and brief-report review',approved_version=NULL,version=version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2",[post.workspace_id,post.id]);await audit(db,post.workspace_id,null,'newsroom.brief-requeued','post',post.id);}
 }
 let woken=0;if(apply&&process.argv.includes('--wake-waiting')&&pages.length)woken=(await db.query("UPDATE creator.tasks SET not_before=now(),phase='Rechecking newsroom rescue after queue coverage fix' WHERE page_id=ANY($1::uuid[]) AND kind='generate' AND status='queued' AND phase LIKE 'Queue is healthy.%'",[pages.map(p=>p.id)])).rowCount;
 return {apply,requeued:selected.length,woken,held,sourceWords:selected.map(p=>({id:p.id,words:newsWords(evidenceLedger(p).map(f=>f.text).join(' '))}))};
},{owner:true}),null,2));}finally{await closeDatabase();}
