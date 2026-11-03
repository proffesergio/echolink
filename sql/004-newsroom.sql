ALTER TABLE echolink.articles
  ADD COLUMN IF NOT EXISTS source_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS publisher text,
  ADD COLUMN IF NOT EXISTS selection_score double precision,
  ADD COLUMN IF NOT EXISTS selection_reason text,
  ADD COLUMN IF NOT EXISTS analysis text,
  ADD COLUMN IF NOT EXISTS image_prompt text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
CREATE INDEX IF NOT EXISTS newsroom_today ON echolink.articles(page_id,source_published_at,status);
CREATE TABLE IF NOT EXISTS echolink.job_runs (
  id uuid PRIMARY KEY, job text NOT NULL, trigger_source text NOT NULL,
  status text NOT NULL DEFAULT 'Running', started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz, result jsonb, error text
);
CREATE INDEX IF NOT EXISTS job_run_history ON echolink.job_runs(started_at DESC);
CREATE TABLE IF NOT EXISTS echolink.sheet_sync (
  article_id uuid PRIMARY KEY REFERENCES echolink.articles(id) ON DELETE CASCADE,
  version timestamptz NOT NULL, synced_at timestamptz NOT NULL DEFAULT now()
);
