/**
 * Upload Job Processor
 *
 * Handles PDF upload and extraction in the background
 * Works with both S3 and local filesystem storage
 *
 * TESTING: Now using chapter-based extraction instead of section-based
 */

import { extractStructuredSections } from '../../ingestion/llm_extractor.js';
import { extractChapters } from '../../ingestion/llm_extractor_chapters.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { StorageService } from '../../lib/storage.js';

export async function processUploadJob(job, { tenantHelpers, jobTracker, storageDir, storageService }) {
  // Support both old (pdfPath) and new (storageKey) job formats for backward compatibility
  const { jobId, ownerId, pdfPath, storageKey, storageLocation, originalFilename, documentId, courseId, chapter, materialType, title } = job.data;

  console.log(`[UploadProcessor] Starting job ${jobId} for document ${documentId}`);
  console.log(`[UploadProcessor] Metadata: course=${courseId}, chapter=${chapter}, type=${materialType}`);
  console.log(`[UploadProcessor] Storage: ${storageKey ? 'using storage service' : 'using legacy pdfPath'}`);

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

      console.log(`[UploadProcessor] Downloading PDF from storage: ${storageKey}`);

      // Download PDF buffer from storage (S3 or local)
      const pdfBuffer = await storage.download(storageKey);

      // Write to temp file for processing
      tempPdfPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);
      await fs.writeFile(tempPdfPath, pdfBuffer);

      processingPath = tempPdfPath;

      console.log(`[UploadProcessor] PDF downloaded to temp file: ${tempPdfPath}`);
    }

    console.log(`[UploadProcessor] ========================================`);
    console.log(`[UploadProcessor] 🆕 TESTING: CHAPTER-BASED EXTRACTION`);
    console.log(`[UploadProcessor] ========================================`);
    console.log(`[UploadProcessor] PDF path: ${processingPath}`);
    console.log(`[UploadProcessor] Job ID: ${jobId}`);
    console.log(`[UploadProcessor] Document ID: ${documentId}`);

    // Update progress: 20% - Starting extraction
    await jobTracker.updateProgress(ownerId, jobId, 20);

    try {
      // 🆕 TESTING: Extract chapters with markdown format (no JSON)
      console.log(`[UploadProcessor] 📤 Calling extractChapters()...`);
      const extraction = await extractChapters(processingPath);
      console.log(`[UploadProcessor] 📥 extractChapters() completed successfully`);

      console.log(`[UploadProcessor] 🆕 Extracted ${extraction.total_chapters} chapters`);
      extraction.chapters.forEach((ch, idx) => {
        console.log(`[UploadProcessor]   Chapter ${ch.chapter_number}: "${ch.title}" (${ch.char_count} chars)`);
      });

      // Update progress: 70% - Extraction complete
      await jobTracker.updateProgress(ownerId, jobId, 70);

      // Use provided title or use first chapter title
      const documentTitle = title || extraction.chapters[0]?.title || 'Untitled Document';

    // 🆕 TESTING: Store chapters in database (using sections table)
    await tenantHelpers.withTenant(ownerId, async (client) => {
      // Insert document with metadata
      await client.query(
        `INSERT INTO documents (id, title, pages, owner_id, course_id, chapter, material_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [documentId, documentTitle, extraction.total_chapters, ownerId, courseId, chapter, materialType]
      );

      console.log(`[UploadProcessor] Document created: ${documentId} with course_id=${courseId}, chapter=${chapter}`);

      // Update progress: 80% - Document created
      await jobTracker.updateProgress(ownerId, jobId, 80);

      // 🆕 TESTING: Insert chapters (stored as "sections" in DB for now)
      // Each chapter becomes one row in sections table
      for (let i = 0; i < extraction.chapters.length; i++) {
        const chapterData = extraction.chapters[i];

        const { rows } = await client.query(
          `INSERT INTO sections
           (owner_id, document_id, course_id, chapter, section_number, name, description,
            markdown_text, concepts_generated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
           RETURNING id`,
          [
            ownerId,
            documentId,
            courseId,
            chapterData.chapter_number, // Store chapter number in 'chapter' field
            i + 1, // section_number for ordering
            chapterData.title, // name field
            `Chapter ${chapterData.chapter_number}: ${chapterData.title}`, // description
            chapterData.markdown // Full chapter markdown
          ]
        );

        console.log(`[UploadProcessor] 🆕 Chapter ${chapterData.chapter_number} "${chapterData.title}": ${chapterData.char_count} chars, id=${rows[0].id}`);

        // Update progress incrementally
        const chapterProgress = 80 + Math.floor((i + 1) / extraction.chapters.length * 20);
        await jobTracker.updateProgress(ownerId, jobId, chapterProgress);
      }
    });

    console.log(`[UploadProcessor] ✅ Job ${jobId} complete`);

    // Mark job as completed
    await jobTracker.completeJob(ownerId, jobId, {
      document_id: documentId,
      title: documentTitle,
      chapter_count: extraction.total_chapters, // 🆕 Changed from section_count
      course_id: courseId,
      chapter: chapter,
      material_type: materialType,
      chapters: extraction.chapters.map((ch, i) => ({ // 🆕 Changed from sections
        chapter_number: ch.chapter_number,
        title: ch.title,
        markdown_length: ch.char_count
      }))
    });

      return {
        document_id: documentId,
        title: documentTitle,
        chapter_count: extraction.total_chapters, // 🆕 Changed from section_count
        course_id: courseId,
        chapter: chapter
      };
    } catch (extractionError) {
      console.error(`[UploadProcessor] ❌ Chapter extraction failed`);
      console.error(`[UploadProcessor] Error type: ${extractionError.constructor.name}`);
      console.error(`[UploadProcessor] Error message: ${extractionError.message}`);
      console.error(`[UploadProcessor] Error stack:`, extractionError.stack);

      // Re-throw with more context
      throw new Error(`Chapter extraction failed: ${extractionError.message}`);
    }
  } catch (error) {
    console.error(`[UploadProcessor] ❌ Job ${jobId} failed:`, error);
    console.error(`[UploadProcessor] Full error:`, error);

    // Mark job as failed
    await jobTracker.failJob(ownerId, jobId, error);

    throw error;
  } finally {
    // Cleanup temp file if created
    if (tempPdfPath) {
      try {
        await fs.rm(tempPdfPath, { force: true });
        console.log(`[UploadProcessor] Cleaned up temp file: ${tempPdfPath}`);
      } catch (cleanupError) {
        console.warn(`[UploadProcessor] Failed to cleanup temp file:`, cleanupError);
      }
    }
  }
}
