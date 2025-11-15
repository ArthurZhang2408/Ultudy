-- Manual migration to create jobs table
-- Run this if the migration says "No migrations to run" but the table doesn't exist

-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  data JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS jobs_owner_id_idx ON jobs(owner_id);
CREATE INDEX IF NOT EXISTS jobs_type_idx ON jobs(type);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_owner_id_status_idx ON jobs(owner_id, status);
CREATE INDEX IF NOT EXISTS jobs_owner_id_type_status_idx ON jobs(owner_id, type, status);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs(created_at);

-- Enable RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS jobs_isolation_policy ON jobs;

-- Create RLS policy
CREATE POLICY jobs_isolation_policy ON jobs
  USING (owner_id = current_setting('app.current_user_id', TRUE));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO PUBLIC;
