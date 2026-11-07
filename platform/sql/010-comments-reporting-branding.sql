BEGIN;
CREATE TABLE creator.link_comments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),page_id uuid NOT NULL,post_id uuid NOT NULL,
 platform text NOT NULL CHECK(platform='facebook'),remote_post_id text NOT NULL,url text NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','publishing','published','failed','unknown','skipped')),
 due_at timestamptz NOT NULL,remote_id text,last_error text,published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,post_id,platform),FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id),FOREIGN KEY(workspace_id,post_id) REFERENCES creator.posts(workspace_id,id));
CREATE TABLE creator.analytics_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),page_id uuid NOT NULL,platform text NOT NULL CHECK(platform IN ('facebook','instagram')),
 report jsonb NOT NULL,observed_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id));
CREATE INDEX analytics_recent ON creator.analytics_reports(workspace_id,page_id,platform,observed_at DESC);
CREATE TABLE creator.page_branding(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),page_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('profile','cover')),
 prompt text NOT NULL DEFAULT '',headline text NOT NULL DEFAULT '',asset_id uuid,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','applying','applied','failed','unknown')),
 remote_photo_id text,last_error text,method text,created_at timestamptz NOT NULL DEFAULT now(),applied_at timestamptz,
 FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id),FOREIGN KEY(workspace_id,asset_id) REFERENCES creator.assets(workspace_id,id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['link_comments','analytics_reports','page_branding'] LOOP
 EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_rows ON creator.%I USING(workspace_id::text=current_setting(''creator.workspace_id'',true) OR current_setting(''creator.super_admin'',true)=''true'') WITH CHECK(workspace_id::text=current_setting(''creator.workspace_id'',true) OR current_setting(''creator.super_admin'',true)=''true'')',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON creator.%I TO creator_runtime',t);
END LOOP; END $$;
INSERT INTO creator.migrations(name) VALUES('010-comments-reporting-branding.sql');
COMMIT;
