/**
 * Manual script to create jobs table
 * Run with: node scripts/create-jobs-table.js
 */

import dotenv from 'dotenv';
import pool from '../src/db/index.js';

dotenv.config();

const SQL = `
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
`;

async function createJobsTable() {
  console.log('Creating jobs table...');

  try {
    await pool.query(SQL);
    console.log('✅ Jobs table created successfully!');

    // Verify table exists
    const { rows } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'jobs'
      ORDER BY ordinal_position;
    `);

    console.log('\n📋 Jobs table columns:');
    rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

  } catch (error) {
    console.error('❌ Error creating jobs table:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createJobsTable();
