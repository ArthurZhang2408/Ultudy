import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createPdfIngestionService from '../ingestion/service.js';
import { extractStructuredSections } from '../ingestion/llm_extractor.js';

const upload = multer({ storage: multer.memoryStorage() });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'storage');

export default function createUploadRouter(options = {}) {
  const router = express.Router();
  const ingestionService = options.ingestionService || createPdfIngestionService({
    pool: options.pool,
    storageDir: options.storageDir,
    extractText: options.extractText,
    chunker: options.chunker,
    embeddingsProviderFactory: options.embeddingsProviderFactory,
    extractOptions: options.extractOptions,
    tenantHelpers: options.tenantHelpers
  });

  // OLD ENDPOINT: Keep for backwards compatibility
  router.post('/pdf', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Missing PDF file' });
      return;
    }

    try {
      const ownerId = req.userId;
      const result = await ingestionService.ingest(
        req.file.buffer,
        req.file.originalname,
        ownerId
      );
      res.json({ document_id: result.documentId, pages: result.pageCount, chunks: result.chunkCount });
    } catch (error) {
      console.error('Failed to ingest PDF', error);
      res.status(500).json({ error: 'Failed to ingest PDF' });
    }
  });

  // NEW ENDPOINT: LLM-based structured extraction
  // This endpoint is used when PDF_UPLOAD_STRATEGY=vision in .env
  router.post('/pdf-structured', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing PDF file' });
    }

    try {
      const ownerId = req.userId || 'dev-user-001';
      const documentId = randomUUID();
      const storageDir = options.storageDir || DEFAULT_STORAGE_DIR;
      const ownerDir = path.join(storageDir, ownerId);
      const pdfPath = path.join(ownerDir, `${documentId}.pdf`);

      console.log('[upload/pdf-structured] Saving PDF to storage...');

      // Save PDF to storage
      await fs.mkdir(ownerDir, { recursive: true });
      await fs.writeFile(pdfPath, req.file.buffer);

      console.log(`[upload/pdf-structured] PDF saved: ${pdfPath}`);
      console.log('[upload/pdf-structured] Extracting structured sections with LLM...');

      // Extract structured sections with LLM vision
      const extraction = await extractStructuredSections(pdfPath);

      console.log(`[upload/pdf-structured] Extracted ${extraction.sections.length} sections`);
      console.log(`[upload/pdf-structured] Title: "${extraction.title}"`);

      const tenantHelpers = options.tenantHelpers;
      if (!tenantHelpers) {
        throw new Error('Tenant helpers not available');
      }

      // Store in database
      await tenantHelpers.withTenant(ownerId, async (client) => {
        // Insert document
        await client.query(
          `INSERT INTO documents (id, title, pages, owner_id)
           VALUES ($1, $2, $3, $4)`,
          [documentId, extraction.title, extraction.sections.length, ownerId]
        );

        console.log(`[upload/pdf-structured] Document created: ${documentId}`);

        // Insert sections with LLM-generated markdown
        for (let i = 0; i < extraction.sections.length; i++) {
          const section = extraction.sections[i];

          const { rows } = await client.query(
            `INSERT INTO sections
             (owner_id, document_id, section_number, name, description,
              markdown_text, concepts_generated)
             VALUES ($1, $2, $3, $4, $5, $6, false)
             RETURNING id`,
            [
              ownerId,
              documentId,
              i + 1,
              section.name,
              section.description,
              section.markdown
            ]
          );

          console.log(`[upload/pdf-structured] Section ${i + 1} "${section.name}": ${section.markdown.length} chars, id=${rows[0].id}`);
        }
      });

      console.log('[upload/pdf-structured] ✅ Upload complete');

      res.json({
        document_id: documentId,
        title: extraction.title,
        section_count: extraction.sections.length,
        sections: extraction.sections.map((s, i) => ({
          section_number: i + 1,
          name: s.name,
          description: s.description,
          markdown_length: s.markdown.length
        }))
      });
    } catch (error) {
      console.error('[upload/pdf-structured] ❌ Error:', error);
      res.status(500).json({ error: error.message || 'Failed to extract structured sections' });
    }
  });

  return router;
}
