BEGIN;
CREATE TYPE creator.content_status AS ENUM ('DRAFT','PREPARING','NEED_ATTENTION','APPROVED','SCHEDULED','PUBLISHED','FAILED');
ALTER TABLE creator.posts ADD COLUMN content_status creator.content_status NOT NULL DEFAULT 'DRAFT';
CREATE INDEX tasks_preparation_scope ON creator.tasks(workspace_id,post_id) WHERE status IN ('queued','running') AND kind IN ('generate','write_article','creative','render_reel');
CREATE FUNCTION creator.classify_content(p creator.posts) RETURNS creator.content_status LANGUAGE sql STABLE SET search_path=pg_catalog,creator AS $$
 SELECT CASE
 WHEN p.status='published' THEN 'PUBLISHED'
 WHEN p.status='failed' THEN 'FAILED'
 WHEN p.last_error IS NOT NULL OR p.status IN ('unknown','ready_manual')
   OR p.seo->'safety'->>'requiresHuman'='true'
   OR jsonb_array_length(CASE WHEN jsonb_typeof(p.seo->'editorialWarnings')='array' THEN p.seo->'editorialWarnings' ELSE '[]'::jsonb END)>0 THEN 'NEED_ATTENTION'
 WHEN p.status IN ('scheduled','publishing') THEN 'SCHEDULED'
 WHEN EXISTS(SELECT 1 FROM creator.tasks t WHERE t.workspace_id=p.workspace_id AND t.post_id=p.id AND t.kind IN ('generate','write_article','creative','render_reel') AND t.status IN ('queued','running')) THEN 'PREPARING'
 WHEN p.status='review' THEN 'NEED_ATTENTION'
 WHEN p.status='approved' THEN 'APPROVED'
 ELSE 'DRAFT' END::creator.content_status
$$;
CREATE FUNCTION creator.set_content_status() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,creator AS $$
BEGIN NEW.content_status=creator.classify_content(NEW);RETURN NEW;END $$;
CREATE TRIGGER canonical_content_status BEFORE INSERT OR UPDATE ON creator.posts FOR EACH ROW EXECUTE FUNCTION creator.set_content_status();
CREATE FUNCTION creator.refresh_task_content_status() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,creator AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.post_id IS NOT NULL THEN
  UPDATE creator.posts p SET content_status=creator.classify_content(p),updated_at=now() WHERE workspace_id=OLD.workspace_id AND id=OLD.post_id AND content_status IS DISTINCT FROM creator.classify_content(p);
 END IF;
 IF TG_OP<>'DELETE' AND NEW.post_id IS NOT NULL THEN
  UPDATE creator.posts p SET content_status=creator.classify_content(p),updated_at=now() WHERE workspace_id=NEW.workspace_id AND id=NEW.post_id AND content_status IS DISTINCT FROM creator.classify_content(p);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER task_content_status AFTER INSERT OR UPDATE OF status,post_id,kind,workspace_id OR DELETE ON creator.tasks FOR EACH ROW EXECUTE FUNCTION creator.refresh_task_content_status();
CREATE INDEX posts_content_scope ON creator.posts(workspace_id,page_id,content_status,updated_at DESC,id DESC) WHERE archived_at IS NULL AND deleted_at IS NULL;
-- Backfill only classification; never reset delivery status, tokens or receipts.
UPDATE creator.posts p SET content_status=creator.classify_content(p);
INSERT INTO creator.migrations(name) VALUES('017-content-status.sql');
COMMIT;
