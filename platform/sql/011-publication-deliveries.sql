BEGIN;
CREATE TABLE creator.publication_deliveries(
 workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),post_id uuid NOT NULL,page_id uuid NOT NULL,
 destination text NOT NULL CHECK(destination IN ('website','facebook')),status text NOT NULL CHECK(status IN ('pending','running','confirmed','failed','unknown','skipped')),
 phase text NOT NULL DEFAULT '',remote_id text,url text,last_error text,started_at timestamptz,confirmed_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,post_id,destination),FOREIGN KEY(workspace_id,post_id) REFERENCES creator.posts(workspace_id,id),FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id));
ALTER TABLE creator.publication_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.publication_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_rows ON creator.publication_deliveries USING(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true') WITH CHECK(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true');
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.publication_deliveries TO creator_runtime;
INSERT INTO creator.migrations(name) VALUES('011-publication-deliveries.sql');
COMMIT;
