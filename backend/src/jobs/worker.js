/**
 * Job Worker
 *
 * This module sets up job processors to handle queued jobs.
 * It should be started alongside the main server.
 */

import { uploadQueue, lessonQueue } from './queue.js';
import { processUploadJob } from './processors/upload.processor.js';
import { processLessonJob } from './processors/lesson.processor.js';
import { createJobTracker } from './tracking.js';
import createStudyService from '../study/service.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage');

// Concurrency settings - how many jobs to process in parallel per queue
// In production with multiple worker instances, each instance will process this many
const UPLOAD_CONCURRENCY = parseInt(process.env.UPLOAD_QUEUE_CONCURRENCY || '5', 10);
const LESSON_CONCURRENCY = parseInt(process.env.LESSON_QUEUE_CONCURRENCY || '3', 10);

// Worker instance ID for logging (useful when running multiple workers)
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;

export function setupWorkers(options = {}) {
  const {
    tenantHelpers,
    pool,
    storageDir = DEFAULT_STORAGE_DIR,
    llmProviderFactory
  } = options;

  if (!tenantHelpers) {
    throw new Error('tenantHelpers is required for job workers');
  }

  const jobTracker = createJobTracker(tenantHelpers);
  const studyService = createStudyService({
    pool,
    llmProviderFactory
  });

  console.log(`[Worker:${WORKER_ID}] Initializing job processors...`);

  // Upload job processor - process up to UPLOAD_CONCURRENCY jobs in parallel
  uploadQueue.process(UPLOAD_CONCURRENCY, async (job) => {
    console.log(`[Worker:${WORKER_ID}] Processing upload job ${job.id}`);
    return await processUploadJob(job, {
      tenantHelpers,
      jobTracker,
      storageDir
    });
  });

  // Lesson generation job processor - process up to LESSON_CONCURRENCY jobs in parallel
  lessonQueue.process(LESSON_CONCURRENCY, async (job) => {
    console.log(`[Worker:${WORKER_ID}] Processing lesson job ${job.id}`);
    return await processLessonJob(job, {
      tenantHelpers,
      jobTracker,
      studyService
    });
  });

  console.log(`[Worker:${WORKER_ID}] Job processors started`);
  console.log(`[Worker:${WORKER_ID}] - Upload queue ready (concurrency: ${UPLOAD_CONCURRENCY})`);
  console.log(`[Worker:${WORKER_ID}] - Lesson queue ready (concurrency: ${LESSON_CONCURRENCY})`);

  return {
    uploadQueue,
    lessonQueue,
    jobTracker
  };
}

export default setupWorkers;
