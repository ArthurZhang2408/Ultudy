/**
 * Upload Service
 *
 * Handles PDF upload with immediate response and async processing
 * Decouples file upload from LLM extraction for better performance
 *
 * Supports both local filesystem and S3 storage
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '../lib/logger.js';
import { StorageService } from '../lib/storage.js';

const logger = createLogger('UploadService');

export class UploadService {
  constructor({ storageDir, tenantHelpers, jobTracker, uploadQueue, storageService }) {
    this.storageService = storageService || new StorageService({ storageDir });
    this.tenantHelpers = tenantHelpers;
    this.jobTracker = jobTracker;
    this.uploadQueue = uploadQueue;

    logger.info('UploadService initialized', {
      storageType: this.storageService.getType()
    });
  }

  /**
   * Upload PDF and create document record immediately
   * Returns document info without waiting for LLM extraction
   */
  async uploadPDF({ file, ownerId, courseId, chapter, materialType, title }) {
    const documentId = randomUUID();
    const storageKey = StorageService.generatePdfKey(ownerId, documentId);

    logger.info('Starting PDF upload', {
      documentId,
      courseId,
      filename: file.originalname,
      size: file.size,
      storageType: this.storageService.getType()
    });

    try {
      // 1. Save PDF to storage (S3 or local filesystem)
      const uploadResult = await this.storageService.upload(storageKey, file.buffer, {
        contentType: 'application/pdf',
        metadata: {
          originalFilename: file.originalname,
          courseId: courseId || '',
          documentId
        }
      });

      logger.info('PDF saved to storage', {
        storageKey,
        location: uploadResult.location,
        backend: uploadResult.backend
      });

      // 2. Create document record immediately (shows as "processing" to user)
      await this.tenantHelpers.withTenant(ownerId, async (client) => {
        await client.query(
          `INSERT INTO documents (id, title, pages, owner_id, course_id, chapter, material_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            documentId,
            title || file.originalname.replace('.pdf', ''),
            0, // Will be updated after extraction
            ownerId,
            courseId || null,
            chapter || null,
            materialType || null
          ]
        );
      });

      logger.info('Document record created', { documentId });

      // 3. Queue extraction job for async processing
      const jobId = await this.jobTracker.createJob(ownerId, 'upload_pdf', {
        document_id: documentId,
        original_filename: file.originalname,
        storage_key: storageKey,
        storage_location: uploadResult.location,
        course_id: courseId,
        chapter: chapter,
        material_type: materialType,
        title: title
      });

      await this.uploadQueue.add({
        jobId,
        ownerId,
        documentId,
        storageKey,
        storageLocation: uploadResult.location,
        originalFilename: file.originalname,
        courseId,
        chapter,
        materialType,
        title
      });

      logger.info('Extraction job queued', { jobId, documentId, storageKey });

      // 4. Return immediately - user can see document while processing
      return {
        documentId,
        jobId,
        status: 'processing',
        message: 'Upload successful. Extraction in progress.'
      };
    } catch (error) {
      logger.error('Upload failed', { error: error.message, documentId });

      // Cleanup on failure
      try {
        await this.storageService.delete(storageKey);
        logger.info('Cleaned up failed upload', { storageKey });
      } catch (cleanupError) {
        logger.warn('Cleanup failed', { error: cleanupError.message });
      }

      throw error;
    }
  }

  /**
   * Get upload status and progress
   */
  async getUploadStatus(ownerId, documentId) {
    try {
      const document = await this.tenantHelpers.withTenant(ownerId, async (client) => {
        const { rows } = await client.query(
          'SELECT id, title, pages, course_id, chapter, material_type, created_at FROM documents WHERE id = $1 AND owner_id = $2',
          [documentId, ownerId]
        );
        return rows[0] || null;
      });

      if (!document) {
        return { status: 'not_found' };
      }

      // Check if extraction is complete (pages > 0 means sections exist)
      if (document.pages > 0) {
        return {
          status: 'completed',
          document
        };
      }

      // Check job status
      const jobs = await this.jobTracker.getActiveJobs(ownerId, 'upload_pdf');
      const job = jobs.find(j => j.metadata?.document_id === documentId);

      if (job) {
        return {
          status: 'processing',
          progress: job.progress || 0,
          jobId: job.id,
          document
        };
      }

      return {
        status: 'pending',
        document
      };
    } catch (error) {
      logger.error('Failed to get upload status', { error: error.message, documentId });
      throw error;
    }
  }
}

export function createUploadService(options) {
  return new UploadService(options);
}
