/**
 * Chapter API Routes
 * Handles chapter-related operations for two-phase processing
 */

import express from 'express';

export default function createChaptersRouter({ tenantHelpers }) {
  const router = express.Router();

  /**
   * GET /chapters?course_id=xxx
   * Fetch all chapters for a course (Phase 1 results)
   */
  router.get('/', async (req, res) => {
    const ownerId = req.userId;
    const { course_id } = req.query;

    if (!course_id) {
      return res.status(400).json({ error: 'course_id is required' });
    }

    try {
      const chapters = await tenantHelpers.withTenant(ownerId, async (client) => {
        const { rows } = await client.query(
          `SELECT
            c.id,
            c.chapter_number,
            c.title,
            c.description,
            c.raw_markdown,
            c.sections_generated,
            c.source_count,
            c.created_at,
            c.upload_batch_id,
            ub.title as batch_title,
            ub.material_type
           FROM chapters c
           LEFT JOIN upload_batches ub ON c.upload_batch_id = ub.id
           WHERE c.course_id = $1
           ORDER BY c.chapter_number ASC`,
          [course_id]
        );

        return rows;
      });

      res.json({ chapters });
    } catch (error) {
      console.error('Error fetching chapters:', error);
      res.status(500).json({ error: 'Failed to fetch chapters' });
    }
  });

  /**
   * GET /chapters/:id
   * Fetch a single chapter with full details
   */
  router.get('/:id', async (req, res) => {
    const ownerId = req.userId;
    const { id } = req.params;

    try {
      const chapter = await tenantHelpers.withTenant(ownerId, async (client) => {
        const { rows } = await client.query(
          `SELECT
            c.id,
            c.chapter_number,
            c.title,
            c.description,
            c.raw_markdown,
            c.sections_generated,
            c.source_count,
            c.created_at,
            c.upload_batch_id,
            c.course_id,
            ub.title as batch_title,
            ub.material_type
           FROM chapters c
           LEFT JOIN upload_batches ub ON c.upload_batch_id = ub.id
           WHERE c.id = $1`,
          [id]
        );

        if (rows.length === 0) {
          return null;
        }

        return rows[0];
      });

      if (!chapter) {
        return res.status(404).json({ error: 'Chapter not found' });
      }

      res.json(chapter);
    } catch (error) {
      console.error('Error fetching chapter:', error);
      res.status(500).json({ error: 'Failed to fetch chapter' });
    }
  });

  return router;
}
