import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db/index.js';
import { extractTextFromPdf } from './extractor.js';
import { chunkPages } from './chunker.js';
import { getEmbeddingsProvider } from '../embeddings/provider.js';
import { formatEmbeddingForInsert } from '../embeddings/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage');

export function createPdfIngestionService(options = {}) {
  const activePool = options.pool ?? pool;
  const extractor = options.extractText ?? extractTextFromPdf;
  const chunker = options.chunker ?? chunkPages;
  const storageDir = options.storageDir ?? DEFAULT_STORAGE_DIR;
  const embeddingsProviderFactory = options.embeddingsProviderFactory ?? getEmbeddingsProvider;

  if (!activePool) {
    throw new Error('Database pool is required for ingestion');
  }

  async function persistChunks(client, documentId, chunks, embeddings) {
    if (!chunks.length) {
      return;
    }

    const values = [];
    const params = [];
    let index = 1;

    chunks.forEach((chunk, i) => {
      values.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $${index + 4}, $${index + 5}::vector)`);
      params.push(
        documentId,
        chunk.pageStart,
        chunk.pageEnd,
        chunk.text,
        chunk.tokenCount,
        formatEmbeddingForInsert(embeddings[i])
      );
      index += 6;
    });

    const query = `
      INSERT INTO chunks (document_id, page_start, page_end, text, token_count, embedding)
      VALUES ${values.join(', ')}
    `;

    await client.query(query, params);
  }

  async function ingest(fileBuffer, originalName) {
    if (!fileBuffer) {
      throw new Error('Missing file buffer for ingestion');
    }

    const documentId = randomUUID();
    const safeName = originalName ? originalName.replace(/\s+/g, ' ').trim() : 'Untitled Document';
    const storagePath = path.join(storageDir, `${documentId}.pdf`);

    await fs.mkdir(storageDir, { recursive: true });
    await fs.writeFile(storagePath, fileBuffer);

    let pages;

    try {
      pages = await extractor(storagePath, options.extractOptions || {});
    } catch (error) {
      await fs.rm(storagePath, { force: true });
      throw error;
    }

    const pageCount = pages.length;
    const chunks = chunker(pages);
    const embeddingsProvider = await embeddingsProviderFactory();
    const embeddings = chunks.length
      ? await embeddingsProvider.embedDocuments(chunks.map((chunk) => chunk.text))
      : [];

    const client = await activePool.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO documents (id, title, pages) VALUES ($1, $2, $3)',
        [documentId, safeName, pageCount]
      );
      await persistChunks(client, documentId, chunks, embeddings);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      await client.query('DELETE FROM documents WHERE id = $1', [documentId]);
      await fs.rm(storagePath, { force: true });
      throw error;
    } finally {
      client.release();
    }

    return { documentId, pageCount, chunkCount: chunks.length, storagePath };
  }

  return { ingest };
}

export default createPdfIngestionService;
