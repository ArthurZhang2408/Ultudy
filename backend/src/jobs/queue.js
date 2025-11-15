/**
 * Job Queue Infrastructure
 *
 * This module creates and manages Bull job queues for async operations.
 * Uses Redis for job persistence and state management.
 */

import Queue from 'bull';

// Redis connection configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Create separate queues for different job types
export const uploadQueue = new Queue('upload-processing', REDIS_URL, {
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

export const lessonQueue = new Queue('lesson-generation', REDIS_URL, {
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

export default {
  uploadQueue,
  lessonQueue
};
