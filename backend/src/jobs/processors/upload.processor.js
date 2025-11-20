/**
 * Upload Job Processor
 *
 * Handles PDF upload and extraction in the background
 * Works with both S3 and local filesystem storage
 *
 * TESTING: Now using HYBRID two-phase extraction:
 *   Phase 1: Determine if single or multi-chapter
 *   Phase 2: Extract sections (split by chapter if needed)
 */

import { extractStructuredSections } from '../../ingestion/llm_extractor.js';
import { extractChapters } from '../../ingestion/llm_extractor_chapters.js';
import { extractPdfWithHybridApproach } from '../../ingestion/llm_extractor_hybrid.js';
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
    console.log(`[UploadProcessor] 🎯 TESTING: HYBRID TWO-PHASE EXTRACTION`);
    console.log(`[UploadProcessor] ========================================`);
    console.log(`[UploadProcessor] PDF path: ${processingPath}`);
    console.log(`[UploadProcessor] Job ID: ${jobId}`);
    console.log(`[UploadProcessor] Document ID: ${documentId}`);

    // Update progress: 20% - Starting extraction
    await jobTracker.updateProgress(ownerId, jobId, 20);

    try {
      // 🎯 TESTING: Hybrid extraction - analyzes structure, then extracts sections
      console.log(`[UploadProcessor] 📤 Calling extractPdfWithHybridApproach()...`);
      const extraction = await extractPdfWithHybridApproach(processingPath);
      console.log(`[UploadProcessor] 📥 extractPdfWithHybridApproach() completed successfully`);

      console.log(`[UploadProcessor] 🎯 Extracted ${extraction.total_chapters} chapter(s) with ${extraction.total_sections} total sections`);
      extraction.chapters.forEach((ch, idx) => {
        console.log(`[UploadProcessor]   Chapter ${ch.chapter_number}: "${ch.title}" (${ch.sections.length} sections)`);
      });

      // Update progress: 70% - Extraction complete
      await jobTracker.updateProgress(ownerId, jobId, 70);

      // Use provided title or use first chapter title
      const documentTitle = title || extraction.chapters[0]?.title || 'Untitled Document';

    // 🎯 TESTING: Store chapters and sections in database
    await tenantHelpers.withTenant(ownerId, async (client) => {
      // Insert document with metadata
      await client.query(
        `INSERT INTO documents (id, title, pages, owner_id, course_id, chapter, material_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [documentId, documentTitle, extraction.total_sections, ownerId, courseId, chapter, materialType]
      );

      console.log(`[UploadProcessor] Document created: ${documentId} with course_id=${courseId}, chapter=${chapter}`);

      // Update progress: 80% - Document created
      await jobTracker.updateProgress(ownerId, jobId, 80);

      // 🎯 TESTING: Insert all sections from all chapters
      let sectionCounter = 0;
      const totalToInsert = extraction.total_sections;

      for (const chapterData of extraction.chapters) {
        console.log(`[UploadProcessor] 📝 Storing ${chapterData.sections.length} sections for Chapter ${chapterData.chapter_number}`);

        for (let i = 0; i < chapterData.sections.length; i++) {
          const section = chapterData.sections[i];

          const { rows } = await client.query(
            `INSERT INTO sections
             (owner_id, document_id, course_id, chapter, section_number, name, description,
              markdown_text, page_start, page_end, concepts_generated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
             RETURNING id`,
            [
              ownerId,
              documentId,
              courseId,
              chapterData.chapter_number, // Chapter number
              sectionCounter + 1, // Global section number across all chapters
              section.name,
              section.description,
              section.markdown,
              chapterData.page_start, // Chapter's page range
              chapterData.page_end
            ]
          );

          console.log(`[UploadProcessor] 🎯 Chapter ${chapterData.chapter_number}, Section ${i + 1}: "${section.name}" (${section.markdown.length} chars), id=${rows[0].id}`);

          sectionCounter++;

          // Update progress incrementally
          const sectionProgress = 80 + Math.floor((sectionCounter) / totalToInsert * 20);
          await jobTracker.updateProgress(ownerId, jobId, sectionProgress);
        }
      }
    });

    console.log(`[UploadProcessor] ✅ Job ${jobId} complete`);

    // Mark job as completed
    await jobTracker.completeJob(ownerId, jobId, {
      document_id: documentId,
      title: documentTitle,
      chapter_count: extraction.total_chapters,
      section_count: extraction.total_sections,
      course_id: courseId,
      chapter: chapter,
      material_type: materialType,
      chapters: extraction.chapters.map(ch => ({
        chapter_number: ch.chapter_number,
        title: ch.title,
        section_count: ch.sections.length,
        page_range: `${ch.page_start}-${ch.page_end}`
      }))
    });

      return {
        document_id: documentId,
        title: documentTitle,
        chapter_count: extraction.total_chapters,
        section_count: extraction.total_sections,
        course_id: courseId,
        chapter: chapter
      };
    } catch (extractionError) {
      console.error(`[UploadProcessor] ❌ Hybrid extraction failed`);
      console.error(`[UploadProcessor] Error type: ${extractionError.constructor.name}`);
      console.error(`[UploadProcessor] Error message: ${extractionError.message}`);
      console.error(`[UploadProcessor] Error stack:`, extractionError.stack);

      // Re-throw with more context
      throw new Error(`Hybrid extraction failed: ${extractionError.message}`);
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
