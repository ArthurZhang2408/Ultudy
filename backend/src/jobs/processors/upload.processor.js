/**
 * Upload Job Processor
 *
 * Handles PDF upload and extraction in the background
 * Works with both S3 and local filesystem storage
 */

import { extractStructuredSections, extractChaptersFromMultiplePDFs, extractChaptersWithRawMarkdown } from '../../ingestion/llm_extractor.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { StorageService } from '../../lib/storage.js';

/**
 * Merge chapter extractions from multiple files
 * Combines chapters with the same chapter number, merging their sections
 *
 * @param {Array} allExtractions - Array of {fileName, extraction} objects
 * @returns {Array} Merged chapters array
 */
function mergeChapterExtractions(allExtractions) {
  const chapterMap = new Map();

  for (const { fileName, extraction } of allExtractions) {
    for (const chapter of extraction.chapters) {
      const chapterNum = chapter.chapter;

      if (chapterMap.has(chapterNum)) {
        // Chapter already exists - merge sections
        const existing = chapterMap.get(chapterNum);

        console.log(`[ChapterMerger] Merging Chapter ${chapterNum} from ${fileName} into existing chapter`);

        // Keep the first title we see (usually from main textbook)
        // Or if new title is more descriptive, use it
        if (chapter.title && (!existing.title || chapter.title.length > existing.title.length)) {
          existing.title = chapter.title;
        }

        // Merge descriptions
        if (chapter.description && !existing.description) {
          existing.description = chapter.description;
        }

        // Append sections from this file
        existing.sections.push(...chapter.sections);

        console.log(`[ChapterMerger]   Added ${chapter.sections.length} sections (total now: ${existing.sections.length})`);
      } else {
        // New chapter - add it
        console.log(`[ChapterMerger] Adding new Chapter ${chapterNum}: "${chapter.title}" from ${fileName}`);
        chapterMap.set(chapterNum, {
          chapter: chapterNum,
          title: chapter.title,
          description: chapter.description || null,
          sections: [...chapter.sections]
        });
      }
    }
  }

  // Convert map to sorted array
  const merged = Array.from(chapterMap.values()).sort((a, b) => a.chapter - b.chapter);

  return merged;
}

/**
 * Merge raw chapter extractions from multiple files (Phase 1 - two-phase processing)
 * Combines chapters with the same chapter number, concatenating their raw markdown
 *
 * @param {Array} allExtractions - Array of {fileName, extraction} objects
 * @returns {Array} Merged chapters array with raw_markdown field
 */
function mergeRawChapterExtractions(allExtractions) {
  const chapterMap = new Map();

  for (const { fileName, extraction } of allExtractions) {
    for (const chapter of extraction.chapters) {
      const chapterNum = chapter.chapter;

      if (chapterMap.has(chapterNum)) {
        // Chapter already exists - combine raw markdown
        const existing = chapterMap.get(chapterNum);

        console.log(`[ChapterMerger] Merging Chapter ${chapterNum} from ${fileName} into existing chapter`);

        // Keep the longer/more descriptive title
        if (chapter.title && (!existing.title || chapter.title.length > existing.title.length)) {
          existing.title = chapter.title;
        }

        // Combine descriptions
        if (chapter.description && !existing.description) {
          existing.description = chapter.description;
        }

        // Concatenate raw markdown with source separator
        existing.raw_markdown += `\n\n<!-- SOURCE: ${fileName} -->\n\n${chapter.raw_markdown}`;
        existing.source_count++;
        existing.sourceFiles.push(fileName);

        const totalKB = (existing.raw_markdown.length / 1024).toFixed(1);
        console.log(`[ChapterMerger]   Combined markdown (now ${totalKB}KB from ${existing.source_count} sources)`);
      } else {
        // New chapter - add it
        console.log(`[ChapterMerger] Adding new Chapter ${chapterNum}: "${chapter.title}" from ${fileName}`);
        chapterMap.set(chapterNum, {
          chapter: chapterNum,
          title: chapter.title,
          description: chapter.description || null,
          raw_markdown: `<!-- SOURCE: ${fileName} -->\n\n${chapter.raw_markdown}`,
          source_count: 1,
          sourceFiles: [fileName]
        });
      }
    }
  }

  // Convert map to sorted array
  const merged = Array.from(chapterMap.values()).sort((a, b) => a.chapter - b.chapter);

  return merged;
}

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
  console.log(`[ChapterUploadProcessor] Job data:`, JSON.stringify(job.data, null, 2));
  console.log(`[ChapterUploadProcessor] Files array:`, files);

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

      try {
        const pdfBuffer = await storage.download(file.storageKey);
        console.log(`[ChapterUploadProcessor]   Downloaded ${pdfBuffer?.length || 0} bytes`);

        if (!pdfBuffer || pdfBuffer.length === 0) {
          throw new Error(`Downloaded empty or null buffer for ${file.storageKey}`);
        }

        const tempPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);
        await fs.writeFile(tempPath, pdfBuffer);
        console.log(`[ChapterUploadProcessor]   Written to temp file: ${tempPath}`);

        processingPaths.push(tempPath);
        tempFiles.push(tempPath);

        // Progress: 5-15% for downloading
        const downloadProgress = 5 + Math.floor((i + 1) / files.length * 10);
        await jobTracker.updateProgress(ownerId, jobId, downloadProgress);
      } catch (error) {
        console.error(`[ChapterUploadProcessor] Failed to download ${file.storageKey}:`, error);
        throw new Error(`Failed to download file ${file.originalFilename}: ${error.message}`);
      }
    }

    console.log(`[ChapterUploadProcessor] All PDFs downloaded to temp files`);

    // Update progress: 15% - Starting extraction
    await jobTracker.updateProgress(ownerId, jobId, 15);

    // PHASE 1: Extract raw markdown from each PDF individually (no sections yet)
    console.log(`[ChapterUploadProcessor] Phase 1: Extracting raw markdown from ${files.length} PDFs...`);
    console.log(`[ChapterUploadProcessor] processingPaths array:`, processingPaths);
    const allExtractions = [];

    for (let i = 0; i < processingPaths.length; i++) {
      const pdfPath = processingPaths[i];
      const fileName = files[i].originalFilename;

      console.log(`[ChapterUploadProcessor] Extracting from file ${i + 1}/${files.length}: ${fileName}`);
      console.log(`[ChapterUploadProcessor]   pdfPath = ${pdfPath} (type: ${typeof pdfPath})`);

      if (!pdfPath) {
        throw new Error(`pdfPath is ${pdfPath} for file ${fileName} at index ${i}`);
      }

      try {
        const extraction = await extractChaptersWithRawMarkdown(pdfPath);
        allExtractions.push({ fileName, extraction });

        console.log(`[ChapterUploadProcessor]   Extracted ${extraction.chapters.length} chapters from ${fileName}`);

        // Progress: 15-70% for extraction (55% total)
        const extractProgress = 15 + Math.floor((i + 1) / processingPaths.length * 55);
        await jobTracker.updateProgress(ownerId, jobId, extractProgress);
      } catch (error) {
        console.error(`[ChapterUploadProcessor] Failed to extract from ${fileName}:`, error.message);
        throw new Error(`Failed to extract chapters from ${fileName}: ${error.message}`);
      }
    }

    // Merge raw markdown from all files (combine overlapping chapter numbers)
    console.log(`[ChapterUploadProcessor] Merging raw markdown from ${allExtractions.length} files...`);
    const mergedChapters = mergeRawChapterExtractions(allExtractions);

    console.log(`[ChapterUploadProcessor] Phase 1 complete: ${mergedChapters.length} chapters`);
    mergedChapters.forEach(ch => {
      const markdownKB = (ch.raw_markdown.length / 1024).toFixed(1);
      console.log(`[ChapterUploadProcessor]   Chapter ${ch.chapter}: "${ch.title}" (${markdownKB}KB from ${ch.source_count} source(s))`);
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

      // Phase 1: Store chapters with raw markdown (NO sections yet)
      console.log(`[ChapterUploadProcessor] Storing ${mergedChapters.length} chapters with raw markdown...`);

      for (let i = 0; i < mergedChapters.length; i++) {
        const chapter = mergedChapters[i];

        // Create chapter record with raw markdown
        const { rows: chapterRows } = await client.query(
          `INSERT INTO chapters
           (owner_id, upload_batch_id, course_id, chapter_number, title, description, raw_markdown, sections_generated, source_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
           RETURNING id`,
          [
            ownerId,
            uploadBatchId,
            courseId,
            chapter.chapter,
            chapter.title,
            chapter.description || null,
            chapter.raw_markdown,
            chapter.source_count
          ]
        );

        const chapterId = chapterRows[0].id;
        const markdownKB = (chapter.raw_markdown.length / 1024).toFixed(1);
        console.log(`[ChapterUploadProcessor] Chapter ${chapter.chapter} created: ${chapterId} (${markdownKB}KB raw markdown, ${chapter.source_count} sources, sections_generated=false)`);

        // Progress: 80-100% for creating chapter records
        const chapterProgress = 80 + Math.floor(((i + 1) / mergedChapters.length) * 20);
        await jobTracker.updateProgress(ownerId, jobId, chapterProgress);
      }

      console.log(`[ChapterUploadProcessor] Phase 1 complete! Created ${mergedChapters.length} chapters with raw markdown.`);
      console.log(`[ChapterUploadProcessor] User can now generate sections for each chapter on-demand (Phase 2).`);
    });

    console.log(`[ChapterUploadProcessor] ✅ Job ${jobId} complete`);

    // Mark job as completed
    const result = {
      upload_batch_id: uploadBatchId,
      title: batchTitle,
      chapter_count: mergedChapters.length,
      phase: 'Phase 1 - Raw markdown extracted',
      sections_generated: false,
      course_id: courseId,
      material_type: materialType,
      chapters: mergedChapters.map(ch => ({
        chapter_number: ch.chapter,
        title: ch.title,
        source_count: ch.source_count,
        markdown_size_kb: (ch.raw_markdown.length / 1024).toFixed(1)
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
