import express from 'express';
import createSearchService from '../search/service.js';
import { createTenantHelpers } from '../db/tenant.js';

export default function createSearchRouter(options = {}) {
  const router = express.Router();
  const searchService = options.searchService || createSearchService({
    pool: options.pool,
    embeddingsProviderFactory: options.embeddingsProviderFactory
  });
  const tenantHelpers = options.tenantHelpers ||
    (options.pool ? createTenantHelpers(options.pool) : null);

  if (!tenantHelpers) {
    throw new Error('Tenant helpers are required for search routes');
  }

  router.get('/', async (req, res) => {
    const { q, k } = req.query;

    if (!q) {
      res.status(400).json({ error: 'Missing query parameter q' });
      return;
    }

    const ownerId = req.userId;

    try {
      const limit = k ? Number(k) : undefined;
      const results = await tenantHelpers.withTenant(ownerId, (client) =>
        searchService.search(String(q), limit, ownerId, client)
      );
      res.json(results);
    } catch (error) {
      console.error('Search failed', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  return router;
}
