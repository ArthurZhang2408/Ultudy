import express from 'express';
import { createTenantHelpers } from '../db/tenant.js';

export default function createDocumentsRouter(options = {}) {
  const router = express.Router();
  const pool = options.pool;
  const tenantHelpers = options.tenantHelpers || (pool ? createTenantHelpers(pool) : null);

  if (!pool || !tenantHelpers) {
    throw new Error('Database pool and tenant helpers are required for documents route');
  }

  router.get('/', async (req, res) => {
    const ownerId = req.userId;
    const { course_id } = req.query;

    try {
      const rows = await tenantHelpers.withTenant(ownerId, async (client) => {
        let query = `
          SELECT id, title, pages, created_at as uploaded_at, material_type, chapter, user_tags, course_id
          FROM documents
          WHERE owner_id = $1
        `;
        const params = [ownerId];

        if (course_id) {
          query += ` AND course_id = $2`;
          params.push(course_id);
        }

        query += ` ORDER BY created_at DESC LIMIT 100`;

        const { rows: result } = await client.query(query, params);
        return result;
      });

      res.json({ documents: rows });
    } catch (error) {
      console.error('Failed to list documents', error);
      res.status(500).json({ error: 'Failed to list documents' });
    }
  });

  router.post('/:id/metadata', async (req, res) => {
    const ownerId = req.userId;
    const { id } = req.params;
    const { material_type, chapter, title, user_tags, course_id } = req.body;

    // Validate material_type if provided
    const validMaterialTypes = ['textbook', 'lecture', 'tutorial', 'exam'];
    if (material_type && !validMaterialTypes.includes(material_type)) {
      return res.status(400).json({
        error: `Invalid material_type. Must be one of: ${validMaterialTypes.join(', ')}`
      });
    }

    // Validate user_tags if provided
    if (user_tags !== undefined && !Array.isArray(user_tags)) {
      return res.status(400).json({
        error: 'user_tags must be an array of strings'
      });
    }

    // Build dynamic update query outside tenant helper so we can fail fast
    const updates = [];
    const params = [id, ownerId];
    let paramIndex = 3;

    if (material_type !== undefined) {
      updates.push(`material_type = $${paramIndex}`);
      params.push(material_type);
      paramIndex++;
    }

    if (chapter !== undefined) {
      updates.push(`chapter = $${paramIndex}`);
      params.push(chapter);
      paramIndex++;
    }

    if (title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;
    }

    if (user_tags !== undefined) {
      updates.push(`user_tags = $${paramIndex}`);
      params.push(user_tags);
      paramIndex++;
    }

    if (course_id !== undefined) {
      updates.push(`course_id = $${paramIndex}`);
      params.push(course_id);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'No metadata fields provided to update'
      });
    }

    try {
      const result = await tenantHelpers.withTenant(ownerId, async (client) => {
        const query = `
          UPDATE documents
          SET ${updates.join(', ')}
          WHERE id = $1 AND owner_id = $2
          RETURNING id, title, pages, created_at, material_type, chapter, user_tags, course_id
        `;

        const { rows } = await client.query(query, params);

        if (rows.length === 0) {
          return null;
        }

        return rows[0];
      });

      if (!result) {
        return res.status(404).json({
          error: 'Document not found or you do not have permission to update it'
        });
      }

      res.json(result);
    } catch (error) {
      console.error('Failed to update document metadata', error);
      res.status(500).json({ error: 'Failed to update document metadata' });
    }
  });

  return router;
}
