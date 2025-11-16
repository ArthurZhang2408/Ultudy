import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createPdfIngestionService from '../ingestion/service.js';

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

  // DEPRECATED ENDPOINT: Legacy PDF upload with simple text extraction
  // This endpoint is kept for backwards compatibility but should not be used for new integrations.
  // Use POST /upload/pdf-structured instead for vision-based LLM extraction with sections and concepts.
  // This endpoint will be removed in a future version.
  router.post('/pdf', upload.single('file'), async (req, res) => {
    console.warn('[DEPRECATED] POST /upload/pdf is deprecated. Use /upload/pdf-structured instead.');

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

      // Add deprecation header
      res.set('Deprecation', 'true');
      res.set('Sunset', 'Wed, 31 Dec 2025 23:59:59 GMT');
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

      // Extract metadata from form data
      const courseId = req.body.course_id || null;
      const chapter = req.body.chapter || null;
      const materialType = req.body.material_type || null;
      const title = req.body.title || null;

      console.log('[upload/pdf-structured] Saving PDF to storage...');
      console.log('[upload/pdf-structured] Metadata:', { courseId, chapter, materialType, title });

      // Save PDF to storage
      await fs.mkdir(ownerDir, { recursive: true });
      await fs.writeFile(pdfPath, req.file.buffer);

      console.log(`[upload/pdf-structured] PDF saved: ${pdfPath}`);

      // Create job in database with metadata
      const jobId = await options.jobTracker.createJob(ownerId, 'upload_pdf', {
        document_id: documentId,
        original_filename: req.file.originalname,
        pdf_path: pdfPath,
        course_id: courseId,
        chapter: chapter,
        material_type: materialType,
        title: title
      });

      // Queue the job for background processing with metadata
      await options.uploadQueue.add({
        jobId,
        ownerId,
        documentId,
        pdfPath,
        originalFilename: req.file.originalname,
        courseId,
        chapter,
        materialType,
        title
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
