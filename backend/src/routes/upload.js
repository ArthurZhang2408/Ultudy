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

  // NEW ENDPOINT: LLM-based structured extraction (ASYNC)
  // This endpoint is used when PDF_UPLOAD_STRATEGY=vision in .env
  // Returns immediately with a job ID, processing happens in background
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

      // Create job in database
      const jobId = await options.jobTracker.createJob(ownerId, 'upload_pdf', {
        document_id: documentId,
        original_filename: req.file.originalname,
        pdf_path: pdfPath
      });

      // Queue the job for background processing
      await options.uploadQueue.add({
        jobId,
        ownerId,
        documentId,
        pdfPath,
        originalFilename: req.file.originalname
      });

      console.log(`[upload/pdf-structured] ✅ Job ${jobId} queued for document ${documentId}`);

      // Return immediately with job ID
      res.json({
        job_id: jobId,
        document_id: documentId,
        status: 'queued',
        message: 'Upload queued for processing'
      });
    } catch (error) {
      console.error('[upload/pdf-structured] ❌ Error:', error);
      res.status(500).json({ error: error.message || 'Failed to queue upload' });
    }
  });

  return router;
}
