/**
 * Job Tracking Service
 *
 * Manages job status in the database for client polling and status updates.
 */

import { randomUUID } from 'node:crypto';

export class JobTracker {
  constructor(tenantHelpers) {
    this.tenantHelpers = tenantHelpers;
  }

  /**
   * Create a new job record in the database
   */
  async createJob(ownerId, type, data) {
    const jobId = randomUUID();

    await this.tenantHelpers.withTenant(ownerId, async (client) => {
      await client.query(
        `INSERT INTO jobs (id, owner_id, type, status, progress, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [jobId, ownerId, type, 'queued', 0, JSON.stringify(data)]
      );
    });

    console.log(`[JobTracker] Created job ${jobId} of type ${type}`);
    return jobId;
  }

  /**
   * Update job status
   */
  async updateJobStatus(ownerId, jobId, status, options = {}) {
    const { progress, result, error } = options;

    await this.tenantHelpers.withTenant(ownerId, async (client) => {
      const updates = ['status = $3'];
      const values = [jobId, ownerId, status];
      let paramCount = 3;

      if (progress !== undefined) {
        paramCount++;
        updates.push(`progress = $${paramCount}`);
        values.push(progress);
      }

      if (result !== undefined) {
        paramCount++;
        updates.push(`result = $${paramCount}`);
        values.push(JSON.stringify(result));
      }

      if (error !== undefined) {
        paramCount++;
        updates.push(`error = $${paramCount}`);
        values.push(error);
      }

      // Set timestamps based on status
      if (status === 'processing') {
        updates.push('started_at = current_timestamp');
      } else if (status === 'completed' || status === 'failed') {
        updates.push('completed_at = current_timestamp');
      }

      await client.query(
        `UPDATE jobs SET ${updates.join(', ')}
         WHERE id = $1 AND owner_id = $2`,
        values
      );
    });

    console.log(`[JobTracker] Updated job ${jobId} to status ${status}`, options);
  }

  /**
   * Get job status
   */
  async getJob(ownerId, jobId) {
    return await this.tenantHelpers.withTenant(ownerId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, type, status, progress, data, result, error,
                created_at, started_at, completed_at
         FROM jobs
         WHERE id = $1 AND owner_id = $2`,
        [jobId, ownerId]
      );

      if (rows.length === 0) {
        return null;
      }

      const job = rows[0];
      return {
        ...job,
        data: typeof job.data === 'string' ? JSON.parse(job.data) : job.data,
        result: typeof job.result === 'string' ? JSON.parse(job.result) : job.result
      };
    });
  }

  /**
   * Get all jobs for a user (optionally filtered by type or status)
   */
  async getJobs(ownerId, filters = {}) {
    const { type, status, limit = 50 } = filters;

    return await this.tenantHelpers.withTenant(ownerId, async (client) => {
      let query = `
        SELECT id, type, status, progress, data, result, error,
               created_at, started_at, completed_at
        FROM jobs
        WHERE owner_id = $1
      `;
      const values = [ownerId];
      let paramCount = 1;

      if (type) {
        paramCount++;
        query += ` AND type = $${paramCount}`;
        values.push(type);
      }

      if (status) {
        paramCount++;
        query += ` AND status = $${paramCount}`;
        values.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1}`;
      values.push(limit);

      const { rows } = await client.query(query, values);

      return rows.map(job => ({
        ...job,
        data: typeof job.data === 'string' ? JSON.parse(job.data) : job.data,
        result: typeof job.result === 'string' ? JSON.parse(job.result) : job.result
      }));
    });
  }

  /**
   * Get active jobs for a specific resource (e.g., document, section)
   */
  async getActiveJobsForResource(ownerId, resourceType, resourceId) {
    return await this.tenantHelpers.withTenant(ownerId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, type, status, progress, data, created_at, started_at
         FROM jobs
         WHERE owner_id = $1
           AND status IN ('queued', 'processing')
           AND data->$2 = $3
         ORDER BY created_at DESC`,
        [ownerId, resourceType, JSON.stringify(resourceId)]
      );

      return rows.map(job => ({
        ...job,
        data: typeof job.data === 'string' ? JSON.parse(job.data) : job.data
      }));
    });
  }

  /**
   * Mark job as started
   */
  async startJob(ownerId, jobId) {
    await this.updateJobStatus(ownerId, jobId, 'processing', { progress: 0 });
  }

  /**
   * Mark job as completed
   */
  async completeJob(ownerId, jobId, result) {
    await this.updateJobStatus(ownerId, jobId, 'completed', {
      progress: 100,
      result
    });
  }

  /**
   * Mark job as failed
   */
  async failJob(ownerId, jobId, error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await this.updateJobStatus(ownerId, jobId, 'failed', { error: errorMessage });
  }

  /**
   * Update job progress
   * @param {string} ownerId - Owner ID
   * @param {string} jobId - Job ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {object} metadata - Optional metadata (e.g., current_chapter, chapters_total)
   */
  async updateProgress(ownerId, jobId, progress, metadata = null) {
    await this.tenantHelpers.withTenant(ownerId, async (client) => {
      if (metadata && progress !== null) {
        // Update both progress and metadata
        await client.query(
          `UPDATE jobs
           SET progress = $3,
               data = COALESCE(data, '{}'::jsonb) || $4::jsonb
           WHERE id = $1 AND owner_id = $2`,
          [jobId, ownerId, Math.min(100, Math.max(0, progress)), JSON.stringify(metadata)]
        );
      } else if (metadata) {
        // Update only metadata (keep progress unchanged)
        await client.query(
          `UPDATE jobs
           SET data = COALESCE(data, '{}'::jsonb) || $3::jsonb
           WHERE id = $1 AND owner_id = $2`,
          [jobId, ownerId, JSON.stringify(metadata)]
        );
      } else if (progress !== null) {
        // Update only progress
        await client.query(
          `UPDATE jobs SET progress = $3
           WHERE id = $1 AND owner_id = $2`,
          [jobId, ownerId, Math.min(100, Math.max(0, progress))]
        );
      }
    });
  }
}

export function createJobTracker(tenantHelpers) {
  return new JobTracker(tenantHelpers);
}
