/**
 * Upload Job Processor
 *
 * Handles PDF upload and extraction in the background
 * Works with both S3 and local filesystem storage
 *
 * TWO-PHASE EXTRACTION APPROACH:
 *   Phase 1: Analyze PDF structure (JSON metadata)
 *     - Determine if single or multi-chapter
 *     - Extract chapter count and page ranges
 *   Phase 2: Extract chapter content (plain markdown)
 *     - Single chapter: Extract full PDF directly
 *     - Multi-chapter: Split PDF by page ranges, extract each separately
 *
 * Benefits:
 *   - Handles both single and multi-chapter PDFs intelligently
 *   - Avoids token limits by splitting large PDFs
 *   - Native $ and $$ math support, standard markdown tables
 *   - No JSON escaping issues for LaTeX/special chars
 *   - Each chapter stored as one row in sections table
 */

import { extractStructuredSections } from '../../ingestion/llm_extractor.js';
import { extractChapters } from '../../ingestion/llm_extractor_chapters.js';
import { extractPdfWithHybridApproach } from '../../ingestion/llm_extractor_hybrid.js';
import { extractPdfAsMarkdown } from '../../ingestion/llm_extractor_markdown.js';
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
    console.log(`[UploadProcessor] 📚 TWO-PHASE EXTRACTION: ANALYZE → EXTRACT`);
    console.log(`[UploadProcessor] ========================================`);
    console.log(`[UploadProcessor] PDF path: ${processingPath}`);
    console.log(`[UploadProcessor] Job ID: ${jobId}`);
    console.log(`[UploadProcessor] Document ID: ${documentId}`);

    // Update progress: 20% - Starting extraction
    await jobTracker.updateProgress(ownerId, jobId, 20);

    try {
      // Two-phase extraction:
      // Phase 1: Analyze structure (JSON metadata - chapter count, page ranges)
      // Phase 2: Extract content (plain markdown)
      //   - Single chapter: extract full PDF directly
      //   - Multi-chapter: split PDF by page ranges, extract each separately
      console.log(`[UploadProcessor] 📤 Starting two-phase extraction...`);
      const extraction = await extractPdfAsMarkdown(processingPath);
      console.log(`[UploadProcessor] 📥 Extraction completed successfully`);

      console.log(`[UploadProcessor] 📝 Extracted ${extraction.total_chapters} chapter(s)`);
      extraction.chapters.forEach((ch, idx) => {
        console.log(`[UploadProcessor]   Chapter ${ch.chapter_number}: "${ch.title}" (${ch.markdown.length} chars, pages ${ch.page_start}-${ch.page_end})`);
      });

      // Update progress: 70% - Extraction complete
      await jobTracker.updateProgress(ownerId, jobId, 70);

      // Use provided title or use first chapter title
      const documentTitle = title || extraction.chapters[0]?.title || 'Untitled Document';

      // Use extracted chapter number from PDF (prefer LLM extraction over user input)
      // If multiple chapters, use the first one; if single chapter PDF, use that chapter
      const extractedChapter = extraction.chapters[0]?.chapter_number || chapter || null;

    // 📝 TESTING: Store chapters in database (each chapter as one section row)
    await tenantHelpers.withTenant(ownerId, async (client) => {
      // Insert document with metadata
      await client.query(
        `INSERT INTO documents (id, title, pages, owner_id, course_id, chapter, material_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [documentId, documentTitle, extraction.total_chapters, ownerId, courseId, extractedChapter, materialType]
      );

      console.log(`[UploadProcessor] Document created: ${documentId} with course_id=${courseId}, chapter=${extractedChapter}`);

      // Update progress: 80% - Document created
      await jobTracker.updateProgress(ownerId, jobId, 80);

      // 📝 TESTING: Insert each chapter as one row in sections table
      const totalToInsert = extraction.total_chapters;

      for (let i = 0; i < extraction.chapters.length; i++) {
        const chapterData = extraction.chapters[i];
        console.log(`[UploadProcessor] 📝 Storing Chapter ${chapterData.chapter_number}: "${chapterData.title}"`);

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
            i + 1, // Sequential number
            chapterData.title, // Chapter title as name
            `Chapter ${chapterData.chapter_number}: ${chapterData.title}`, // Description
            chapterData.markdown, // Full chapter markdown
            chapterData.page_start,
            chapterData.page_end
          ]
        );

        console.log(`[UploadProcessor] ✅ Chapter ${chapterData.chapter_number}: "${chapterData.title}" (${chapterData.markdown.length} chars), id=${rows[0].id}`);

        // Update progress incrementally
        const chapterProgress = 80 + Math.floor((i + 1) / totalToInsert * 20);
        await jobTracker.updateProgress(ownerId, jobId, chapterProgress);
      }
    });

    console.log(`[UploadProcessor] ✅ Job ${jobId} complete`);

    // Mark job as completed
    await jobTracker.completeJob(ownerId, jobId, {
      document_id: documentId,
      title: documentTitle,
      chapter_count: extraction.total_chapters,
      course_id: courseId,
      chapter: extractedChapter,
      material_type: materialType,
      chapters: extraction.chapters.map(ch => ({
        chapter_number: ch.chapter_number,
        title: ch.title,
        markdown_length: ch.markdown.length,
        page_range: `${ch.page_start}-${ch.page_end}`
      }))
    });

      return {
        document_id: documentId,
        title: documentTitle,
        chapter_count: extraction.total_chapters,
        course_id: courseId,
        chapter: extractedChapter
      };
    } catch (extractionError) {
      console.error(`[UploadProcessor] ❌ Markdown extraction failed`);
      console.error(`[UploadProcessor] Error type: ${extractionError.constructor.name}`);
      console.error(`[UploadProcessor] Error message: ${extractionError.message}`);
      console.error(`[UploadProcessor] Error stack:`, extractionError.stack);

      // Re-throw with more context
      throw new Error(`Markdown extraction failed: ${extractionError.message}`);
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
