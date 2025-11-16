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
const UPLOAD_CONCURRENCY = parseInt(process.env.UPLOAD_QUEUE_CONCURRENCY || '3', 10);
const LESSON_CONCURRENCY = parseInt(process.env.LESSON_QUEUE_CONCURRENCY || '2', 10);

export function setupWorkers(options = {}) {
  const {
    tenantHelpers,
    pool,
    storageDir = DEFAULT_STORAGE_DIR,
    llmProviderFactory,
    embeddingsProviderFactory
  } = options;

  if (!tenantHelpers) {
    throw new Error('tenantHelpers is required for job workers');
  }

  const jobTracker = createJobTracker(tenantHelpers);
  const studyService = createStudyService({
    pool,
    llmProviderFactory
  });

  // Upload job processor - process up to UPLOAD_CONCURRENCY jobs in parallel
  uploadQueue.process(UPLOAD_CONCURRENCY, async (job) => {
    console.log(`[Worker] Processing upload job ${job.id}`);
    return await processUploadJob(job, {
      tenantHelpers,
      jobTracker,
      storageDir
    });
  });

  // Lesson generation job processor - process up to LESSON_CONCURRENCY jobs in parallel
  lessonQueue.process(LESSON_CONCURRENCY, async (job) => {
    console.log(`[Worker] Processing lesson job ${job.id}`);
    return await processLessonJob(job, {
      tenantHelpers,
      jobTracker,
      studyService
    });
  });

  console.log('[Worker] Job processors started');
  console.log(`[Worker] - Upload queue ready (concurrency: ${UPLOAD_CONCURRENCY})`);
  console.log(`[Worker] - Lesson queue ready (concurrency: ${LESSON_CONCURRENCY})`);

  return {
    uploadQueue,
    lessonQueue,
    jobTracker
  };
}

export default setupWorkers;
