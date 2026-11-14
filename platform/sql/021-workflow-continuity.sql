BEGIN;
ALTER TABLE creator.automation_rules ADD COLUMN catalog_checked_at timestamptz,
 ADD COLUMN catalog_refresh_after timestamptz;

-- Explicit retries show preparation while their prior errors remain visible.
-- Terminal and ambiguous delivery states always retain their meaning.
CREATE OR REPLACE FUNCTION creator.classify_content(p creator.posts) RETURNS creator.content_status LANGUAGE sql STABLE SET search_path=pg_catalog,creator AS $$
 SELECT CASE
 WHEN p.status='published' THEN 'PUBLISHED'
 WHEN p.status IN ('draft','review','approved','failed') AND EXISTS(
  SELECT 1 FROM creator.tasks t WHERE t.workspace_id=p.workspace_id AND t.post_id=p.id
   AND t.kind IN ('generate','write_article','creative','render_reel') AND t.status IN ('queued','running')
 ) THEN 'PREPARING'
 WHEN p.status='failed' THEN 'FAILED'
 WHEN p.last_error IS NOT NULL OR p.status IN ('unknown','ready_manual')
   OR p.seo->'safety'->>'requiresHuman'='true'
   OR jsonb_array_length(CASE WHEN jsonb_typeof(p.seo->'editorialWarnings')='array' THEN p.seo->'editorialWarnings' ELSE '[]'::jsonb END)>0 THEN 'NEED_ATTENTION'
 WHEN p.status IN ('scheduled','publishing') THEN 'SCHEDULED'
 WHEN p.status='review' THEN 'NEED_ATTENTION'
 WHEN p.status='approved' THEN 'APPROVED'
 ELSE 'DRAFT' END::creator.content_status
$$;
UPDATE creator.posts p SET content_status=creator.classify_content(p) WHERE content_status IS DISTINCT FROM creator.classify_content(p);
INSERT INTO creator.migrations(name) VALUES('021-workflow-continuity.sql');
COMMIT;
