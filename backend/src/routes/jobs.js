/**
 * Jobs Routes
 *
 * API endpoints for managing async jobs
 */

import express from 'express';
import { getJob, listJobs } from '../jobs/helpers.js';
import { getQueueHealth } from '../jobs/queue.js';

export default function createJobsRouter(options = {}) {
  const router = express.Router();
  const { tenantHelpers } = options;

  if (!tenantHelpers) {
    throw new Error('tenantHelpers is required for jobs router');
  }

  /**
   * GET /jobs/:jobId
   * Get job status and result
   */
  router.get('/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const ownerId = req.userId;

    try {
      const job = await getJob(tenantHelpers, ownerId, jobId);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json({
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        progress_message: job.progress_message,
        result: job.result_data,
        error: job.error_message,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at
      });
    } catch (error) {
      console.error('[GET /jobs/:jobId] Error:', error);
      res.status(500).json({ error: 'Failed to get job status' });
    }
  });

  /**
   * GET /jobs
   * List jobs for the current user
   */
  router.get('/', async (req, res) => {
    const ownerId = req.userId;
    const { type, status, limit, offset } = req.query;

    try {
      const jobs = await listJobs(tenantHelpers, ownerId, {
        type,
        status,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });

      res.json({
        jobs: jobs.map((job) => ({
          id: job.id,
          type: job.type,
          status: job.status,
          progress: job.progress,
          progress_message: job.progress_message,
          result: job.result_data,
          error: job.error_message,
          created_at: job.created_at,
          started_at: job.started_at,
          completed_at: job.completed_at
        })),
        count: jobs.length
      });
    } catch (error) {
      console.error('[GET /jobs] Error:', error);
      res.status(500).json({ error: 'Failed to list jobs' });
    }
  });

  /**
   * GET /jobs/health/queues
   * Get queue health status (admin endpoint)
   */
  router.get('/health/queues', async (req, res) => {
    try {
      const health = await getQueueHealth();
      res.json(health);
    } catch (error) {
      console.error('[GET /jobs/health/queues] Error:', error);
      res.status(500).json({ error: 'Failed to get queue health' });
    }
  });

  return router;
}
