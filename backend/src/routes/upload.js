import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../lib/storage.js';

const upload = multer({ storage: multer.memoryStorage() });

export default function createUploadRouter(options = {}) {
  const router = express.Router();

  // Initialize storage service (uses S3 if configured, otherwise local filesystem)
  const storageService = options.storageService || new StorageService({ storageDir: options.storageDir });

  // LLM-based structured extraction (ASYNC)
  // This endpoint is used when PDF_UPLOAD_STRATEGY=vision in .env
  // Returns immediately with a job ID, processing happens in background
  // Now supports multiple files
  router.post('/pdf-structured', upload.array('files', 50), async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Missing PDF files' });
    }

    try {
      const ownerId = req.userId || 'dev-user-001';
      const documentId = randomUUID();

      // Extract metadata from form data
      const courseId = req.body.course_id || null;
      const materialType = req.body.material_type || null;
      const title = req.body.title || null;

      console.log('[upload/pdf-structured] Saving PDFs to storage...');
      console.log('[upload/pdf-structured] Storage type:', storageService.getType());
      console.log('[upload/pdf-structured] File count:', req.files.length);
      console.log('[upload/pdf-structured] Metadata:', { courseId, materialType, title });

      // Save all PDFs to storage
      const uploadedFiles = [];
      for (const file of req.files) {
        const fileId = randomUUID();
        const storageKey = StorageService.generatePdfKey(ownerId, fileId);

        const uploadResult = await storageService.upload(storageKey, file.buffer, {
          contentType: 'application/pdf',
          metadata: {
            originalFilename: file.originalname,
            courseId: courseId || '',
            documentId,
            fileId
          }
        });

        uploadedFiles.push({
          fileId,
          originalFilename: file.originalname,
          storageKey,
          storageLocation: uploadResult.location,
          size: file.size
        });

        console.log(`[upload/pdf-structured] File saved:`, {
          filename: file.originalname,
          storageKey,
          location: uploadResult.location
        });
      }

      // Create job in database with metadata
      const jobId = await options.jobTracker.createJob(ownerId, 'upload_pdf', {
        document_id: documentId,
        file_count: req.files.length,
        files: uploadedFiles,
        course_id: courseId,
        material_type: materialType,
        title: title
      });

      // Queue the job for background processing with metadata
      await options.uploadQueue.add({
        jobId,
        ownerId,
        documentId,
        files: uploadedFiles,
        courseId,
        materialType,
        title
      });

      console.log(`[upload/pdf-structured] ✅ Job ${jobId} queued for document ${documentId} with ${uploadedFiles.length} files`);

      // Return immediately with job ID
      res.json({
        job_id: jobId,
        document_id: documentId,
        status: 'queued',
        message: `Upload queued for processing (${uploadedFiles.length} files)`
      });
    } catch (error) {
      console.error('[upload/pdf-structured] ❌ Error:', error);
      res.status(500).json({ error: error.message || 'Failed to queue upload' });
    }
  });

  return router;
}
