import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMemoryPool } from './utils/memoryPool.js';
import { getEmbeddingsProvider } from '../src/embeddings/provider.js';
import { formatEmbeddingForInsert } from '../src/embeddings/utils.js';

const USER_ONE = '00000000-0000-0000-0000-000000000001';
const USER_TWO = '00000000-0000-0000-0000-000000000002';

async function seedDocument(pool, provider, ownerId, text, options = {}) {
  const documentId = options.documentId || randomUUID();
  const title = options.title || 'Seed Document';
  const pages = options.pages || 5;
  const embedding = await provider.embedDocuments([text]);
  const vector = formatEmbeddingForInsert(embedding[0]);

  await pool.query('INSERT INTO documents (id, title, pages, owner_id) VALUES ($1, $2, $3, $4)', [
    documentId,
    title,
    pages,
    ownerId
  ]);

  await pool.query(
    'INSERT INTO chunks (document_id, page_start, page_end, text, token_count, embedding) VALUES ($1, $2, $3, $4, $5, $6::vector)',
    [
      documentId,
      options.pageStart || 1,
      options.pageEnd || 2,
      text,
      text.split(/\s+/).length,
      vector
    ]
  );

  return documentId;
}

describe('study endpoints', () => {
  beforeEach(() => {
    process.env.EMBEDDINGS_PROVIDER = 'mock';
    process.env.LLM_PROVIDER = 'mock';
  });

  it('builds lessons scoped per user', async () => {
    const pool = createMemoryPool();
    const provider = await getEmbeddingsProvider();

    const docOne = await seedDocument(
      pool,
      provider,
      USER_ONE,
      'Laplace transforms capture exponential responses and stabilize circuit analysis.'
    );
    await seedDocument(
      pool,
      provider,
      USER_TWO,
      'Photosynthesis converts light energy into chemical energy within plant cells.'
    );

    const app = createApp({ pool, isDatabaseConfigured: true });

    const responseOne = await request(app)
      .post('/study/lesson')
      .set('X-User-Id', USER_ONE)
      .send({ query: 'transform analysis', topic: 'Transform review', k: 4 });

    assert.equal(responseOne.status, 200);
    assert.equal(responseOne.body.topic, 'Transform review');
    assert.ok(responseOne.body.summary.length > 0);
    assert.ok(responseOne.body.sources.every((source) => source.document_id === docOne));

    const responseTwo = await request(app)
      .post('/study/lesson')
      .set('X-User-Id', USER_TWO)
      .send({ query: 'photosynthesis basics', k: 4 });

    assert.equal(responseTwo.status, 200);
    assert.ok(responseTwo.body.topic.includes('photosynthesis basics'));
    assert.ok(responseTwo.body.sources.every((source) => source.document_id !== docOne));
  });

  it('generates MCQs scoped per user', async () => {
    const pool = createMemoryPool();
    const provider = await getEmbeddingsProvider();

    const docOne = await seedDocument(
      pool,
      provider,
      USER_ONE,
      'Eigenvalues identify stretching factors for linear transformations and stability.'
    );
    await seedDocument(
      pool,
      provider,
      USER_TWO,
      'In ecology, trophic levels describe energy transfer between organisms.'
    );

    const app = createApp({ pool, isDatabaseConfigured: true });

    const responseOne = await request(app)
      .post('/practice/mcq')
      .set('X-User-Id', USER_ONE)
      .send({ topic: 'Linear algebra', n: 3, difficulty: 'easy' });

    assert.equal(responseOne.status, 200);
    assert.equal(responseOne.body.items.length, 3);
    assert.ok(responseOne.body.items.every((item) => item.source.document_id === docOne));

    const responseTwo = await request(app)
      .post('/practice/mcq')
      .set('X-User-Id', USER_TWO)
      .send({ topic: 'Ecology basics', n: 2 });

    assert.equal(responseTwo.status, 200);
    assert.equal(responseTwo.body.items.length, 2);
    assert.ok(responseTwo.body.items.every((item) => item.source.document_id !== docOne));
  });
});
