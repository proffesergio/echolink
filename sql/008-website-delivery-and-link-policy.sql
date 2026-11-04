ALTER TABLE echolink.articles
  ADD COLUMN IF NOT EXISTS website_post_id text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS website_status text CHECK (website_status IN ('Draft','Published','Failed','Unknown'));

ALTER TABLE echolink.source_comments DROP CONSTRAINT IF EXISTS source_comments_status_check;
ALTER TABLE echolink.source_comments ADD CONSTRAINT source_comments_status_check
  CHECK (status IN ('Queued','Sending','Sent','Unknown','Failed','Skipped'));
