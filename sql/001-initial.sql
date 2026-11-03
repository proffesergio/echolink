CREATE SCHEMA IF NOT EXISTS echolink;
CREATE TABLE IF NOT EXISTS echolink.configurations (
  kind text NOT NULL CHECK (kind IN ('page','feed')), id text NOT NULL,
  config jsonb NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,id)
);
CREATE TABLE IF NOT EXISTS echolink.articles (
  id uuid PRIMARY KEY, page_id text NOT NULL, url_hash text NOT NULL, title_hash text NOT NULL,
  title text NOT NULL, source_url text NOT NULL, body text NOT NULL, image_url text,
  caption text, caption_hash text, approval_hash text, vector jsonb, vector_model text,
  status text NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued','Pending Approval','Approved','Posted','Skipped (Duplicate)','Failed','Publishing','Publish Unknown','Dry Run','Rejected')),
  fb_post_id text, airtable_id text, notified_at timestamptz,
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text, dirty boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(page_id,url_hash), UNIQUE(page_id,title_hash)
);
CREATE INDEX IF NOT EXISTS queue_scan ON echolink.articles(status,next_attempt_at,created_at);
CREATE INDEX IF NOT EXISTS published_by_page ON echolink.articles(page_id,published_at);
CREATE TABLE IF NOT EXISTS echolink.publish_attempts (
  id uuid PRIMARY KEY, article_id uuid NOT NULL REFERENCES echolink.articles(id),
  started_at timestamptz NOT NULL DEFAULT now(), outcome text NOT NULL DEFAULT 'Unknown', remote_id text
);
CREATE TABLE IF NOT EXISTS echolink.analytics (
  article_id uuid PRIMARY KEY REFERENCES echolink.articles(id), metrics jsonb NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS echolink.service_probes (
  id uuid PRIMARY KEY, value text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
