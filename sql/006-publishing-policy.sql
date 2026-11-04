CREATE TABLE IF NOT EXISTS echolink.facebook_delivery (
  page_id text PRIMARY KEY,
  cooldown_until timestamptz,
  paused_reason text,
  last_code integer,
  last_request_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS articles_schedule_due ON echolink.articles(page_id,scheduled_at)
  WHERE status='Approved';
