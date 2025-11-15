/**
 * Migration: Add jobs table for async job queue
 *
 * This table tracks all async jobs (material upload, lesson generation, check-in evaluation)
 * Enables non-blocking operations with progress tracking and error handling
 */

exports.up = async (pgm) => {
  // Create job_status enum
  pgm.createType('job_status', ['pending', 'processing', 'completed', 'failed']);

  // Create job_type enum
  pgm.createType('job_type', ['material-upload', 'lesson-generation', 'check-in-evaluation']);

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
      type: 'job_type',
      notNull: true
    },
    status: {
      type: 'job_status',
      notNull: true,
      default: 'pending'
    },
    progress: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Progress percentage (0-100)'
    },
    progress_message: {
      type: 'text',
      comment: 'Human-readable progress message'
    },
    input_data: {
      type: 'jsonb',
      notNull: true,
      comment: 'Job input parameters'
    },
    result_data: {
      type: 'jsonb',
      comment: 'Job result on completion'
    },
    error_message: {
      type: 'text',
      comment: 'Error message if job failed'
    },
    error_stack: {
      type: 'text',
      comment: 'Error stack trace for debugging'
    },
    bull_job_id: {
      type: 'text',
      comment: 'Bull queue job ID for tracking'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()')
    },
    started_at: {
      type: 'timestamp',
      comment: 'When job processing started'
    },
    completed_at: {
      type: 'timestamp',
      comment: 'When job finished (success or failure)'
    }
  });

  // Create indexes for efficient queries
  pgm.createIndex('jobs', 'owner_id');
  pgm.createIndex('jobs', 'status');
  pgm.createIndex('jobs', 'type');
  pgm.createIndex('jobs', ['owner_id', 'created_at']);
  pgm.createIndex('jobs', 'bull_job_id');

  // Enable RLS
  pgm.sql('ALTER TABLE jobs ENABLE ROW LEVEL SECURITY');

  // RLS policy: Users can only see their own jobs
  pgm.createPolicy('jobs', 'jobs_owner_isolation', {
    command: 'ALL',
    check: 'owner_id = current_setting(\'app.current_user_id\', TRUE)',
    using: 'owner_id = current_setting(\'app.current_user_id\', TRUE)'
  });

  // Add comment
  pgm.sql(`
    COMMENT ON TABLE jobs IS 'Tracks async jobs for material upload, lesson generation, and evaluation';
  `);
};

exports.down = async (pgm) => {
  pgm.dropTable('jobs');
  pgm.dropType('job_type');
  pgm.dropType('job_status');
};
