import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryPool } from './utils/memoryPool.js';
import { createTenantHelpers } from '../src/db/tenant.js';
import { formatEmbeddingForInsert } from '../src/embeddings/utils.js';

const USER_ONE = '00000000-0000-0000-0000-000000000001';
const USER_TWO = '00000000-0000-0000-0000-000000000002';

async function seedDocument(tenantHelpers, ownerId, text) {
  const documentId = randomUUID();
  const vector = formatEmbeddingForInsert([0.1, 0.2, 0.3]);

  await tenantHelpers.withTenant(ownerId, async (client) => {
    await client.query('INSERT INTO documents (id, title, pages, owner_id) VALUES ($1, $2, $3, $4)', [
      documentId,
      'Doc',
      1,
      ownerId
    ]);

    await client.query(
      'INSERT INTO chunks (document_id, page_start, page_end, text, token_count, embedding, owner_id) VALUES ($1, $2, $3, $4, $5, $6::vector, $7)',
      [documentId, 1, 1, text, text.split(/\s+/).length, vector, ownerId]
    );
  });

  return documentId;
}

describe('simulated row level security', () => {
  it('prevents cross-tenant reads and mismatched inserts', async () => {
    const pool = createMemoryPool();
    const tenantHelpers = createTenantHelpers(pool);

    const docOne = await seedDocument(tenantHelpers, USER_ONE, 'user one content');
    await seedDocument(tenantHelpers, USER_TWO, 'user two content');

    const listForOne = await tenantHelpers.withTenant(USER_ONE, (client) =>
      client.query(
        'SELECT id, title, pages, created_at FROM documents WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 100',
        [USER_ONE]
      )
    );

    assert.equal(listForOne.rows.length, 1);
    assert.equal(listForOne.rows[0].id, docOne);

    const listForTwo = await tenantHelpers.withTenant(USER_TWO, (client) =>
      client.query(
        'SELECT id, title, pages, created_at FROM documents WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 100',
        [USER_ONE]
      )
    );

    assert.equal(listForTwo.rows.length, 0);

    await assert.rejects(
      tenantHelpers.withTenant(USER_TWO, (client) =>
        client.query('INSERT INTO documents (id, title, pages, owner_id) VALUES ($1, $2, $3, $4)', [
          randomUUID(),
          'Hijack',
          1,
          USER_ONE
        ])
      ),
      /row-level security/i
    );

    await assert.rejects(
      tenantHelpers.withTenant(USER_TWO, (client) =>
        client.query(
          'INSERT INTO chunks (document_id, page_start, page_end, text, token_count, embedding, owner_id) VALUES ($1, $2, $3, $4, $5, $6::vector, $7)',
          [docOne, 1, 1, 'bad actor', 2, formatEmbeddingForInsert([0.4, 0.5, 0.6]), USER_ONE]
        )
      ),
      /row-level security/i
    );
  });
});
