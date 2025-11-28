import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTenantHelpers } from '../db/tenant.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage');

export default function createDocumentsRouter(options = {}) {
  const router = express.Router();
  const pool = options.pool;
  const tenantHelpers = options.tenantHelpers || (pool ? createTenantHelpers(pool) : null);
  const storageDir = options.storageDir ?? DEFAULT_STORAGE_DIR;

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

  router.get('/:id', async (req, res) => {
    const ownerId = req.userId;
    const { id } = req.params;

    try {
      const document = await tenantHelpers.withTenant(ownerId, async (client) => {
        const query = `
          SELECT id, title, pages, created_at as uploaded_at, material_type, chapter, user_tags, course_id
          FROM documents
          WHERE id = $1 AND owner_id = $2
        `;
        const { rows } = await client.query(query, [id, ownerId]);
        return rows.length > 0 ? rows[0] : null;
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      res.json(document);
    } catch (error) {
      console.error('Failed to fetch document', error);
      res.status(500).json({ error: 'Failed to fetch document' });
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

  router.patch('/:id/rename', async (req, res) => {
    const ownerId = req.userId;
    const { id } = req.params;
    const { title } = req.body;

    // Validate document ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }

    // Validate title
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
    }

    if (title.length > 500) {
      return res.status(400).json({ error: 'Title must be less than 500 characters' });
    }

    try {
      const result = await tenantHelpers.withTenant(ownerId, async (client) => {
        // Check if document exists and user owns it
        const { rows: checkRows } = await client.query(
          'SELECT id FROM documents WHERE id = $1 AND owner_id = $2',
          [id, ownerId]
        );

        if (checkRows.length === 0) {
          return { success: false, error: 'Document not found or access denied' };
        }

        // Update the document title
        const { rows: updateRows } = await client.query(
          'UPDATE documents SET title = $1 WHERE id = $2 AND owner_id = $3 RETURNING id, title',
          [title.trim(), id, ownerId]
        );

        return { success: true, document: updateRows[0] };
      });

      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }

      console.log(`[documents] Document ${id} renamed to "${title.trim()}"`);
      res.json({ success: true, document: result.document });
    } catch (error) {
      console.error('[documents] Rename error:', error);
      res.status(500).json({ error: 'Failed to rename document' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const ownerId = req.userId;
    const { id } = req.params;

    // Validate document ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }

    try {
      const result = await tenantHelpers.withTenant(ownerId, async (client) => {
        // 1. Check if document exists and user owns it
        const { rows: docRows } = await client.query(
          'SELECT id, title FROM documents WHERE id = $1 AND owner_id = $2',
          [id, ownerId]
        );

        if (docRows.length === 0) {
          return { success: false, error: 'Document not found or access denied' };
        }

        const document = docRows[0];

        // 2. Delete all related data (withTenant already provides a transaction)
        // CRITICAL ORDER: Delete in reverse dependency order to avoid foreign key violations

        // Delete study sessions first (references lessons)
        const { rowCount: sessionsDeleted } = await client.query(
          'DELETE FROM study_sessions WHERE document_id = $1 AND owner_id = $2',
          [id, ownerId]
        );

        // Delete lessons before sections (lessons may reference section_id)
        const { rowCount: lessonsDeleted } = await client.query(
          'DELETE FROM lessons WHERE document_id = $1 AND owner_id = $2',
          [id, ownerId]
        );

        // Delete concepts (references sections via section_id)
        const { rowCount: conceptsDeleted } = await client.query(
          'DELETE FROM concepts WHERE document_id = $1 AND owner_id = $2',
          [id, ownerId]
        );

        // Delete sections (now safe - no more references)
        const { rowCount: sectionsDeleted } = await client.query(
          'DELETE FROM sections WHERE document_id = $1 AND owner_id = $2',
          [id, ownerId]
        );

        // Delete document
        await client.query(
          'DELETE FROM documents WHERE id = $1 AND owner_id = $2',
          [id, ownerId]
        );

        console.log(`[documents] Deleted document ${id}:`, {
          title: document.title,
          concepts: conceptsDeleted,
          sections: sectionsDeleted,
          lessons: lessonsDeleted,
          sessions: sessionsDeleted
        });

        return {
          success: true,
          deleted: {
            document: document.title,
            concepts: conceptsDeleted,
            sections: sectionsDeleted,
            lessons: lessonsDeleted,
            sessions: sessionsDeleted
          }
        };
      });

      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }

      // 3. Delete PDF file from storage (outside transaction)
      try {
        const pdfPath = path.join(storageDir, ownerId, `${id}.pdf`);
        await fs.rm(pdfPath, { force: true });
        console.log(`[documents] Deleted PDF file: ${pdfPath}`);
      } catch (fileError) {
        console.warn(`[documents] Failed to delete PDF file for ${id}:`, fileError.message);
        // Continue even if file deletion fails - file may not exist
      }

      res.json({
        success: true,
        message: 'Document and all related content deleted successfully',
        deleted: result.deleted
      });
    } catch (error) {
      console.error('Failed to delete document', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  return router;
}
