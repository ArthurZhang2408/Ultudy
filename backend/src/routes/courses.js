import express from 'express';
import { createTenantHelpers } from '../db/tenant.js';

export default function createCoursesRouter(options = {}) {
  const router = express.Router();
  const pool = options.pool;
  const tenantHelpers = options.tenantHelpers ||
    (pool ? createTenantHelpers(pool) : null);

  if (!tenantHelpers) {
    throw new Error('Tenant helpers are required for courses routes');
  }

  // GET /courses - List all courses for the user
  router.get('/', async (req, res) => {
    const ownerId = req.userId;

    try {
      const courses = await tenantHelpers.withTenant(ownerId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, name, code, term, exam_date, created_at, updated_at
           FROM courses
           WHERE owner_id = $1
           ORDER BY created_at DESC`,
          [ownerId]
        );
        return rows;
      });

      res.json({ courses });
    } catch (error) {
      console.error('Failed to list courses', error);
      res.status(500).json({ error: 'Failed to list courses' });
    }
  });

  // POST /courses - Create a new course
  router.post('/', async (req, res) => {
    const { name, code, term, exam_date } = req.body || {};
    const ownerId = req.userId;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required and must be non-empty' });
    }

    try {
      const course = await tenantHelpers.withTenant(ownerId, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO courses (owner_id, name, code, term, exam_date)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, code, term, exam_date, created_at, updated_at`,
          [ownerId, name.trim(), code || null, term || null, exam_date || null]
        );
        return rows[0];
      });

      res.status(201).json(course);
    } catch (error) {
      console.error('Failed to create course', error);
      res.status(500).json({ error: 'Failed to create course' });
    }
  });

  // GET /courses/:id - Get a single course
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const ownerId = req.userId;

    try {
      const course = await tenantHelpers.withTenant(ownerId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, name, code, term, exam_date, created_at, updated_at
           FROM courses
           WHERE id = $1 AND owner_id = $2`,
          [id, ownerId]
        );
        return rows[0] || null;
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      res.json(course);
    } catch (error) {
      console.error('Failed to get course', error);
      res.status(500).json({ error: 'Failed to get course' });
    }
  });

  // PATCH /courses/:id - Update a course
  router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, code, term, exam_date } = req.body || {};
    const ownerId = req.userId;

    const updates = [];
    const values = [];
    let valueIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${valueIndex++}`);
      values.push(name);
    }
    if (code !== undefined) {
      updates.push(`code = $${valueIndex++}`);
      values.push(code);
    }
    if (term !== undefined) {
      updates.push(`term = $${valueIndex++}`);
      values.push(term);
    }
    if (exam_date !== undefined) {
      updates.push(`exam_date = $${valueIndex++}`);
      values.push(exam_date);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id, ownerId);

    try {
      const course = await tenantHelpers.withTenant(ownerId, async (client) => {
        const { rows } = await client.query(
          `UPDATE courses
           SET ${updates.join(', ')}
           WHERE id = $${valueIndex} AND owner_id = $${valueIndex + 1}
           RETURNING id, name, code, term, exam_date, created_at, updated_at`,
          values
        );
        return rows[0] || null;
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      res.json(course);
    } catch (error) {
      console.error('Failed to update course', error);
      res.status(500).json({ error: 'Failed to update course' });
    }
  });

  // DELETE /courses/:id - Delete a course
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const ownerId = req.userId;

    try {
      const deleted = await tenantHelpers.withTenant(ownerId, async (client) => {
        const { rowCount } = await client.query(
          'DELETE FROM courses WHERE id = $1 AND owner_id = $2',
          [id, ownerId]
        );
        return rowCount > 0;
      });

      if (!deleted) {
        return res.status(404).json({ error: 'Course not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete course', error);
      res.status(500).json({ error: 'Failed to delete course' });
    }
  });

  return router;
}
