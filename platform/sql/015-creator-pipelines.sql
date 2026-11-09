BEGIN;
ALTER TABLE creator.pages ADD COLUMN notification_connection_id uuid,
 ADD FOREIGN KEY(workspace_id,notification_connection_id) REFERENCES creator.connections(workspace_id,id);
ALTER TABLE creator.posts DROP CONSTRAINT posts_type_check;
ALTER TABLE creator.posts ADD CONSTRAINT posts_type_check CHECK(type IN ('news','blog','product_sale','quote','original','image','reel'));
ALTER TABLE creator.posts ADD COLUMN approval_state text NOT NULL DEFAULT 'DRAFT';
CREATE FUNCTION creator.sync_approval_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.approval_state=CASE WHEN NEW.status='published' THEN 'PUBLISHED'
 WHEN NEW.status IN ('scheduled','publishing') THEN 'QUEUED_FOR_PUBLISH'
 WHEN NEW.status='approved' THEN 'APPROVED'
 WHEN NEW.seo->'safety'->>'requiresHuman'='true' AND NEW.approved_version IS DISTINCT FROM NEW.version THEN 'HIGH_ALERT_MANUAL_REVIEW'
 WHEN NEW.status='review' THEN 'PENDING_APPROVAL' ELSE 'DRAFT' END;
 RETURN NEW;
END $$;
CREATE TRIGGER approval_state BEFORE INSERT OR UPDATE ON creator.posts FOR EACH ROW EXECUTE FUNCTION creator.sync_approval_state();
UPDATE creator.posts SET status=status;
ALTER TABLE creator.link_comments ADD COLUMN engagement jsonb NOT NULL DEFAULT '{}';
CREATE TABLE creator.approval_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,page_id uuid NOT NULL,post_id uuid NOT NULL,connection_id uuid NOT NULL,
 post_version integer NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','unknown','skipped')),
 remote_id text,last_error text,created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,
 UNIQUE(workspace_id,post_id,post_version,connection_id),
 FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id),
 FOREIGN KEY(workspace_id,post_id) REFERENCES creator.posts(workspace_id,id),
 FOREIGN KEY(workspace_id,connection_id) REFERENCES creator.connections(workspace_id,id));
ALTER TABLE creator.approval_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.approval_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_notifications ON creator.approval_notifications USING(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true') WITH CHECK(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true');
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.approval_notifications TO creator_runtime;
CREATE INDEX posts_published_headlines ON creator.posts(workspace_id,page_id,published_at DESC) INCLUDE(title) WHERE status='published';
CREATE TRIGGER content_revision AFTER INSERT OR UPDATE OR DELETE ON creator.approval_notifications FOR EACH ROW EXECUTE FUNCTION creator.bump_workspace_revision();
INSERT INTO creator.migrations(name) VALUES('015-creator-pipelines.sql');
COMMIT;
