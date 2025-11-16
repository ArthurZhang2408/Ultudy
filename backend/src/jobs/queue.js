/**
 * Job Queue Infrastructure
 *
 * This module creates and manages Bull job queues for async operations.
 * Uses Redis for job persistence and state management.
 */

import Queue from 'bull';

// Redis connection configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Check if we should disable queues (for CI/testing without Redis)
const DISABLE_QUEUES = process.env.DISABLE_QUEUES === 'true' || process.env.CI === 'true';

let uploadQueue;
let lessonQueue;

if (DISABLE_QUEUES) {
  console.log('[Queue] Queues disabled (CI/test mode)');

  // Create mock queues for CI/testing
  const createMockQueue = (name) => ({
    name,
    add: async () => ({ id: 'mock-job-id' }),
    process: () => {},
    on: () => {},
    close: async () => {},
    clean: async () => {}
  });

  uploadQueue = createMockQueue('upload-processing');
  lessonQueue = createMockQueue('lesson-generation');
} else {
  // Create separate queues for different job types
  uploadQueue = new Queue('upload-processing', REDIS_URL, {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: false, // Keep completed jobs for status checking
      removeOnFail: false // Keep failed jobs for debugging
    }
  });

  lessonQueue = new Queue('lesson-generation', REDIS_URL, {
    defaultJobOptions: {
      attempts: 2, // Fewer retries for LLM calls (expensive)
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: false,
      removeOnFail: false
    }
  });
}

export { uploadQueue, lessonQueue };

// Only set up event handlers and cleanup for real queues (not in CI/test mode)
if (!DISABLE_QUEUES) {
  // Job event handlers for logging
  uploadQueue.on('error', (error) => {
    console.error('[uploadQueue] Queue error:', error);
  });

  uploadQueue.on('failed', (job, error) => {
    console.error(`[uploadQueue] Job ${job.id} failed:`, error);
  });

  uploadQueue.on('completed', (job) => {
    console.log(`[uploadQueue] Job ${job.id} completed`);
  });

  lessonQueue.on('error', (error) => {
    console.error('[lessonQueue] Queue error:', error);
  });

  lessonQueue.on('failed', (job, error) => {
    console.error(`[lessonQueue] Job ${job.id} failed:`, error);
  });

  lessonQueue.on('completed', (job) => {
    console.log(`[lessonQueue] Job ${job.id} completed`);
  });

  // Cleanup old completed/failed jobs periodically (every hour)
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  const JOB_RETENTION_TIME = 24 * 60 * 60 * 1000; // 24 hours

  setInterval(async () => {
    try {
      await uploadQueue.clean(JOB_RETENTION_TIME, 'completed');
      await uploadQueue.clean(JOB_RETENTION_TIME, 'failed');
      await lessonQueue.clean(JOB_RETENTION_TIME, 'completed');
      await lessonQueue.clean(JOB_RETENTION_TIME, 'failed');
      console.log('[Queue Cleanup] Old jobs cleaned');
    } catch (error) {
      console.error('[Queue Cleanup] Error:', error);
    }
  }, CLEANUP_INTERVAL);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Queue] SIGTERM received, closing queues...');
    await Promise.all([
      uploadQueue.close(),
      lessonQueue.close()
    ]);
    console.log('[Queue] Queues closed');
  });
}

export default {
  uploadQueue,
  lessonQueue
};
