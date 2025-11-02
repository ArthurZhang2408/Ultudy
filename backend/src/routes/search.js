import express from 'express';
import createSearchService from '../search/service.js';

export default function createSearchRouter(options = {}) {
  const router = express.Router();
  const searchService = options.searchService || createSearchService({
    pool: options.pool,
    embeddingsProviderFactory: options.embeddingsProviderFactory
  });

  router.get('/', async (req, res) => {
    const { q, k } = req.query;

    if (!q) {
      res.status(400).json({ error: 'Missing query parameter q' });
      return;
    }

    try {
      const results = await searchService.search(String(q), k ? Number(k) : undefined);
      res.json(results);
    } catch (error) {
      console.error('Search failed', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  return router;
}
