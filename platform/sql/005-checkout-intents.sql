BEGIN;
CREATE TABLE creator.checkout_intents(
 workspace_id uuid PRIMARY KEY REFERENCES creator.workspaces(id),intent_id uuid NOT NULL UNIQUE,
 payload jsonb NOT NULL,session_id text,checkout_url text,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE creator.checkout_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.checkout_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_rows ON creator.checkout_intents
 USING(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true')
 WITH CHECK(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true');
INSERT INTO creator.migrations(name) VALUES('005-checkout-intents.sql');
COMMIT;
