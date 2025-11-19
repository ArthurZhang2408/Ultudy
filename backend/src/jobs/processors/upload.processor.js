/**
 * Upload Job Processor
 *
 * Handles PDF upload and extraction in the background
 * Works with both S3 and local filesystem storage
 */

import { extractStructuredSections, extractChaptersFromMultiplePDFs } from '../../ingestion/llm_extractor.js';
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

    console.log(`[UploadProcessor] Extracting structured sections from ${processingPath}`);

    // Update progress: 20% - Starting extraction
    await jobTracker.updateProgress(ownerId, jobId, 20);

    // Extract structured sections with LLM vision
    const extraction = await extractStructuredSections(processingPath);

    console.log(`[UploadProcessor] Extracted ${extraction.sections.length} sections`);
    console.log(`[UploadProcessor] Title: "${extraction.title}"`);

    // Update progress: 70% - Extraction complete
    await jobTracker.updateProgress(ownerId, jobId, 70);

    // Use provided title or fall back to extracted title
    const documentTitle = title || extraction.title;

    // Store in database
    await tenantHelpers.withTenant(ownerId, async (client) => {
      // Insert document with metadata
      await client.query(
        `INSERT INTO documents (id, title, pages, owner_id, course_id, chapter, material_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [documentId, documentTitle, extraction.sections.length, ownerId, courseId, chapter, materialType]
      );

      console.log(`[UploadProcessor] Document created: ${documentId} with course_id=${courseId}, chapter=${chapter}`);

      // Update progress: 80% - Document created
      await jobTracker.updateProgress(ownerId, jobId, 80);

      // Insert sections with LLM-generated markdown
      for (let i = 0; i < extraction.sections.length; i++) {
        const section = extraction.sections[i];

        const { rows } = await client.query(
          `INSERT INTO sections
           (owner_id, document_id, section_number, name, description,
            markdown_text, concepts_generated)
           VALUES ($1, $2, $3, $4, $5, $6, false)
           RETURNING id`,
          [
            ownerId,
            documentId,
            i + 1,
            section.name,
            section.description,
            section.markdown
          ]
        );

        console.log(`[UploadProcessor] Section ${i + 1} "${section.name}": ${section.markdown.length} chars, id=${rows[0].id}`);

        // Update progress incrementally
        const sectionProgress = 80 + Math.floor((i + 1) / extraction.sections.length * 20);
        await jobTracker.updateProgress(ownerId, jobId, sectionProgress);
      }
    });

    console.log(`[UploadProcessor] ✅ Job ${jobId} complete`);

    // Mark job as completed
    await jobTracker.completeJob(ownerId, jobId, {
      document_id: documentId,
      title: documentTitle,
      section_count: extraction.sections.length,
      course_id: courseId,
      chapter: chapter,
      material_type: materialType,
      sections: extraction.sections.map((s, i) => ({
        section_number: i + 1,
        name: s.name,
        description: s.description,
        markdown_length: s.markdown.length
      }))
    });

    return {
      document_id: documentId,
      title: documentTitle,
      section_count: extraction.sections.length,
      course_id: courseId,
      chapter: chapter
    };
  } catch (error) {
    console.error(`[UploadProcessor] ❌ Job ${jobId} failed:`, error);

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

/**
 * Process Chapter Upload Job - Handles multiple PDFs with chapter extraction
 *
 * This processor:
 * 1. Downloads all PDFs from storage
 * 2. Processes them together with LLM to extract chapters + sections
 * 3. Creates upload_batch record
 * 4. Creates chapter records
 * 5. Creates section records linked to chapters
 * 6. Creates document records for source PDFs
 */
export async function processChapterUploadJob(job, { tenantHelpers, jobTracker, storageDir, storageService }) {
  const {
    jobId,
    ownerId,
    uploadBatchId,
    courseId,
    materialType,
    title,
    files // Array of { storageKey, documentId, originalFilename }
  } = job.data;

  console.log(`[ChapterUploadProcessor] Starting job ${jobId} for batch ${uploadBatchId}`);
  console.log(`[ChapterUploadProcessor] Processing ${files.length} files`);
  console.log(`[ChapterUploadProcessor] Metadata: course=${courseId}, type=${materialType}`);

  const tempFiles = [];

  try {
    // Mark job as processing
    await jobTracker.startJob(ownerId, jobId);
    await jobTracker.updateProgress(ownerId, jobId, 5);

    // Download all PDFs to temp files
    const storage = storageService || new StorageService({ storageDir });
    const processingPaths = [];

    console.log(`[ChapterUploadProcessor] Downloading ${files.length} PDFs from storage...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`[ChapterUploadProcessor] Downloading ${i + 1}/${files.length}: ${file.storageKey}`);

      const pdfBuffer = await storage.download(file.storageKey);
      const tempPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);
      await fs.writeFile(tempPath, pdfBuffer);

      processingPaths.push(tempPath);
      tempFiles.push(tempPath);

      // Progress: 5-15% for downloading
      const downloadProgress = 5 + Math.floor((i + 1) / files.length * 10);
      await jobTracker.updateProgress(ownerId, jobId, downloadProgress);
    }

    console.log(`[ChapterUploadProcessor] All PDFs downloaded to temp files`);

    // Update progress: 15% - Starting extraction
    await jobTracker.updateProgress(ownerId, jobId, 15);

    // Extract chapters with sections using LLM
    console.log(`[ChapterUploadProcessor] Extracting chapters from ${files.length} PDFs...`);
    const extraction = await extractChaptersFromMultiplePDFs(processingPaths);

    console.log(`[ChapterUploadProcessor] Extracted ${extraction.chapters.length} chapters`);
    extraction.chapters.forEach(ch => {
      console.log(`[ChapterUploadProcessor]   Chapter ${ch.chapter}: "${ch.title}" (${ch.sections.length} sections)`);
    });

    // Update progress: 70% - Extraction complete
    await jobTracker.updateProgress(ownerId, jobId, 70);

    // Use provided title or default
    const batchTitle = title || `Course Materials - ${materialType}`;

    // Store everything in database
    await tenantHelpers.withTenant(ownerId, async (client) => {
      // Update upload_batch as completed
      await client.query(
        `UPDATE upload_batches
         SET title = $1, processing_status = 'completed', updated_at = now()
         WHERE id = $2 AND owner_id = $3`,
        [batchTitle, uploadBatchId, ownerId]
      );

      console.log(`[ChapterUploadProcessor] Upload batch updated: ${uploadBatchId}`);

      // Update progress: 75% - Batch created
      await jobTracker.updateProgress(ownerId, jobId, 75);

      // Create document records for each source PDF
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await client.query(
          `INSERT INTO documents (id, title, pages, owner_id, course_id, material_type, upload_batch_id)
           VALUES ($1, $2, 0, $3, $4, $5, $6)`,
          [file.documentId, file.originalFilename, ownerId, courseId, materialType, uploadBatchId]
        );
        console.log(`[ChapterUploadProcessor] Document created: ${file.documentId} - ${file.originalFilename}`);
      }

      // Progress: 80% - Documents created
      await jobTracker.updateProgress(ownerId, jobId, 80);

      // Create chapters and sections
      let processedSections = 0;
      const totalSections = extraction.chapters.reduce((sum, ch) => sum + ch.sections.length, 0);

      for (const chapter of extraction.chapters) {
        // Create chapter record
        const { rows: chapterRows } = await client.query(
          `INSERT INTO chapters (owner_id, upload_batch_id, course_id, chapter_number, title, description)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [ownerId, uploadBatchId, courseId, chapter.chapter, chapter.title, chapter.description || null]
        );

        const chapterId = chapterRows[0].id;
        console.log(`[ChapterUploadProcessor] Chapter ${chapter.chapter} created: ${chapterId}`);

        // Create sections for this chapter
        for (let i = 0; i < chapter.sections.length; i++) {
          const section = chapter.sections[i];

          await client.query(
            `INSERT INTO sections
             (owner_id, chapter_id, course_id, section_number, name, description, markdown_text, concepts_generated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
            [
              ownerId,
              chapterId,
              courseId,
              i + 1,
              section.name,
              section.description,
              section.markdown
            ]
          );

          console.log(`[ChapterUploadProcessor] Chapter ${chapter.chapter}, Section ${i + 1} "${section.name}": ${section.markdown.length} chars`);

          processedSections++;

          // Update progress: 80-100% based on sections processed
          const sectionProgress = 80 + Math.floor((processedSections / totalSections) * 20);
          await jobTracker.updateProgress(ownerId, jobId, sectionProgress);
        }
      }
    });

    console.log(`[ChapterUploadProcessor] ✅ Job ${jobId} complete`);

    // Mark job as completed
    const result = {
      upload_batch_id: uploadBatchId,
      title: batchTitle,
      chapter_count: extraction.chapters.length,
      section_count: extraction.chapters.reduce((sum, ch) => sum + ch.sections.length, 0),
      course_id: courseId,
      material_type: materialType,
      chapters: extraction.chapters.map(ch => ({
        chapter_number: ch.chapter,
        title: ch.title,
        section_count: ch.sections.length
      }))
    };

    await jobTracker.completeJob(ownerId, jobId, result);

    return result;
  } catch (error) {
    console.error(`[ChapterUploadProcessor] ❌ Job ${jobId} failed:`, error);

    // Mark upload_batch as failed
    try {
      await tenantHelpers.withTenant(ownerId, async (client) => {
        await client.query(
          `UPDATE upload_batches
           SET processing_status = 'failed', updated_at = now()
           WHERE id = $1 AND owner_id = $2`,
          [uploadBatchId, ownerId]
        );
      });
    } catch (updateError) {
      console.error(`[ChapterUploadProcessor] Failed to update batch status:`, updateError);
    }

    // Mark job as failed
    await jobTracker.failJob(ownerId, jobId, error);

    throw error;
  } finally {
    // Cleanup all temp files
    for (const tempPath of tempFiles) {
      try {
        await fs.rm(tempPath, { force: true });
        console.log(`[ChapterUploadProcessor] Cleaned up temp file: ${tempPath}`);
      } catch (cleanupError) {
        console.warn(`[ChapterUploadProcessor] Failed to cleanup temp file:`, cleanupError);
      }
    }
  }
}
