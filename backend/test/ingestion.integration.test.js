import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer\n<<>>\n%%EOF');

function parseVector(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value
    .slice(1, -1)
    .split(',')
    .map((item) => Number.parseFloat(item));
}

function euclideanDistance(a, b) {
  const length = Math.min(a.length, b.length);
  let sum = 0;

  for (let i = 0; i < length; i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

function createMemoryPool() {
  const documents = new Map();
  const chunks = [];

  async function query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
      return { rows: [] };
    }

    if (normalized.startsWith('INSERT INTO documents')) {
      documents.set(params[0], { id: params[0], title: params[1], pages: params[2] });
      return { rows: [] };
    }

    if (normalized.startsWith('INSERT INTO chunks')) {
      for (let i = 0; i < params.length; i += 6) {
        chunks.push({
          document_id: params[i],
          page_start: params[i + 1],
          page_end: params[i + 2],
          text: params[i + 3],
          token_count: params[i + 4],
          embedding: parseVector(params[i + 5])
        });
      }
      return { rows: [] };
    }

    if (normalized.startsWith('DELETE FROM chunks')) {
      const id = params[0];
      for (let i = chunks.length - 1; i >= 0; i -= 1) {
        if (chunks[i].document_id === id) {
          chunks.splice(i, 1);
        }
      }
      return { rows: [] };
    }

    if (normalized.startsWith('DELETE FROM documents')) {
      documents.delete(params[0]);
      return { rows: [] };
    }

    if (normalized.startsWith('SELECT document_id')) {
      const queryVector = parseVector(params[0]);
      const limit = params[1];
      const rows = chunks
        .map((chunk) => ({
          document_id: chunk.document_id,
          page_start: chunk.page_start,
          page_end: chunk.page_end,
          text: chunk.text,
          distance: euclideanDistance(chunk.embedding, queryVector)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);

      return { rows };
    }

    if (normalized === 'SELECT 1 AS OK') {
      return { rows: [{ ok: 1 }] };
    }

    throw new Error(`Unsupported query: ${normalized}`);
  }

  return {
    documents,
    chunks,
    query,
    async connect() {
      return {
        query,
        release() {}
      };
    }
  };
}

describe('PDF ingestion and search integration', () => {
  it('uploads, chunks, embeds, and searches', async () => {
    process.env.EMBEDDINGS_PROVIDER = 'mock';

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
