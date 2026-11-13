BEGIN;
-- Add validation only; existing profiles retain their current workflow.
ALTER TABLE creator.pages ADD CONSTRAINT pages_profile_content_workflow_check CHECK(NOT profile_config ? 'content_workflow' OR (jsonb_typeof(profile_config->'content_workflow')='string' AND profile_config->>'content_workflow' IN ('TEXT','PHOTO_CAPTION','VIDEO_REELS')));
INSERT INTO creator.migrations(name) VALUES('019-content-workflow.sql');
COMMIT;
