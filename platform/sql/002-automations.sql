BEGIN;
CREATE TABLE creator.automation_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),page_id uuid NOT NULL,
 name text NOT NULL,enabled boolean NOT NULL DEFAULT false,interval_minutes integer NOT NULL DEFAULT 120 CHECK(interval_minutes BETWEEN 15 AND 10080),
 topic text NOT NULL DEFAULT '',make_creative boolean NOT NULL DEFAULT true,auto_publish boolean NOT NULL DEFAULT false,next_run_at timestamptz NOT NULL DEFAULT now(),last_run_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(page_id),FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id));
ALTER TABLE creator.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.automation_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_rows ON creator.automation_rules USING(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true') WITH CHECK(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true');
INSERT INTO creator.migrations(name) VALUES('002-automations.sql');
COMMIT;
