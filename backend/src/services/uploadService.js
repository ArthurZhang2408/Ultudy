/**
 * Upload Service
 *
 * Handles PDF upload with immediate response and async processing
 * Decouples file upload from LLM extraction for better performance
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('UploadService');

export class UploadService {
  constructor({ storageDir, tenantHelpers, jobTracker, uploadQueue }) {
    this.storageDir = storageDir;
    this.tenantHelpers = tenantHelpers;
    this.jobTracker = jobTracker;
    this.uploadQueue = uploadQueue;
  }

  /**
   * Upload PDF and create document record immediately
   * Returns document info without waiting for LLM extraction
   */
  async uploadPDF({ file, ownerId, courseId, chapter, materialType, title }) {
    const documentId = randomUUID();
    const ownerDir = path.join(this.storageDir, ownerId);
    const pdfPath = path.join(ownerDir, `${documentId}.pdf`);

    logger.info('Starting PDF upload', {
      documentId,
      courseId,
      filename: file.originalname,
      size: file.size
    });

    try {
      // 1. Save PDF to storage
      await fs.mkdir(ownerDir, { recursive: true });
      await fs.writeFile(pdfPath, file.buffer);

      logger.info('PDF saved to storage', { pdfPath });

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
        pdf_path: pdfPath,
        course_id: courseId,
        chapter: chapter,
        material_type: materialType,
        title: title
      });

      await this.uploadQueue.add({
        jobId,
        ownerId,
        documentId,
        pdfPath,
        originalFilename: file.originalname,
        courseId,
        chapter,
        materialType,
        title
      });

      logger.info('Extraction job queued', { jobId, documentId });

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
        await fs.rm(pdfPath, { force: true });
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
