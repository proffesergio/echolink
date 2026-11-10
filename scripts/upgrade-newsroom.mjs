import '../platform/server/env.mjs';
import {transaction,closeDatabase,audit} from '../platform/server/db.mjs';
import {releasePublication} from '../platform/server/quotas.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const apply=process.argv.includes('--apply');
try{console.log(await transaction(null,async db=>{
 const posts=(await db.query("SELECT s.* FROM creator.posts s JOIN creator.pages p ON p.id=s.page_id JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND p.kind='news' AND p.creative_policy->>'contentFormat'='news_desk_v3' AND s.type='news' AND s.status IN ('draft','review','approved','scheduled','failed') AND s.website_url IS NULL AND s.deleted_at IS NULL AND s.archived_at IS NULL AND COALESCE(s.seo->'safety'->>'requiresHuman','false')<>'true' AND COALESCE(s.seo->'article'->>'generationVersion','')<>'newsroom-v4' AND EXISTS(SELECT 1 FROM creator.tasks t WHERE t.post_id=s.id AND t.input?'pipeline') AND NOT EXISTS(SELECT 1 FROM creator.tasks t WHERE t.post_id=s.id AND t.status='running') AND NOT EXISTS(SELECT 1 FROM creator.publication_deliveries d WHERE d.post_id=s.id AND d.status IN ('running','unknown','confirmed','published'))",[process.env.PLATFORM_OWNER_EMAIL.toLowerCase()])).rows;
 if(apply){await mkdir(new URL('../.codex/backups/',import.meta.url),{recursive:true});await writeFile(new URL('../.codex/backups/newsroom-v4-'+Date.now()+'.json',import.meta.url),JSON.stringify(posts,null,2),{mode:0o600});
  for(const post of posts){await db.query("UPDATE creator.tasks SET status='canceled',finished_at=now(),phase='Replaced by complete evidence-reviewed newsroom' WHERE post_id=$1 AND status='queued' AND kind IN ('generate','write_article','creative','publish','publish_instagram')",[post.id]);await releasePublication(db,post.workspace_id,post.id);
   await db.query("UPDATE creator.posts SET status='draft',caption='',seo=(seo-'article'-'bundleDraft'-'articleDraft')||'{\"rebuildReport\":true}'::jsonb,version=version+1,approved_version=NULL,scheduled_at=NULL,last_error='Queued for full source extraction and independent newsroom review; short copy will not publish',updated_at=now() WHERE id=$1",[post.id]);await audit(db,post.workspace_id,null,'newsroom.upgraded','post',post.id);
  }
 }
 return {apply,newsDraftsPrepared:posts.length,scope:'Owner news automation only; published articles, website receipts, sensitive reviews and commerce content preserved.'};
},{owner:true}));}finally{await closeDatabase();}
