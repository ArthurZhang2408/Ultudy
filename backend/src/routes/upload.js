import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../lib/storage.js';

const upload = multer({ storage: multer.memoryStorage() });
const uploadMultiple = multer({ storage: multer.memoryStorage() }).array('files', 50); // Support up to 50 files

export default function createUploadRouter(options = {}) {
  const router = express.Router();

  // Initialize storage service (uses S3 if configured, otherwise local filesystem)
  const storageService = options.storageService || new StorageService({ storageDir: options.storageDir });

  // LLM-based structured extraction (ASYNC)
  // This endpoint is used when PDF_UPLOAD_STRATEGY=vision in .env
  // Returns immediately with a job ID, processing happens in background
  router.post('/pdf-structured', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing PDF file' });
    }

    try {
      const ownerId = req.userId || 'dev-user-001';
      const documentId = randomUUID();
      const storageKey = StorageService.generatePdfKey(ownerId, documentId);

      // Extract metadata from form data
      const courseId = req.body.course_id || null;
      const chapter = req.body.chapter || null;
      const materialType = req.body.material_type || null;
      const title = req.body.title || null;

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

  // Chapter-based upload endpoint (ASYNC) - for textbook/lecture notes with multiple files
  // Accepts multiple PDF files and processes them together to extract chapters
  // Returns immediately with a job ID, processing happens in background
  router.post('/pdf-chapters', uploadMultiple, async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No PDF files provided' });
    }

    try {
      const ownerId = req.userId || 'dev-user-001';
      const uploadBatchId = randomUUID();

      // Extract metadata from form data
      const courseId = req.body.course_id || null;
      const materialType = req.body.material_type || 'textbook'; // textbook, lecture, tutorial, exam, practice
      const title = req.body.title || null;

      console.log('[upload/pdf-chapters] Processing multiple file upload...');
      console.log('[upload/pdf-chapters] Storage type:', storageService.getType());
      console.log('[upload/pdf-chapters] Files:', req.files.length);
      console.log('[upload/pdf-chapters] Metadata:', { courseId, materialType, title });

      // Validate course_id
      if (!courseId) {
        return res.status(400).json({ error: 'course_id is required' });
      }

      // Create upload_batch record in database
      await options.tenantHelpers.withTenant(ownerId, async (client) => {
        await client.query(
          `INSERT INTO upload_batches (id, owner_id, course_id, material_type, title, processing_status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [uploadBatchId, ownerId, courseId, materialType, title]
        );
      });

      console.log(`[upload/pdf-chapters] Upload batch created: ${uploadBatchId}`);

      // Upload all PDFs to storage and prepare file metadata
      const files = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const documentId = randomUUID();
        const storageKey = StorageService.generatePdfKey(ownerId, documentId);

        console.log(`[upload/pdf-chapters] Uploading file ${i + 1}/${req.files.length}: ${file.originalname}`);

        // Save PDF to storage (S3 or local filesystem)
        await storageService.upload(storageKey, file.buffer, {
          contentType: 'application/pdf',
          metadata: {
            originalFilename: file.originalname,
            courseId: courseId || '',
            documentId,
            uploadBatchId
          }
        });

        files.push({
          storageKey,
          documentId,
          originalFilename: file.originalname
        });

        console.log(`[upload/pdf-chapters] File ${i + 1} uploaded: ${storageKey}`);
      }

      console.log(`[upload/pdf-chapters] All ${files.length} files uploaded to storage`);

      // Create job in database
      const jobId = await options.jobTracker.createJob(ownerId, 'upload_chapters', {
        upload_batch_id: uploadBatchId,
        course_id: courseId,
        material_type: materialType,
        title: title,
        file_count: files.length,
        files: files.map(f => ({
          storage_key: f.storageKey,
          document_id: f.documentId,
          original_filename: f.originalFilename
        }))
      });

      // Queue the job for background processing
      await options.uploadQueue.add({
        jobId,
        ownerId,
        uploadBatchId,
        courseId,
        materialType,
        title,
        files
      });

      console.log(`[upload/pdf-chapters] ✅ Job ${jobId} queued for batch ${uploadBatchId}`);

      // Return immediately with job ID
      res.json({
        job_id: jobId,
        upload_batch_id: uploadBatchId,
        file_count: files.length,
        status: 'queued',
        message: 'Chapter upload queued for processing'
      });
    } catch (error) {
      console.error('[upload/pdf-chapters] ❌ Error:', error);
      res.status(500).json({ error: error.message || 'Failed to queue chapter upload' });
    }
  });

  return router;
}
