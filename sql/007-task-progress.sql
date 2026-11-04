ALTER TABLE echolink.job_runs
  ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'Starting',
  ADD COLUMN IF NOT EXISTS progress_detail jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS events jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz;
UPDATE echolink.job_runs SET heartbeat_at=COALESCE(finished_at,started_at) WHERE heartbeat_at IS NULL;
ALTER TABLE echolink.job_runs ALTER COLUMN heartbeat_at SET DEFAULT now();
ALTER TABLE echolink.job_runs ALTER COLUMN heartbeat_at SET NOT NULL;
UPDATE echolink.job_runs SET progress=100,phase='Completed' WHERE status='Succeeded';
UPDATE echolink.job_runs SET phase='Stopped — inspect prior results' WHERE status NOT IN ('Running','Succeeded');
