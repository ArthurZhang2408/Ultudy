import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMemoryPool } from './utils/memoryPool.js';

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer\n<<>>\n%%EOF');

describe('PDF ingestion and search integration', () => {
  it('uploads, chunks, embeds, and searches', async () => {
    process.env.EMBEDDINGS_PROVIDER = 'mock';
    process.env.AUTH_MODE = 'dev';

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingestion-test-'));
    const mockPool = createMemoryPool();

    const extractor = async () => [
      { page: 1, text: 'Fourier transform pairs connect time and frequency domains.' },
      { page: 2, text: 'Laplace transform generalizes this notion for complex analysis.' }
    ];

    const app = createApp({
      pool: mockPool,
      isDatabaseConfigured: true,
      storageDir: tempDir,
      extractText: extractor
    });

    const uploadResponse = await request(app).post('/upload/pdf').attach('file', PDF_BYTES, 'sample.pdf');

    assert.equal(uploadResponse.status, 200);
    assert.ok(uploadResponse.body.document_id);

    const searchResponse = await request(app).get('/search').query({ q: 'frequency', k: 5 });

    assert.equal(searchResponse.status, 200);
    assert.ok(Array.isArray(searchResponse.body));
    assert.ok(searchResponse.body.length > 0);
    assert.ok(searchResponse.body.some((row) => row.document_id === uploadResponse.body.document_id));

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
