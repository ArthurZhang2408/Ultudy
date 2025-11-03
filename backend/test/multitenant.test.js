import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMemoryPool } from './utils/memoryPool.js';

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer\n<<>>\n%%EOF');
const USER_ONE = '00000000-0000-0000-0000-000000000001';
const USER_TWO = '00000000-0000-0000-0000-000000000002';

describe('multi-tenant request scoping', () => {
  beforeEach(() => {
    process.env.AUTH_MODE = 'dev';
  });

  it('isolates uploads, search, and listing per user', async () => {
    process.env.EMBEDDINGS_PROVIDER = 'mock';

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'multitenant-test-'));
    const pool = createMemoryPool();

    const extractor = async () => [
      { page: 1, text: 'Introduction to measure theory and sigma-algebras.' }
    ];

    const app = createApp({
      pool,
      isDatabaseConfigured: true,
      storageDir: tempDir,
      extractText: extractor
    });

    const uploadUserOne = await request(app)
      .post('/upload/pdf')
      .set('X-User-Id', USER_ONE)
      .attach('file', PDF_BYTES, 'user-one.pdf');

    assert.equal(uploadUserOne.status, 200);
    assert.ok(uploadUserOne.body.document_id);

    const uploadUserTwo = await request(app)
      .post('/upload/pdf')
      .set('X-User-Id', USER_TWO)
      .attach('file', PDF_BYTES, 'user-two.pdf');

    assert.equal(uploadUserTwo.status, 200);
    assert.ok(uploadUserTwo.body.document_id);

    const searchUserOne = await request(app)
      .get('/search')
      .set('X-User-Id', USER_ONE)
      .query({ q: 'measure', k: 5 });

    assert.equal(searchUserOne.status, 200);
    assert.ok(Array.isArray(searchUserOne.body));
    assert.ok(searchUserOne.body.some((row) => row.document_id === uploadUserOne.body.document_id));
    assert.ok(!searchUserOne.body.some((row) => row.document_id === uploadUserTwo.body.document_id));

    const searchUserTwo = await request(app)
      .get('/search')
      .set('X-User-Id', USER_TWO)
      .query({ q: 'measure', k: 5 });

    assert.equal(searchUserTwo.status, 200);
    assert.ok(Array.isArray(searchUserTwo.body));
    assert.ok(searchUserTwo.body.some((row) => row.document_id === uploadUserTwo.body.document_id));
    assert.ok(!searchUserTwo.body.some((row) => row.document_id === uploadUserOne.body.document_id));

    const listUserOne = await request(app).get('/documents').set('X-User-Id', USER_ONE);
    const listUserTwo = await request(app).get('/documents').set('X-User-Id', USER_TWO);

    assert.equal(listUserOne.status, 200);
    assert.equal(listUserTwo.status, 200);
    assert.equal(listUserOne.body.length, 1);
    assert.equal(listUserTwo.body.length, 1);
    assert.equal(listUserOne.body[0].id, uploadUserOne.body.document_id);
    assert.equal(listUserTwo.body[0].id, uploadUserTwo.body.document_id);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
