/**
 * Job Queue Configuration
 *
 * Manages Bull queues for async operations:
 * - Material upload (PDF processing)
 * - Lesson generation (LLM-based)
 * - Check-in evaluation (LLM-based)
 */

import Queue from 'bull';
import dotenv from 'dotenv';

dotenv.config();

// Redis configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisConfig = {
  redis: REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000 // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600 // Keep failed jobs for 7 days
    }
  }
};

// Create queues for each job type
export const materialUploadQueue = new Queue('material-upload', redisConfig);
export const lessonGenerationQueue = new Queue('lesson-generation', redisConfig);
export const checkInEvaluationQueue = new Queue('check-in-evaluation', redisConfig);

// Queue health monitoring
export async function getQueueHealth() {
  const queues = {
    'material-upload': materialUploadQueue,
    'lesson-generation': lessonGenerationQueue,
    'check-in-evaluation': checkInEvaluationQueue
  };

  const health = {};

  for (const [name, queue] of Object.entries(queues)) {
    try {
      const counts = await queue.getJobCounts();
      health[name] = {
        ok: true,
        ...counts
      };
    } catch (error) {
      health[name] = {
        ok: false,
        error: error.message
      };
    }
  }

  return health;
}

// Graceful shutdown
export async function closeQueues() {
  await Promise.all([
    materialUploadQueue.close(),
    lessonGenerationQueue.close(),
    checkInEvaluationQueue.close()
  ]);
}

// Handle process shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing queues...');
  await closeQueues();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing queues...');
  await closeQueues();
  process.exit(0);
});
