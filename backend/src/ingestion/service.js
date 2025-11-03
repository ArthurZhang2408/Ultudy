import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db/index.js';
import { createTenantHelpers } from '../db/tenant.js';
import { extractTextFromPdf } from './extractor.js';
import { chunkPages } from './chunker.js';
import { getEmbeddingsProvider } from '../embeddings/provider.js';
import { formatEmbeddingForInsert } from '../embeddings/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage');
const DEFAULT_OWNER_ID = '00000000-0000-0000-0000-000000000001';

export function createPdfIngestionService(options = {}) {
  const activePool = options.pool ?? pool;
  const extractor = options.extractText ?? extractTextFromPdf;
  const chunker = options.chunker ?? chunkPages;
  const storageDir = options.storageDir ?? DEFAULT_STORAGE_DIR;
  const embeddingsProviderFactory =
    options.embeddingsProviderFactory ?? getEmbeddingsProvider;

  if (!activePool) {
    throw new Error('Database pool is required for ingestion');
  }

  const tenantHelpers =
    options.tenantHelpers ?? (activePool ? createTenantHelpers(activePool) : null);

  if (!tenantHelpers) {
    throw new Error('Tenant helpers are required for ingestion');
  }

  async function persistChunks(client, documentId, ownerId, chunks, embeddings) {
    if (!chunks.length) {
      return;
    }

    const values = [];
    const params = [];
    let index = 1;

    chunks.forEach((chunk, i) => {
      values.push(
        `($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $${index + 4}, $${index + 5}::vector, $${index + 6})`
      );
      params.push(
        documentId,
        chunk.pageStart,
        chunk.pageEnd,
        chunk.text,
        chunk.tokenCount,
        formatEmbeddingForInsert(embeddings[i]),
        ownerId
      );
      index += 7;
    });

    const query = `
      INSERT INTO chunks (document_id, page_start, page_end, text, token_count, embedding, owner_id)
      VALUES ${values.join(', ')}
    `;

    await client.query(query, params);
  }

  async function ingest(fileBuffer, originalName, ownerId) {
    if (!fileBuffer) {
      throw new Error('Missing file buffer for ingestion');
    }

    const documentId = randomUUID();
    const safeName = originalName ? originalName.replace(/\s+/g, ' ').trim() : 'Untitled Document';
    const ownerSegment =
      typeof ownerId === 'string' && ownerId ? ownerId.toLowerCase() : DEFAULT_OWNER_ID;
    const ownerDir = path.join(storageDir, ownerSegment);
    const storagePath = path.join(ownerDir, `${documentId}.pdf`);

    await fs.mkdir(ownerDir, { recursive: true });
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
    const embedStart = Date.now();
    const embeddings = chunks.length
      ? await embeddingsProvider.embedDocuments(chunks.map((chunk) => chunk.text))
      : [];
    const embedDuration = Date.now() - embedStart;
    const sampleVector = embeddings[0];
    const configuredDim = Number.parseInt(process.env.GEMINI_EMBED_DIM || '3072', 10);
    const dimension =
      typeof sampleVector?.length === 'number' && Number.isFinite(sampleVector.length)
        ? sampleVector.length
        : Number.isFinite(configuredDim) && configuredDim > 0
          ? configuredDim
          : 0;

    console.info(
      `[ingest] provider=${embeddingsProvider?.name || 'unknown'} file="${safeName}" chunks=${chunks.length} dim=${dimension} time=${embedDuration}ms`
    );

    try {
      await tenantHelpers.withTenant(ownerSegment, async (client) => {
        await client.query(
          'INSERT INTO documents (id, title, pages, owner_id) VALUES ($1, $2, $3, $4)',
          [documentId, safeName, pageCount, ownerSegment]
        );
        await persistChunks(client, documentId, ownerSegment, chunks, embeddings);
      });
    } catch (error) {
      await fs.rm(storagePath, { force: true });
      throw error;
    }

    return { documentId, pageCount, chunkCount: chunks.length, storagePath };
  }

  return { ingest };
}

export default createPdfIngestionService;
