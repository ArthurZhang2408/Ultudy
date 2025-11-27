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
import { StorageService } from '../lib/storage.js';
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

  // Initialize storage service (uses S3 if configured, otherwise local filesystem)
  const storageService = new StorageService({ storageDir });

  const STARTUP_TIME = new Date().toISOString();
  const RAILWAY_DEPLOYMENT_ID = process.env.RAILWAY_DEPLOYMENT_ID || 'local';
  const RAILWAY_ENVIRONMENT = process.env.RAILWAY_ENVIRONMENT || 'local';

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  🚨 WORKER STARTING - SEARCH FOR THIS MESSAGE 🚨      ║`);
  console.log(`║  Environment: ${RAILWAY_ENVIRONMENT.padEnd(44)}║`);
  console.log(`║  Deployment: ${RAILWAY_DEPLOYMENT_ID.substring(0, 44).padEnd(44)}║`);
  console.log(`║  Worker ID: ${WORKER_ID.padEnd(46)}║`);
  console.log(`║  Started at: ${STARTUP_TIME.padEnd(44)}║`);
  console.log(`║                                                        ║`);
  console.log(`║  ⚠️  IF YOU SEE MULTIPLE WORKERS, YOU HAVE A PROBLEM   ║`);
  console.log(`║  ⚠️  Only ONE worker should be running per environment ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);
  console.log(`[Worker:${WORKER_ID}] Initializing job processors...`);
  console.log(`[Worker:${WORKER_ID}] Storage backend: ${storageService.getType()}`);

  // Upload job processor - process up to UPLOAD_CONCURRENCY jobs in parallel
  uploadQueue.process(UPLOAD_CONCURRENCY, async (job) => {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Worker:${WORKER_ID}] ▶ PICKED UP UPLOAD JOB ${job.id}`);
    console.log(`[Worker:${WORKER_ID}] Deployment: ${RAILWAY_DEPLOYMENT_ID.substring(0, 30)}...`);
    console.log(`[Worker:${WORKER_ID}] Job data:`, JSON.stringify(job.data, null, 2));
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    return await processUploadJob(job, {
      tenantHelpers,
      jobTracker,
      storageDir,
      storageService
    });
  });

  // Lesson generation job processor - process up to LESSON_CONCURRENCY jobs in parallel
  lessonQueue.process(LESSON_CONCURRENCY, async (job) => {
    console.log(`\n[Worker:${WORKER_ID}] ▶ Picked up lesson job ${job.id}`);
    return await processLessonJob(job, {
      tenantHelpers,
      jobTracker,
      studyService
    });
  });

  console.log(`\n✅ [Worker:${WORKER_ID}] Job processors started successfully`);
  console.log(`   - Upload queue ready (concurrency: ${UPLOAD_CONCURRENCY})`);
  console.log(`   - Lesson queue ready (concurrency: ${LESSON_CONCURRENCY})`);
  console.log(`   - Waiting for jobs...\n`);

  return {
    uploadQueue,
    lessonQueue,
    jobTracker
  };
}

export default setupWorkers;
