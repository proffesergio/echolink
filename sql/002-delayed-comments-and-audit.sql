CREATE TABLE IF NOT EXISTS echolink.source_comments (
  article_id uuid PRIMARY KEY REFERENCES echolink.articles(id),
  page_id text NOT NULL, fb_post_id text NOT NULL, message text NOT NULL,
  due_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'Queued'
    CHECK(status IN ('Queued','Sending','Sent','Unknown','Failed')),
  remote_id text, last_error text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS source_comments_due ON echolink.source_comments(status,due_at);
CREATE TABLE IF NOT EXISTS echolink.ingestion_events (
  id uuid PRIMARY KEY, event_key text NOT NULL UNIQUE, page_id text NOT NULL,
  title text NOT NULL, source_url text NOT NULL, status text NOT NULL,
  detail text NOT NULL, occurrences integer NOT NULL DEFAULT 1,
  airtable_id text, dirty boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
