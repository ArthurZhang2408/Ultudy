import express from 'express';
import { getUserId } from '../http/user.js';

export default function createDocumentsRouter(options = {}) {
  const router = express.Router();
  const pool = options.pool;

  if (!pool) {
    throw new Error('Database pool is required for documents route');
  }

  router.get('/', async (req, res) => {
    const ownerId = getUserId(req);

    try {
      const { rows } = await pool.query(
        `
          SELECT id, title, pages, created_at
          FROM documents
          WHERE owner_id = $1
          ORDER BY created_at DESC
          LIMIT 100
        `,
        [ownerId]
      );

      res.json(rows);
    } catch (error) {
      console.error('Failed to list documents', error);
      res.status(500).json({ error: 'Failed to list documents' });
    }
  });

  return router;
}
