BEGIN;
ALTER TABLE creator.posts DROP CONSTRAINT posts_status_check;
ALTER TABLE creator.posts ADD CONSTRAINT posts_status_check CHECK(status IN ('draft','review','approved','scheduled','publishing','published','failed','unknown','rejected','ready_manual'));
ALTER TABLE creator.posts ADD COLUMN manual_url text;
INSERT INTO creator.migrations(name) VALUES('008-profile-handoff.sql');
COMMIT;
