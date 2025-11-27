import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../lib/storage.js';
import { checkUsageLimit, enforcePdfLimit } from '../middleware/tierCheck.js';
import { trackPdfUpload } from '../services/usageTracking.js';

const upload = multer({ storage: multer.memoryStorage() });

export default function createUploadRouter(options = {}) {
  const router = express.Router();

  // Initialize storage service (uses S3 if configured, otherwise local filesystem)
  const storageService = options.storageService || new StorageService({ storageDir: options.storageDir });

  // LLM-based structured extraction (ASYNC)
  // This endpoint is used when PDF_UPLOAD_STRATEGY=vision in .env
  // Returns immediately with a job ID, processing happens in background
  router.post('/pdf-structured', upload.single('file'), checkUsageLimit, enforcePdfLimit, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing PDF file' });
    }

    try {
      const ownerId = req.userId || 'dev-user-001';
      const documentId = randomUUID();
      const storageKey = StorageService.generatePdfKey(ownerId, documentId);

      // Get PDF page count for tracking (estimate from file size if needed)
      // TODO: Extract actual page count - for now use 0 as placeholder
      const estimatedPages = 0;

      // Extract metadata from form data
      const courseId = req.body.course_id || null;
      const chapter = req.body.chapter || null;
      const materialType = req.body.material_type || null;
      const title = req.body.title || null;

      console.log('[upload/pdf-structured] Upload initiated');
      console.log('[upload/pdf-structured] User ID:', ownerId);
      console.log('[upload/pdf-structured] Document ID:', documentId);
      console.log('[upload/pdf-structured] Saving PDF to storage...');
      console.log('[upload/pdf-structured] Storage type:', storageService.getType());
      console.log('[upload/pdf-structured] Metadata:', { courseId, chapter, materialType, title });

      // Save PDF to storage (S3 or local filesystem)
      const uploadResult = await storageService.upload(storageKey, req.file.buffer, {
        contentType: 'application/pdf',
        metadata: {
          originalFilename: req.file.originalname,
          courseId: courseId || '',
          documentId
        }
      });

      console.log(`[upload/pdf-structured] PDF saved:`, {
        storageKey,
        location: uploadResult.location,
        backend: uploadResult.backend
      });

      // Create job in database with metadata
      const jobId = await options.jobTracker.createJob(ownerId, 'upload_pdf', {
        document_id: documentId,
        original_filename: req.file.originalname,
        storage_key: storageKey,
        storage_location: uploadResult.location,
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
        storageKey,
        storageLocation: uploadResult.location,
        originalFilename: req.file.originalname,
        courseId,
        chapter,
        materialType,
        title
      });

      console.log(`[upload/pdf-structured] ✅ Job ${jobId} queued for document ${documentId}`);

      // Track PDF upload for usage limits
      await trackPdfUpload(ownerId, estimatedPages);

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
