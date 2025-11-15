/**
 * Admin routes for database management
 */

import express from 'express';

export default function createAdminRouter(options = {}) {
  const router = express.Router();
  const { pool, tenantHelpers } = options;

  if (!pool) {
    throw new Error('Database pool is required for admin router');
  }

  /**
   * POST /admin/create-jobs-table
   * Manually create the jobs table (workaround for migration issues)
   */
  router.post('/create-jobs-table', async (req, res) => {
    try {
      console.log('[Admin] Creating jobs table...');

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

      await pool.query(SQL);

      console.log('[Admin] ✅ Jobs table created successfully!');

      // Verify table exists
      const { rows } = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'jobs'
        ORDER BY ordinal_position;
      `);

      console.log('[Admin] Jobs table columns:', rows);

      res.json({
        success: true,
        message: 'Jobs table created successfully',
        columns: rows
      });
    } catch (error) {
      console.error('[Admin] Error creating jobs table:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /admin/check-jobs-table
   * Check if jobs table exists and show its structure
   */
  router.get('/check-jobs-table', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'jobs'
        ORDER BY ordinal_position;
      `);

      if (rows.length === 0) {
        return res.json({
          exists: false,
          message: 'Jobs table does not exist'
        });
      }

      res.json({
        exists: true,
        columns: rows
      });
    } catch (error) {
      console.error('[Admin] Error checking jobs table:', error);
      res.status(500).json({
        error: error.message
      });
    }
  });

  return router;
}
