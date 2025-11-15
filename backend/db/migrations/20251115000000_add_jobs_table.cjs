/**
 * Migration: Add jobs table for tracking async operations
 * Created: 2025-11-15
 *
 * This migration creates a jobs table to track the status of async operations like:
 * - PDF upload and processing
 * - Lesson generation
 */

exports.up = async (pgm) => {
  // Create jobs table
  pgm.createTable('jobs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    owner_id: {
      type: 'text',
      notNull: true
    },
    type: {
      type: 'text',
      notNull: true,
      comment: 'Job type: upload_pdf, generate_lesson, generate_sections'
    },
    status: {
      type: 'text',
      notNull: true,
      default: 'queued',
      comment: 'Job status: queued, processing, completed, failed'
    },
    progress: {
      type: 'integer',
      default: 0,
      comment: 'Progress percentage (0-100)'
    },
    data: {
      type: 'jsonb',
      comment: 'Job input data (document_id, section_id, etc.)'
    },
    result: {
      type: 'jsonb',
      comment: 'Job result data'
    },
    error: {
      type: 'text',
      comment: 'Error message if job failed'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    },
    started_at: {
      type: 'timestamp'
    },
    completed_at: {
      type: 'timestamp'
    }
  });

  // Add indexes for efficient querying
  pgm.createIndex('jobs', 'owner_id');
  pgm.createIndex('jobs', 'type');
  pgm.createIndex('jobs', 'status');
  pgm.createIndex('jobs', ['owner_id', 'status']);
  pgm.createIndex('jobs', ['owner_id', 'type', 'status']);
  pgm.createIndex('jobs', 'created_at');

  // Enable RLS
  pgm.sql('ALTER TABLE jobs ENABLE ROW LEVEL SECURITY');

  // RLS policy: Users can only see their own jobs
  pgm.sql(`
    CREATE POLICY jobs_isolation_policy ON jobs
    USING (owner_id = current_setting('app.current_user_id', TRUE))
  `);
};

exports.down = async (pgm) => {
  pgm.dropTable('jobs');
};
