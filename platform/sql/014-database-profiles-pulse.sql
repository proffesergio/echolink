BEGIN;
CREATE TABLE creator.database_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,provider text NOT NULL CHECK(provider IN ('local','neon','aiven','postgres')),
 purpose text NOT NULL DEFAULT 'standby' CHECK(purpose IN ('standby','primary_candidate','dedicated_candidate')),
 secret_cipher text NOT NULL,transport text NOT NULL DEFAULT 'tcp' CHECK(transport IN ('tcp','websocket')),
 max_connections integer NOT NULL DEFAULT 2 CHECK(max_connections BETWEEN 1 AND 6),
 expires_at timestamptz,status text NOT NULL DEFAULT 'configured',last_test_at timestamptz,last_test_result jsonb NOT NULL DEFAULT '{}',
 environment_key text UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE creator.workspace_database_targets(
 workspace_id uuid PRIMARY KEY REFERENCES creator.workspaces(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES creator.database_profiles(id),
 mode text NOT NULL CHECK(mode IN ('standby','dedicated_candidate')),
 state text NOT NULL DEFAULT 'awaiting_snapshot' CHECK(state IN ('awaiting_snapshot','verified_snapshot','requires_reconciliation')),
 updated_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['database_profiles','workspace_database_targets'] LOOP
 EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY owner_database_management ON creator.%I USING(current_setting(''creator.super_admin'',true)=''true'') WITH CHECK(current_setting(''creator.super_admin'',true)=''true'')',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON creator.%I TO creator_runtime',t);
END LOOP; END $$;
CREATE TABLE creator.workspace_revisions(workspace_id uuid PRIMARY KEY REFERENCES creator.workspaces(id) ON DELETE CASCADE,revision bigint NOT NULL DEFAULT 0);
ALTER TABLE creator.workspace_revisions ENABLE ROW LEVEL SECURITY;ALTER TABLE creator.workspace_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_revision ON creator.workspace_revisions USING(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true') WITH CHECK(workspace_id::text=current_setting('creator.workspace_id',true) OR current_setting('creator.super_admin',true)='true');
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.workspace_revisions TO creator_runtime;
CREATE FUNCTION creator.bump_workspace_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,creator AS $$
DECLARE w uuid;BEGIN
 IF TG_OP='DELETE' THEN w=OLD.workspace_id;ELSE w=NEW.workspace_id;END IF;
 -- Cascading workspace deletion must not recreate a deleted revision row.
 IF EXISTS(SELECT 1 FROM creator.workspaces WHERE id=w) THEN
  INSERT INTO creator.workspace_revisions(workspace_id,revision) VALUES(w,1) ON CONFLICT(workspace_id) DO UPDATE SET revision=creator.workspace_revisions.revision+1;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['pages','connections','websites','feeds','products','posts','campaigns','ad_drafts','payments','automation_rules','social_destinations','social_deliveries','publication_deliveries','link_comments','page_branding','insight_snapshots','analytics_reports','page_connections','page_mirrors','mirror_outbox','subscriptions'] LOOP
 EXECUTE format('CREATE TRIGGER content_revision AFTER INSERT OR UPDATE OR DELETE ON creator.%I FOR EACH ROW EXECUTE FUNCTION creator.bump_workspace_revision()',t);
END LOOP; END $$;
INSERT INTO creator.migrations(name) VALUES('014-database-profiles-pulse.sql');
COMMIT;
