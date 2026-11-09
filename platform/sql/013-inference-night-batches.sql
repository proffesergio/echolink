BEGIN;
ALTER TABLE creator.automation_rules
 DROP CONSTRAINT automation_rules_buffer_hours_check,
 ADD CONSTRAINT automation_rules_buffer_hours_check CHECK(buffer_hours BETWEEN 1 AND 2160),
 ADD COLUMN generation_window jsonb NOT NULL DEFAULT '{"enabled":false,"start":"22:00","end":"07:00","emergency_refill":true}'::jsonb;
INSERT INTO creator.migrations(name) VALUES('013-inference-night-batches.sql');
COMMIT;
