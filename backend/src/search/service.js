import pool from '../db/index.js';
import { getEmbeddingsProvider } from '../embeddings/provider.js';
import { formatEmbeddingForInsert } from '../embeddings/utils.js';

export function createSearchService(options = {}) {
  const activePool = options.pool ?? pool;
  const embeddingsProviderFactory = options.embeddingsProviderFactory ?? getEmbeddingsProvider;

  if (!activePool) {
    throw new Error('Database pool is required for search');
  }

  async function search(query, limit = 8) {
    if (!query || !query.trim()) {
      return [];
    }

    const embeddingsProvider = await embeddingsProviderFactory();
    const embedding = await embeddingsProvider.embedQuery(query);
    const vectorParam = formatEmbeddingForInsert(embedding);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 8;

    const { rows } = await activePool.query(
      `
        SELECT document_id, page_start, page_end, text, embedding <-> $1::vector AS distance
        FROM chunks
        WHERE embedding IS NOT NULL
        ORDER BY embedding <-> $1::vector
        LIMIT $2
      `,
      [vectorParam, safeLimit]
    );

    return rows.map((row) => ({
      document_id: row.document_id,
      page_start: row.page_start,
      page_end: row.page_end,
      excerpt: row.text.length > 400 ? `${row.text.slice(0, 400)}…` : row.text,
      score: Number.parseFloat(row.distance)
    }));
  }

  return { search };
}

export default createSearchService;
