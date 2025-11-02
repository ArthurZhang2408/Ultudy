import pool from '../db/index.js';
import { getEmbeddingsProvider } from '../embeddings/provider.js';
import { formatEmbeddingForInsert } from '../embeddings/utils.js';

const DEFAULT_OWNER_ID = '00000000-0000-0000-0000-000000000001';

export function createSearchService(options = {}) {
  const activePool = options.pool ?? pool;
  const embeddingsProviderFactory = options.embeddingsProviderFactory ?? getEmbeddingsProvider;

  if (!activePool) {
    throw new Error('Database pool is required for search');
  }

  async function search(query, limit = 8, ownerId = DEFAULT_OWNER_ID) {
    if (!query || !query.trim()) {
      return [];
    }

    const embeddingsProvider = await embeddingsProviderFactory();
    const embedding = await embeddingsProvider.embedQuery(query);
    const vectorParam = formatEmbeddingForInsert(embedding);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 8;

    const ownerFilter =
      typeof ownerId === 'string' && ownerId ? ownerId.toLowerCase() : DEFAULT_OWNER_ID;

    const { rows } = await activePool.query(
      `
        SELECT c.document_id, c.page_start, c.page_end, c.text, c.embedding <-> $1::vector AS distance
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE c.embedding IS NOT NULL AND d.owner_id = $2
        ORDER BY c.embedding <-> $1::vector
        LIMIT $3
      `,
      [vectorParam, ownerFilter, safeLimit]
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
