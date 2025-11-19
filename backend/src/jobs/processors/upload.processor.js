/**
 * Upload Job Processor
 *
 * Handles PDF upload and extraction in the background
 * Works with both S3 and local filesystem storage
 */

import { extractStructuredSections } from '../../ingestion/llm_extractor.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { StorageService } from '../../lib/storage.js';

export async function processUploadJob(job, { tenantHelpers, jobTracker, storageDir, storageService }) {
  // Support both old single-file and new multi-file formats
  const { jobId, ownerId, pdfPath, storageKey, files, documentId, courseId, materialType, title } = job.data;

  console.log(`[UploadProcessor] Starting job ${jobId} for document ${documentId}`);
  console.log(`[UploadProcessor] Metadata: course=${courseId}, type=${materialType}`);

  // Check if this is a multi-file upload
  const isMultiFile = files && files.length > 0;
  console.log(`[UploadProcessor] Mode: ${isMultiFile ? `multi-file (${files.length} files)` : 'single-file (legacy)'}`);

  let tempPdfPaths = [];

  try {
    // Mark job as processing
    await jobTracker.startJob(ownerId, jobId);

    // Update progress: 10% - Files saved
    await jobTracker.updateProgress(ownerId, jobId, 10);

    // Get PDF paths for processing
    let processingPaths = [];

    if (isMultiFile) {
      // Download all files to temp storage
      const storage = storageService || new StorageService({ storageDir });

      console.log(`[UploadProcessor] Downloading ${files.length} PDFs from storage...`);

      for (const fileInfo of files) {
        const pdfBuffer = await storage.download(fileInfo.storageKey);
        const tempPath = path.join(os.tmpdir(), `${fileInfo.fileId}.pdf`);
        await fs.writeFile(tempPath, pdfBuffer);

        tempPdfPaths.push(tempPath);
        processingPaths.push({
          path: tempPath,
          filename: fileInfo.originalFilename
        });

        console.log(`[UploadProcessor] Downloaded: ${fileInfo.originalFilename} -> ${tempPath}`);
      }
    } else {
      // Legacy single-file support
      let processingPath = pdfPath;

      if (storageKey) {
        const storage = storageService || new StorageService({ storageDir });
        console.log(`[UploadProcessor] Downloading PDF from storage: ${storageKey}`);

        const pdfBuffer = await storage.download(storageKey);
        const tempPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);
        await fs.writeFile(tempPath, pdfBuffer);

        tempPdfPaths.push(tempPath);
        processingPath = tempPath;

        console.log(`[UploadProcessor] PDF downloaded to temp file: ${tempPath}`);
      }

      processingPaths = [{ path: processingPath, filename: 'document.pdf' }];
    }

    console.log(`[UploadProcessor] Extracting structured content from ${processingPaths.length} file(s)`);

    // Update progress: 20% - Starting extraction
    await jobTracker.updateProgress(ownerId, jobId, 20);

    // Extract structured content with LLM vision
    // For multi-file uploads, extract chapters; for single-file, extract sections
    let extraction;
    if (isMultiFile) {
      extraction = await extractStructuredSections(processingPaths, materialType);
    } else {
      // Legacy: single file returns sections, wrap in a single chapter
      extraction = await extractStructuredSections(processingPaths[0].path);
    }

    console.log(`[UploadProcessor] Extraction complete`);
    if (extraction.chapters) {
      console.log(`[UploadProcessor] Extracted ${extraction.chapters.length} chapters`);
      const totalSections = extraction.chapters.reduce((sum, ch) => sum + ch.sections.length, 0);
      console.log(`[UploadProcessor] Total sections: ${totalSections}`);
    } else {
      console.log(`[UploadProcessor] Extracted ${extraction.sections.length} sections`);
      console.log(`[UploadProcessor] Title: "${extraction.title}"`);
    }

    // Update progress: 70% - Extraction complete
    await jobTracker.updateProgress(ownerId, jobId, 70);

    // Use provided title or fall back to extracted title
    const documentTitle = title || extraction.title || 'Untitled';

    // Store in database
    await tenantHelpers.withTenant(ownerId, async (client) => {
      let totalSections = 0;

      // Handle chapter-based extraction (new format)
      if (extraction.chapters && extraction.chapters.length > 0) {
        // Count total sections
        totalSections = extraction.chapters.reduce((sum, ch) => sum + ch.sections.length, 0);

        // Insert document with metadata (chapters will be stored at section level)
        await client.query(
          `INSERT INTO documents (id, title, pages, owner_id, course_id, material_type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [documentId, documentTitle, totalSections, ownerId, courseId, materialType]
        );

        console.log(`[UploadProcessor] Document created: ${documentId} with ${extraction.chapters.length} chapters, ${totalSections} sections`);

        // Update progress: 80% - Document created
        await jobTracker.updateProgress(ownerId, jobId, 80);

        // Insert sections for each chapter
        let sectionNumber = 0;
        for (const chapter of extraction.chapters) {
          for (const section of chapter.sections) {
            sectionNumber++;

            const { rows } = await client.query(
              `INSERT INTO sections
               (owner_id, document_id, section_number, name, description,
                markdown_text, chapter, concepts_generated)
               VALUES ($1, $2, $3, $4, $5, $6, $7, false)
               RETURNING id`,
              [
                ownerId,
                documentId,
                sectionNumber,
                section.name,
                section.description,
                section.markdown,
                `Chapter ${chapter.chapter}: ${chapter.title}`
              ]
            );

            console.log(`[UploadProcessor] Chapter ${chapter.chapter}, Section ${sectionNumber} "${section.name}": ${section.markdown.length} chars, id=${rows[0].id}`);

            // Update progress incrementally
            const sectionProgress = 80 + Math.floor(sectionNumber / totalSections * 20);
            await jobTracker.updateProgress(ownerId, jobId, sectionProgress);
          }
        }
      } else {
        // Handle legacy section-based extraction (backward compatibility)
        totalSections = extraction.sections.length;

        await client.query(
          `INSERT INTO documents (id, title, pages, owner_id, course_id, material_type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [documentId, documentTitle, totalSections, ownerId, courseId, materialType]
        );

        console.log(`[UploadProcessor] Document created: ${documentId} with ${totalSections} sections (legacy format)`);

        // Update progress: 80% - Document created
        await jobTracker.updateProgress(ownerId, jobId, 80);

        // Insert sections
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
      }
    });

    console.log(`[UploadProcessor] ✅ Job ${jobId} complete`);

    // Prepare completion metadata
    let completionMetadata;
    if (extraction.chapters && extraction.chapters.length > 0) {
      const totalSections = extraction.chapters.reduce((sum, ch) => sum + ch.sections.length, 0);
      completionMetadata = {
        document_id: documentId,
        title: documentTitle,
        chapter_count: extraction.chapters.length,
        section_count: totalSections,
        course_id: courseId,
        material_type: materialType,
        chapters: extraction.chapters.map(ch => ({
          chapter: ch.chapter,
          title: ch.title,
          section_count: ch.sections.length
        }))
      };
    } else {
      completionMetadata = {
        document_id: documentId,
        title: documentTitle,
        section_count: extraction.sections.length,
        course_id: courseId,
        material_type: materialType,
        sections: extraction.sections.map((s, i) => ({
          section_number: i + 1,
          name: s.name,
          description: s.description,
          markdown_length: s.markdown.length
        }))
      };
    }

    // Mark job as completed
    await jobTracker.completeJob(ownerId, jobId, completionMetadata);

    return completionMetadata;
  } catch (error) {
    console.error(`[UploadProcessor] ❌ Job ${jobId} failed:`, error);

    // Mark job as failed
    await jobTracker.failJob(ownerId, jobId, error);

    throw error;
  } finally {
    // Cleanup temp files if created
    if (tempPdfPaths.length > 0) {
      console.log(`[UploadProcessor] Cleaning up ${tempPdfPaths.length} temp file(s)...`);
      for (const tempPath of tempPdfPaths) {
        try {
          await fs.rm(tempPath, { force: true });
          console.log(`[UploadProcessor] Cleaned up: ${tempPath}`);
        } catch (cleanupError) {
          console.warn(`[UploadProcessor] Failed to cleanup ${tempPath}:`, cleanupError);
        }
      }
    }
  }
}
