/**
 * Job Status Routes
 *
 * API endpoints for checking job status and polling for updates
 */

import express from 'express';

export default function createJobsRouter(options = {}) {
  const router = express.Router();
  const { jobTracker } = options;

  if (!jobTracker) {
    throw new Error('jobTracker is required for jobs router');
  }

  /**
   * GET /jobs/:id
   * Get status of a specific job
   */
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const ownerId = req.userId;

    try {
      const job = await jobTracker.getJob(ownerId, id);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json({
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        data: job.data,
        result: job.result,
        error: job.error,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at
      });
    } catch (error) {
      console.error('[jobs/:id] Error:', error);
      res.status(500).json({ error: 'Failed to get job status' });
    }
  });

  /**
   * GET /jobs
   * Get all jobs for the current user (with optional filters)
   */
  router.get('/', async (req, res) => {
    const ownerId = req.userId;
    const { type, status, limit } = req.query;

    try {
      const jobs = await jobTracker.getJobs(ownerId, {
        type,
        status,
        limit: limit ? parseInt(limit, 10) : undefined
      });

      res.json({ jobs });
    } catch (error) {
      console.error('[jobs] Error:', error);
      res.status(500).json({ error: 'Failed to get jobs' });
    }
  });

  /**
   * GET /jobs/resource/:resourceType/:resourceId
   * Get active jobs for a specific resource (document, section, etc.)
   */
  router.get('/resource/:resourceType/:resourceId', async (req, res) => {
    const { resourceType, resourceId } = req.params;
    const ownerId = req.userId;

    try {
      const jobs = await jobTracker.getActiveJobsForResource(ownerId, resourceType, resourceId);

      res.json({ jobs });
    } catch (error) {
      console.error('[jobs/resource] Error:', error);
      res.status(500).json({ error: 'Failed to get resource jobs' });
    }
  });

  /**
   * POST /jobs/poll
   * Poll for status of multiple jobs at once (efficient polling)
   */
  router.post('/poll', async (req, res) => {
    const ownerId = req.userId;
    const { job_ids } = req.body;

    if (!Array.isArray(job_ids) || job_ids.length === 0) {
      return res.status(400).json({ error: 'job_ids array is required' });
    }

    try {
      const results = await Promise.all(
        job_ids.map(async (jobId) => {
          try {
            const job = await jobTracker.getJob(ownerId, jobId);
            return job || null;
          } catch (error) {
            console.error(`[jobs/poll] Error getting job ${jobId}:`, error);
            return null;
          }
        })
      );

      const jobs = results.filter(job => job !== null);

      res.json({ jobs });
    } catch (error) {
      console.error('[jobs/poll] Error:', error);
      res.status(500).json({ error: 'Failed to poll jobs' });
    }
  });

  return router;
}
