/**
 * Job Queue Infrastructure
 *
 * This module creates and manages Bull job queues for async operations.
 * Uses Redis for job persistence and state management.
 *
 * IMPORTANT: Uses shared Redis connection to avoid "max clients reached" error.
 * Bull creates 3 connections per queue (client, subscriber, bclient).
 * By sharing the connection config, we reduce total connections.
 */

import Queue from 'bull';

// Redis connection configuration
const REDIS_URL = process.env.REDIS_URL;

// Check if we should disable queues (for CI/testing without Redis, or no Redis configured)
const DISABLE_QUEUES = process.env.DISABLE_QUEUES === 'true' || process.env.CI === 'true' || !REDIS_URL;

// Shared Redis connection settings to reduce connection count
const createRedisOptions = () => {
  if (!REDIS_URL) return null;

  // Parse Redis URL  
  const url = new URL(REDIS_URL);

  return {
    port: parseInt(url.port) || 6379,
    host: url.hostname,
    password: url.password,
    db: 0,
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    enableReadyCheck: false, // Reduces connections
    lazyConnect: false
  };
};

let uploadQueue;
let lessonQueue;
let redisConnectionFailed = false;

if (DISABLE_QUEUES) {
  if (!REDIS_URL) {
    console.log('[Queue] Redis not configured - using mock queues (jobs process synchronously)');
    console.log('[Queue] To enable async processing, set REDIS_URL in .env');
  } else {
    console.log('[Queue] Queues disabled (CI/test mode)');
  }

  // Create mock queues for CI/testing that process jobs synchronously
  const createMockQueue = (name) => {
    let processor = null;

    return {
      name,
      add: async (data) => {
        const mockJob = {
          id: `mock-job-${Date.now()}-${Math.random()}`,
          data
        };

        // If a processor is registered, execute it immediately (synchronous processing in tests)
        if (processor) {
          try {
            await processor(mockJob);
          } catch (error) {
            console.error(`[MockQueue] ${name} job processing failed:`, error);
            throw error;
          }
        }

        return mockJob;
      },
      process: (concurrencyOrProcessor, maybeProcessor) => {
        // Support both forms: .process(fn) and .process(concurrency, fn)
        const processorFn = typeof concurrencyOrProcessor === 'function'
          ? concurrencyOrProcessor
          : maybeProcessor;

        // Allow calling process() multiple times in tests (just overwrites the processor)
        // Note: Mock queues ignore concurrency and always process synchronously
        processor = processorFn;
      },
      on: () => {},
      close: async () => {},
      clean: async () => {}
    };
  };

  uploadQueue = createMockQueue('upload-processing');
  lessonQueue = createMockQueue('lesson-generation');

  console.warn('[Queue] ⚠️  WARNING: Using MOCK QUEUES - jobs will process synchronously in HTTP requests!');
  console.warn('[Queue] ⚠️  This causes tier 1 processing because getUserTier happens before user tier is set!');
} else {
  console.log(`[Queue] ✅ Connecting to Redis at ${REDIS_URL.replace(/:[^:@]+@/, ':****@')}`);

  const redisOpts = createRedisOptions();

  // Create separate queues for different job types with shared connection config
  // Note: Bull still creates 3 connections per queue (client, subscriber, bclient)
  // The redisOpts are shared to use same config, reducing overhead slightly
  uploadQueue = new Queue('upload-processing', {
    redis: redisOpts,
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

  lessonQueue = new Queue('lesson-generation', {
    redis: redisOpts,
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

// Export queue type for debugging
export const isUsingMockQueues = DISABLE_QUEUES;
export const queueInfo = {
  type: DISABLE_QUEUES ? 'MOCK' : 'REDIS',
  redisConfigured: !!REDIS_URL,
  disableQueuesEnv: process.env.DISABLE_QUEUES,
  ciEnv: process.env.CI
};

export { uploadQueue, lessonQueue };

// Only set up event handlers and cleanup for real queues (not in CI/test mode)
if (!DISABLE_QUEUES) {
  let uploadErrorCount = 0;
  let lessonErrorCount = 0;
  const MAX_ERROR_LOGS = 5;

  // Job event handlers for logging
  uploadQueue.on('error', (error) => {
    uploadErrorCount++;
    if (uploadErrorCount <= MAX_ERROR_LOGS) {
      console.error('[uploadQueue] Queue error:', error);
      if (uploadErrorCount === MAX_ERROR_LOGS) {
        console.error('[uploadQueue] Redis connection errors detected. Further errors will be suppressed.');
        console.error('[uploadQueue] Please check your REDIS_URL or remove it from .env if Redis is not available.');
      }
    }
    redisConnectionFailed = true;
  });

  uploadQueue.on('failed', (job, error) => {
    console.error(`[uploadQueue] Job ${job.id} failed:`, error);
  });

  uploadQueue.on('completed', (job) => {
    console.log(`[uploadQueue] Job ${job.id} completed`);
  });

  lessonQueue.on('error', (error) => {
    lessonErrorCount++;
    if (lessonErrorCount <= MAX_ERROR_LOGS) {
      console.error('[lessonQueue] Queue error:', error);
      if (lessonErrorCount === MAX_ERROR_LOGS) {
        console.error('[lessonQueue] Redis connection errors detected. Further errors will be suppressed.');
        console.error('[lessonQueue] Please check your REDIS_URL or remove it from .env if Redis is not available.');
      }
    }
    redisConnectionFailed = true;
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
