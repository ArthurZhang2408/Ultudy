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

    try {
      const rows = await tenantHelpers.withTenant(ownerId, async (client) => {
        const { rows: result } = await client.query(
          `
            SELECT id, title, pages, created_at
            FROM documents
            WHERE owner_id = $1
            ORDER BY created_at DESC
            LIMIT 100
          `,
          [ownerId]
        );
        return result;
      });

      res.json(rows);
    } catch (error) {
      console.error('Failed to list documents', error);
      res.status(500).json({ error: 'Failed to list documents' });
    }
  });

  return router;
}
