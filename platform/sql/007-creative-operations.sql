BEGIN;
ALTER TABLE creator.pages ADD COLUMN destination_type text NOT NULL DEFAULT 'facebook_page' CHECK(destination_type IN ('facebook_page','facebook_profile'));
ALTER TABLE creator.pages ADD COLUMN profile_url text;
ALTER TABLE creator.pages ADD COLUMN creative_policy jsonb NOT NULL DEFAULT '{}';
CREATE TABLE creator.insight_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),page_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('meta','import')),records jsonb NOT NULL DEFAULT '[]',observed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id));
CREATE INDEX insight_page_latest ON creator.insight_snapshots(workspace_id,page_id,observed_at DESC);
ALTER TABLE creator.insight_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.insight_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_rows ON creator.insight_snapshots USING(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true') WITH CHECK(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true');
-- The public relay role can read only this non-secret routing record. It cannot
-- read tenant data or credentials. The bridge still requires its separate key.
CREATE TABLE creator.worker_routes(id text PRIMARY KEY CHECK(id='primary'),origin text NOT NULL CHECK(origin~'^https://[a-z0-9.-]+$'),heartbeat_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE creator.worker_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.worker_routes FORCE ROW LEVEL SECURITY;
CREATE POLICY operator_routes ON creator.worker_routes USING(current_setting('creator.super_admin',true)='true') WITH CHECK(current_setting('creator.super_admin',true)='true');
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.insight_snapshots,creator.worker_routes TO creator_runtime;
INSERT INTO creator.migrations(name) VALUES('007-creative-operations.sql');
COMMIT;
