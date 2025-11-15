/**
 * Job Worker
 *
 * Processes jobs from Bull queues
 */

import dotenv from 'dotenv';
import pool from '../db/index.js';
import { createTenantHelpers } from '../db/tenant.js';
import { materialUploadQueue, lessonGenerationQueue, checkInEvaluationQueue } from './queue.js';
import { processMaterialUpload } from './processors/materialUpload.js';
import { processLessonGeneration } from './processors/lessonGeneration.js';
import { processCheckInEvaluation } from './processors/checkInEvaluation.js';
import createStudyService from '../study/service.js';
import { getLLMProvider } from '../providers/llm/index.js';

dotenv.config();

// Initialize services
const tenantHelpers = createTenantHelpers(pool);
const studyService = createStudyService({
  pool,
  llmProviderFactory: getLLMProvider,
  tenantHelpers
});

// Get evaluateAnswer function from study service
const { evaluateAnswer } = await import('../study/evaluation.js');

// Configure job processors
const processorConfig = {
  pool,
  tenantHelpers,
  studyService,
  evaluateAnswer
};

// Material Upload Queue Processor
materialUploadQueue.process(async (job) => {
  console.log(`[Worker] Processing material-upload job ${job.id}`);
  return processMaterialUpload(job, processorConfig);
});

// Lesson Generation Queue Processor
lessonGenerationQueue.process(async (job) => {
  console.log(`[Worker] Processing lesson-generation job ${job.id}`);
  return processLessonGeneration(job, processorConfig);
});

// Check-in Evaluation Queue Processor
checkInEvaluationQueue.process(async (job) => {
  console.log(`[Worker] Processing check-in-evaluation job ${job.id}`);
  return processCheckInEvaluation(job, processorConfig);
});

// Error handling
materialUploadQueue.on('failed', (job, err) => {
  console.error(`[Worker] Material upload job ${job.id} failed:`, err);
});

lessonGenerationQueue.on('failed', (job, err) => {
  console.error(`[Worker] Lesson generation job ${job.id} failed:`, err);
});

checkInEvaluationQueue.on('failed', (job, err) => {
  console.error(`[Worker] Check-in evaluation job ${job.id} failed:`, err);
});

// Success logging
materialUploadQueue.on('completed', (job, result) => {
  console.log(`[Worker] Material upload job ${job.id} completed successfully`);
});

lessonGenerationQueue.on('completed', (job, result) => {
  console.log(`[Worker] Lesson generation job ${job.id} completed successfully`);
});

checkInEvaluationQueue.on('completed', (job, result) => {
  console.log(`[Worker] Check-in evaluation job ${job.id} completed successfully`);
});

console.log('✅ Job worker started and listening for jobs...');
console.log('   - material-upload queue');
console.log('   - lesson-generation queue');
console.log('   - check-in-evaluation queue');
