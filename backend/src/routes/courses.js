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
    const { include_archived } = req.query;

    try {
      const courses = await tenantHelpers.withTenant(ownerId, async (client) => {
        // Check if archived column exists to avoid transaction abort
        const { rows: columnCheck } = await client.query(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_name = 'courses'
             AND column_name = 'archived'`
        );
        const hasArchivedColumn = columnCheck.length > 0;

        if (hasArchivedColumn) {
          // Auto-archive courses past exam date (only if never been manually unarchived)
          // If archived_at is NULL, it means it's never been archived, so safe to auto-archive
          // If archived_at is NOT NULL and archived is false, user manually unarchived it, so don't auto-archive
          await client.query(
            `UPDATE courses
             SET archived = true, archived_at = NOW()
             WHERE owner_id = $1
               AND archived = false
               AND archived_at IS NULL
               AND exam_date IS NOT NULL
               AND exam_date < CURRENT_DATE`,
            [ownerId]
          );

          // Fetch courses with archived columns
          const whereClause = include_archived === 'true'
            ? 'owner_id = $1'
            : 'owner_id = $1 AND archived = false';

          const { rows } = await client.query(
            `SELECT id, name, code, term, exam_date, archived, archived_at, created_at, updated_at
             FROM courses
             WHERE ${whereClause}
             ORDER BY archived ASC, created_at DESC`,
            [ownerId]
          );

          return rows;
        } else {
          // Archived column doesn't exist yet, use old query
          const { rows } = await client.query(
            `SELECT id, name, code, term, exam_date, created_at, updated_at
             FROM courses
             WHERE owner_id = $1
             ORDER BY created_at DESC`,
            [ownerId]
          );
          // Add archived: false to all courses for backwards compatibility
          return rows.map(row => ({ ...row, archived: false, archived_at: null, updated_at: row.updated_at || row.created_at }));
        }
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
        // Check if archived column exists
        const { rows: columnCheck } = await client.query(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_name = 'courses'
             AND column_name = 'archived'`
        );
        const hasArchivedColumn = columnCheck.length > 0;

        if (hasArchivedColumn) {
          const { rows } = await client.query(
            `SELECT id, name, code, term, exam_date, archived, archived_at, created_at, updated_at
             FROM courses
             WHERE id = $1 AND owner_id = $2`,
            [id, ownerId]
          );
          return rows[0] || null;
        } else {
          const { rows } = await client.query(
            `SELECT id, name, code, term, exam_date, created_at, updated_at
             FROM courses
             WHERE id = $1 AND owner_id = $2`,
            [id, ownerId]
          );
          const course = rows[0] || null;
          return course ? { ...course, archived: false, archived_at: null, updated_at: course.updated_at || course.created_at } : null;
        }
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
    const { name, code, term, exam_date, archived } = req.body || {};
    const ownerId = req.userId;

    try {
      const course = await tenantHelpers.withTenant(ownerId, async (client) => {
        // Check if archived column exists
        const { rows: columnCheck } = await client.query(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_name = 'courses'
             AND column_name = 'archived'`
        );
        const hasArchivedColumn = columnCheck.length > 0;

        // If trying to update archived but column doesn't exist, return error
        if (archived !== undefined && !hasArchivedColumn) {
          throw new Error('Archive feature not yet available. Please try again later.');
        }

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
        if (archived !== undefined && hasArchivedColumn) {
          updates.push(`archived = $${valueIndex++}`);
          values.push(archived);
          // Set archived_at when archiving, but DON'T clear it when unarchiving
          // This allows auto-archive to detect manual unarchiving (archived=false but archived_at is set)
          if (archived) {
            updates.push(`archived_at = NOW()`);
          }
          // When unarchiving, keep archived_at so auto-archive knows user manually unarchived
        }

        if (updates.length === 0) {
          throw new Error('No fields to update');
        }

        updates.push(`updated_at = NOW()`);
        values.push(id, ownerId);

        if (hasArchivedColumn) {
          const { rows } = await client.query(
            `UPDATE courses
             SET ${updates.join(', ')}
             WHERE id = $${valueIndex} AND owner_id = $${valueIndex + 1}
             RETURNING id, name, code, term, exam_date, archived, archived_at, created_at, updated_at`,
            values
          );
          return rows[0] || null;
        } else {
          const { rows } = await client.query(
            `UPDATE courses
             SET ${updates.join(', ')}
             WHERE id = $${valueIndex} AND owner_id = $${valueIndex + 1}
             RETURNING id, name, code, term, exam_date, created_at, updated_at`,
            values
          );
          const course = rows[0] || null;
          return course ? { ...course, archived: false, archived_at: null, updated_at: course.updated_at } : null;
        }
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      res.json(course);
    } catch (error) {
      console.error('Failed to update course', error);
      // Return 400 for validation errors, 500 for server errors
      const statusCode = error.message === 'No fields to update' ||
                        error.message?.includes('Archive feature not yet available')
                        ? 400 : 500;
      res.status(statusCode).json({ error: error.message || 'Failed to update course' });
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
