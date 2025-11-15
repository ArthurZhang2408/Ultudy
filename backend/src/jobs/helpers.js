/**
 * Job Management Helpers
 *
 * Provides utilities for creating and tracking jobs in the database
 */

import { randomUUID } from 'node:crypto';

/**
 * Create a new job in the database
 */
export async function createJob(pool, { ownerId, type, inputData, bullJobId }) {
  const jobId = randomUUID();

  const { rows } = await pool.query(
    `INSERT INTO jobs (id, owner_id, type, status, progress, input_data, bull_job_id, created_at)
     VALUES ($1, $2, $3, 'pending', 0, $4, $5, NOW())
     RETURNING id, owner_id, type, status, progress, created_at`,
    [jobId, ownerId, type, inputData, bullJobId]
  );

  return rows[0];
}

/**
 * Update job status and progress
 */
export async function updateJobProgress(pool, { jobId, status, progress, progressMessage, startedAt }) {
  const updates = [];
  const values = [jobId];
  let paramCount = 1;

  if (status !== undefined) {
    paramCount++;
    updates.push(`status = $${paramCount}`);
    values.push(status);
  }

  if (progress !== undefined) {
    paramCount++;
    updates.push(`progress = $${paramCount}`);
    values.push(progress);
  }

  if (progressMessage !== undefined) {
    paramCount++;
    updates.push(`progress_message = $${paramCount}`);
    values.push(progressMessage);
  }

  if (startedAt !== undefined) {
    paramCount++;
    updates.push(`started_at = $${paramCount}`);
    values.push(startedAt);
  }

  if (updates.length === 0) {
    return;
  }

  await pool.query(
    `UPDATE jobs SET ${updates.join(', ')} WHERE id = $1`,
    values
  );
}

/**
 * Mark job as completed
 */
export async function completeJob(pool, { jobId, resultData }) {
  await pool.query(
    `UPDATE jobs
     SET status = 'completed',
         progress = 100,
         result_data = $2,
         completed_at = NOW()
     WHERE id = $1`,
    [jobId, resultData]
  );
}

/**
 * Mark job as failed
 */
export async function failJob(pool, { jobId, errorMessage, errorStack }) {
  await pool.query(
    `UPDATE jobs
     SET status = 'failed',
         error_message = $2,
         error_stack = $3,
         completed_at = NOW()
     WHERE id = $1`,
    [jobId, errorMessage, errorStack]
  );
}

/**
 * Get job by ID (with tenant isolation)
 */
export async function getJob(tenantHelpers, ownerId, jobId) {
  return tenantHelpers.withTenant(ownerId, async (client) => {
    const { rows } = await client.query(
      `SELECT id, owner_id, type, status, progress, progress_message,
              input_data, result_data, error_message,
              created_at, started_at, completed_at
       FROM jobs
       WHERE id = $1 AND owner_id = $2`,
      [jobId, ownerId]
    );

    return rows[0] || null;
  });
}

/**
 * List jobs for a user
 */
export async function listJobs(tenantHelpers, ownerId, { type, status, limit = 50, offset = 0 } = {}) {
  return tenantHelpers.withTenant(ownerId, async (client) => {
    const conditions = ['owner_id = $1'];
    const values = [ownerId];
    let paramCount = 1;

    if (type) {
      paramCount++;
      conditions.push(`type = $${paramCount}`);
      values.push(type);
    }

    if (status) {
      paramCount++;
      conditions.push(`status = $${paramCount}`);
      values.push(status);
    }

    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;

    const { rows } = await client.query(
      `SELECT id, owner_id, type, status, progress, progress_message,
              result_data, error_message,
              created_at, started_at, completed_at
       FROM jobs
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...values, limit, offset]
    );

    return rows;
  });
}
