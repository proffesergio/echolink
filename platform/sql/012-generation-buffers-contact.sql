BEGIN;
ALTER TABLE creator.automation_rules
 ADD COLUMN generation_mode text NOT NULL DEFAULT 'interval' CHECK(generation_mode IN ('interval','buffered')),
 ADD COLUMN buffer_hours integer NOT NULL DEFAULT 4 CHECK(buffer_hours BETWEEN 1 AND 24),
 ADD COLUMN refill_minutes integer NOT NULL DEFAULT 60 CHECK(refill_minutes BETWEEN 5 AND 720),
 ADD COLUMN refill_until timestamptz,
 ADD CONSTRAINT buffer_refill_before_end CHECK(refill_minutes<buffer_hours*60);
CREATE TABLE creator.contact_inquiries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,company text NOT NULL DEFAULT '',
 topic text NOT NULL,message text NOT NULL,payload_hash text NOT NULL,status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','closed')),
 notified_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX contact_recent ON creator.contact_inquiries(created_at DESC);
CREATE INDEX contact_email ON creator.contact_inquiries(lower(email),created_at DESC);
ALTER TABLE creator.contact_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.contact_inquiries FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_contacts ON creator.contact_inquiries
 USING(current_setting('creator.super_admin',true)='true')
 WITH CHECK(current_setting('creator.super_admin',true)='true');
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.contact_inquiries TO creator_runtime;
INSERT INTO creator.migrations(name) VALUES('012-generation-buffers-contact.sql');
COMMIT;
