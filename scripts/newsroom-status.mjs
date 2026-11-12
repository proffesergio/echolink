import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
try {console.log(JSON.stringify(await transaction(null,async db=>({
 running:(await db.query("SELECT id,post_id,kind,phase,started_at,lease_until FROM creator.tasks WHERE status='running'")).rows,
 activeReceipts:(await db.query("SELECT d.destination,d.status,d.phase FROM creator.publication_deliveries d WHERE EXISTS(SELECT 1 FROM creator.tasks t WHERE t.post_id=d.post_id AND t.status='running')")).rows,
 databaseWaits:(await db.query("SELECT pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers,now()-query_start AS query_age FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state<>'idle'")).rows,
 pages:(await db.query("SELECT p.id,p.name,p.active,p.require_review,p.website_publishing,p.creative_policy->'editorial' AS editorial,r.enabled,r.auto_publish,r.auto_schedule,r.last_message FROM creator.pages p LEFT JOIN creator.automation_rules r ON r.page_id=p.id WHERE p.kind='news'")).rows,
 tasks:(await db.query("SELECT t.id,t.post_id,t.kind,t.status,t.phase,t.started_at,t.last_error FROM creator.tasks t JOIN creator.pages p ON p.id=t.page_id WHERE p.kind='news' AND t.status IN ('queued','running') ORDER BY t.created_at LIMIT 15")).rows,
 posts:(await db.query("SELECT s.id,s.status,s.last_error,length(s.body) AS source_chars,s.website_url IS NOT NULL AS website_confirmed,s.seo->'editorialWarnings' AS warnings,s.seo->'article'->'wordCount' AS words,(SELECT jsonb_agg(jsonb_build_object('extraction',e->>'extraction','chars',length(e->>'text'))) FROM jsonb_array_elements(COALESCE(s.seo->'reportEvidence'->'sources','[]'::jsonb)) e) AS extraction FROM creator.posts s JOIN creator.pages p ON p.id=s.page_id WHERE p.kind='news' AND s.deleted_at IS NULL AND s.archived_at IS NULL ORDER BY s.updated_at DESC LIMIT 12")).rows
}),{owner:true}),null,2));}finally{await closeDatabase();}
