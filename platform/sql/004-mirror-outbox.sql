BEGIN;
CREATE TABLE creator.page_mirrors(workspace_id uuid NOT NULL,page_id uuid NOT NULL,connection_id uuid NOT NULL,enabled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(page_id,connection_id),FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id),FOREIGN KEY(workspace_id,connection_id) REFERENCES creator.connections(workspace_id,id));
CREATE TABLE creator.mirror_outbox(workspace_id uuid NOT NULL,post_id uuid NOT NULL,connection_id uuid NOT NULL,version timestamptz NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),last_error text,
 PRIMARY KEY(post_id,connection_id),FOREIGN KEY(workspace_id,post_id) REFERENCES creator.posts(workspace_id,id),FOREIGN KEY(workspace_id,connection_id) REFERENCES creator.connections(workspace_id,id));
CREATE FUNCTION creator.queue_mirrors() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO creator.mirror_outbox(workspace_id,post_id,connection_id,version)
 SELECT NEW.workspace_id,NEW.id,m.connection_id,NEW.updated_at FROM creator.page_mirrors m WHERE m.workspace_id=NEW.workspace_id AND m.page_id=NEW.page_id AND m.enabled
 ON CONFLICT(post_id,connection_id) DO UPDATE SET version=EXCLUDED.version,status='pending',attempts=0,next_attempt_at=now(),last_error=NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER post_mirror_outbox AFTER INSERT OR UPDATE ON creator.posts FOR EACH ROW EXECUTE FUNCTION creator.queue_mirrors();
DO $$ DECLARE name text; BEGIN FOREACH name IN ARRAY ARRAY['page_mirrors','mirror_outbox'] LOOP
 EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',name);EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',name);
 EXECUTE format('CREATE POLICY tenant_rows ON creator.%I USING(workspace_id::text=current_setting(''creator.workspace_id'',true) OR current_setting(''creator.super_admin'',true)=''true'') WITH CHECK(workspace_id::text=current_setting(''creator.workspace_id'',true) OR current_setting(''creator.super_admin'',true)=''true'')',name);
END LOOP; END $$;
INSERT INTO creator.migrations(name) VALUES('004-mirror-outbox.sql');
COMMIT;
