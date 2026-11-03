CREATE TABLE IF NOT EXISTS echolink.job_schedule (
  job text PRIMARY KEY,
  next_due timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  last_started timestamptz,
  last_success timestamptz,
  last_error text,
  last_result jsonb
);
