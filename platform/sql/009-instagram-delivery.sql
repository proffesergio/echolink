BEGIN;
CREATE TABLE creator.social_destinations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),page_id uuid NOT NULL,platform text NOT NULL CHECK(platform='instagram'),
 remote_id text NOT NULL CHECK(remote_id~'^[0-9]+$'),username text NOT NULL,enabled boolean NOT NULL DEFAULT false,verified_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id),UNIQUE(workspace_id,page_id,platform),UNIQUE(workspace_id,id));
CREATE UNIQUE INDEX instagram_account_workspace ON creator.social_destinations(remote_id) WHERE enabled;
CREATE TABLE creator.social_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),page_id uuid NOT NULL,post_id uuid NOT NULL,destination_id uuid NOT NULL,
 platform text NOT NULL CHECK(platform='instagram'),status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','preparing','publishing','published','failed','unknown','skipped')),
 container_id text,remote_id text,permalink text,last_error text,published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,post_id,platform),FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id),FOREIGN KEY(workspace_id,post_id) REFERENCES creator.posts(workspace_id,id),
 FOREIGN KEY(workspace_id,destination_id) REFERENCES creator.social_destinations(workspace_id,id));
ALTER TABLE creator.social_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.social_destinations FORCE ROW LEVEL SECURITY;
ALTER TABLE creator.social_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.social_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_rows ON creator.social_destinations USING(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true') WITH CHECK(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true');
CREATE POLICY tenant_rows ON creator.social_deliveries USING(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true') WITH CHECK(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true');
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.social_destinations,creator.social_deliveries TO creator_runtime;
INSERT INTO creator.migrations(name) VALUES('009-instagram-delivery.sql');
COMMIT;
