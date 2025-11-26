/**
 * Tier 2 Upload Job Processor
 *
 * Handles tier 2 PDF uploads with chapter detection and extraction
 * Supports single-chapter and multi-chapter PDFs
 */

import { detectChapterStructure } from '../../services/tier2Detection.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { StorageService } from '../../lib/storage.js';

/**
 * Process tier 2 upload - detect chapters and extract
 */
export async function processTier2UploadJob(job, { tenantHelpers, jobTracker, storageDir, storageService }) {
  const { jobId, ownerId, pdfPath, storageKey, storageLocation, originalFilename, documentId, courseId, chapter, materialType, title } = job.data;

  console.log(`[Tier2UploadProcessor] Starting tier 2 job ${jobId} for document ${documentId}`);
  console.log(`[Tier2UploadProcessor] Metadata: course=${courseId}, type=${materialType}`);

  let tempPdfPath = null;

  try {
    // Mark job as processing
    await jobTracker.startJob(ownerId, jobId);

    // Update progress: 10% - PDF saved
    await jobTracker.updateProgress(ownerId, jobId, 10);

    // Get PDF path for processing
    let processingPath = pdfPath; // Legacy path

    // If using storage service, download PDF to temp file
    if (storageKey) {
      const storage = storageService || new StorageService({ storageDir });

      console.log(`[Tier2UploadProcessor] Downloading PDF from storage: ${storageKey}`);

      const pdfBuffer = await storage.download(storageKey);

      tempPdfPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);
      await fs.writeFile(tempPdfPath, pdfBuffer);

      processingPath = tempPdfPath;

      console.log(`[Tier2UploadProcessor] PDF downloaded to temp file: ${tempPdfPath}`);
    }

    console.log(`[Tier2UploadProcessor] Detecting chapter structure from ${processingPath}`);

    // Update progress: 20% - Starting detection
    await jobTracker.updateProgress(ownerId, jobId, 20);

    // Detect if single or multi-chapter
    const detection = await detectChapterStructure(processingPath);

    console.log(`[Tier2UploadProcessor] Detection result: ${detection.type}`);

    // Update progress: 60% - Detection complete
    await jobTracker.updateProgress(ownerId, jobId, 60);

    const documentTitle = title || originalFilename.replace('.pdf', '');

    if (detection.type === 'single') {
      // Single chapter - save immediately with chapter number
      console.log(`[Tier2UploadProcessor] Single chapter detected: Chapter ${detection.chapterNumber} - ${detection.chapterTitle}`);

      await tenantHelpers.withTenant(ownerId, async (client) => {
        // Insert document with chapter info - use chapter number for proper grouping in UI
        await client.query(
          `INSERT INTO documents (id, title, pages, owner_id, course_id, chapter, material_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [documentId, documentTitle, 1, ownerId, courseId, String(detection.chapterNumber), materialType || 'textbook']
        );

        console.log(`[Tier2UploadProcessor] Document created: ${documentId}`);

        // Update progress: 70% - Document created
        await jobTracker.updateProgress(ownerId, jobId, 70);

        // Insert chapter markdown
        await client.query(
          `INSERT INTO chapter_markdown
           (owner_id, document_id, course_id, chapter_number, chapter_title, markdown_content, page_start, page_end)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            ownerId,
            documentId,
            courseId,
            detection.chapterNumber,
            detection.chapterTitle,
            detection.markdown,
            null, // page_start unknown for single chapter
            null  // page_end unknown for single chapter
          ]
        );

        console.log(`[Tier2UploadProcessor] Chapter markdown saved: Chapter ${detection.chapterNumber}`);
      });

      // Update progress: 100% - Complete
      await jobTracker.updateProgress(ownerId, jobId, 100);

      console.log(`[Tier2UploadProcessor] ✅ Single chapter job ${jobId} complete`);

      // Mark job as completed
      await jobTracker.completeJob(ownerId, jobId, {
        document_id: documentId,
        title: documentTitle,
        type: 'single_chapter',
        chapter_number: detection.chapterNumber,
        chapter_title: detection.chapterTitle,
        course_id: courseId
      });

      return {
        document_id: documentId,
        title: documentTitle,
        type: 'single_chapter',
        chapter: {
          number: detection.chapterNumber,
          title: detection.chapterTitle
        }
      };
    } else {
      // Multi-chapter - save document and wait for user selection
      console.log(`[Tier2UploadProcessor] Multi-chapter detected: ${detection.chapters.length} chapters`);

      await tenantHelpers.withTenant(ownerId, async (client) => {
        // Insert document without chapter info
        await client.query(
          `INSERT INTO documents (id, title, pages, owner_id, course_id, chapter, material_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [documentId, documentTitle, detection.chapters.length, ownerId, courseId, null, materialType || 'textbook']
        );

        console.log(`[Tier2UploadProcessor] Document created: ${documentId} with ${detection.chapters.length} chapters`);
      });

      // Update progress: 100% - Detection complete, waiting for user
      await jobTracker.updateProgress(ownerId, jobId, 100);

      console.log(`[Tier2UploadProcessor] ✅ Multi-chapter detection job ${jobId} complete`);

      // Mark job as completed with detection results
      await jobTracker.completeJob(ownerId, jobId, {
        document_id: documentId,
        title: documentTitle,
        type: 'multi_chapter',
        chapters: detection.chapters,
        course_id: courseId,
        storage_key: storageKey || pdfPath, // Need this for later extraction
        awaiting_user_selection: true
      });

      return {
        document_id: documentId,
        title: documentTitle,
        type: 'multi_chapter',
        chapters: detection.chapters,
        storage_key: storageKey || pdfPath
      };
    }
  } catch (error) {
    console.error(`[Tier2UploadProcessor] ❌ Job ${jobId} failed:`, error);

    // Mark job as failed
    await jobTracker.failJob(ownerId, jobId, error);

    throw error;
  } finally {
    // Cleanup temp file if created
    if (tempPdfPath) {
      try {
        await fs.rm(tempPdfPath, { force: true });
        console.log(`[Tier2UploadProcessor] Cleaned up temp file: ${tempPdfPath}`);
      } catch (cleanupError) {
        console.warn(`[Tier2UploadProcessor] Failed to cleanup temp file: ${cleanupError.message}`);
      }
    }
  }
}
