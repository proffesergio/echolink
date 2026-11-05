BEGIN;
ALTER TABLE creator.posts ADD COLUMN archived_at timestamptz,ADD COLUMN deleted_at timestamptz,ADD COLUMN planned_at timestamptz;
UPDATE creator.pages SET window_start='00:00',window_end='00:00';
CREATE INDEX posts_calendar ON creator.posts(workspace_id,page_id,planned_at) WHERE deleted_at IS NULL AND archived_at IS NULL;
ALTER TABLE creator.automation_rules ADD COLUMN daily_target integer NOT NULL DEFAULT 20 CHECK(daily_target BETWEEN 1 AND 200),ADD COLUMN backlog_limit integer NOT NULL DEFAULT 20 CHECK(backlog_limit BETWEEN 1 AND 200),ADD COLUMN batch_size integer NOT NULL DEFAULT 2 CHECK(batch_size BETWEEN 1 AND 10),ADD COLUMN auto_schedule boolean NOT NULL DEFAULT true,ADD COLUMN last_message text;
UPDATE creator.automation_rules r SET daily_target=p.daily_cap FROM creator.pages p WHERE p.id=r.page_id AND p.daily_cap>0;
UPDATE creator.automation_rules SET interval_minutes=60 WHERE interval_minutes=120;
CREATE TABLE creator.page_connections(workspace_id uuid NOT NULL,page_id uuid NOT NULL,connection_id uuid NOT NULL,
 PRIMARY KEY(page_id,connection_id),FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id),FOREIGN KEY(workspace_id,connection_id) REFERENCES creator.connections(workspace_id,id));
ALTER TABLE creator.page_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.page_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_rows ON creator.page_connections USING(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true') WITH CHECK(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true');
INSERT INTO creator.page_connections(workspace_id,page_id,connection_id)
 SELECT p.workspace_id,p.id,c.id FROM creator.pages p CROSS JOIN LATERAL unnest(ARRAY[p.facebook_connection_id,p.text_connection_id,p.image_connection_id]) c(id) WHERE c.id IS NOT NULL
 ON CONFLICT DO NOTHING;
INSERT INTO creator.platform_settings(key,value) VALUES('globalConnections','{"n8nEnabled":false,"n8nVisibleToClients":false}') ON CONFLICT DO NOTHING;
-- Preserve imported history for audit/deduplication, without counting thousands
-- of old unsent articles as newly generated drafts or feeding them to automation.
UPDATE creator.posts SET archived_at=now() WHERE status='draft' AND seo ? 'legacyStatus';
ALTER TABLE creator.websites DROP CONSTRAINT websites_connector_check;
ALTER TABLE creator.websites ADD CONSTRAINT websites_connector_check CHECK(connector IN ('wordpress','shopify','woocommerce','json_catalog','public_product','webhook','nobleseek_db','fabrything_db'));
INSERT INTO creator.migrations(name) VALUES('006-page-planner.sql');
COMMIT;
