/**
 * Chapter Extraction Job Processor
 *
 * Processes individual chapter extraction jobs from multi-chapter PDFs
 * Includes retry logic for 503 errors from Gemini API
 */

import { extractSingleChapter } from '../../services/tier2Extraction.js';
import { StorageService } from '../../lib/storage.js';
import { queryWrite } from '../../db/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is a 503 Service Unavailable error from Gemini
 */
function is503Error(error) {
  return error.message && (
    error.message.includes('503') ||
    error.message.includes('Service Unavailable') ||
    error.message.includes('temporarily unavailable')
  );
}

/**
 * Process a single chapter extraction job
 *
 * @param {object} job - BullMQ job
 * @param {object} options - { tenantHelpers, jobTracker, storageService }
 */
export async function processChapterExtractionJob(job, { tenantHelpers, jobTracker, storageService }) {
  const {
    jobId,
    ownerId,
    documentId,
    storageKey,
    courseId,
    chapter, // { number, title, pageStart, pageEnd }
    chapterIndex, // For progress reporting (1-based)
    totalChapters
  } = job.data;

  console.log(`[ChapterExtractionProcessor] Starting extraction for Chapter ${chapter.number}: ${chapter.title}`);
  console.log(`[ChapterExtractionProcessor] Job ID: ${jobId}, Document: ${documentId}`);

  let tempPdfPath = null;
  const MAX_RETRIES = 3;
  const BASE_DELAY = 10000; // 10 seconds

  try {
    // Mark job as processing
    await jobTracker.startJob(ownerId, jobId);
    await jobTracker.updateProgress(ownerId, jobId, 10);

    // Download PDF from storage
    const storage = storageService || new StorageService();
    console.log(`[ChapterExtractionProcessor] Downloading PDF: ${storageKey}`);

    const pdfBuffer = await storage.download(storageKey);
    tempPdfPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);
    await fs.writeFile(tempPdfPath, pdfBuffer);

    console.log(`[ChapterExtractionProcessor] PDF downloaded to: ${tempPdfPath}`);
    await jobTracker.updateProgress(ownerId, jobId, 30);

    // Extract chapter with retry logic
    let extraction = null;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[ChapterExtractionProcessor] Extraction attempt ${attempt}/${MAX_RETRIES} for Chapter ${chapter.number}`);

        extraction = await extractSingleChapter(
          tempPdfPath,
          chapter.number,
          chapter.title,
          chapter.pageStart,
          chapter.pageEnd
        );

        console.log(`[ChapterExtractionProcessor] ✅ Chapter ${chapter.number} extracted successfully`);
        break; // Success - exit retry loop
      } catch (error) {
        lastError = error;
        console.error(`[ChapterExtractionProcessor] Attempt ${attempt}/${MAX_RETRIES} failed for Chapter ${chapter.number}:`, error.message);

        // Check if it's a 503 error and we have retries left
        if (is503Error(error) && attempt < MAX_RETRIES) {
          // Exponential backoff: 10s, 20s, 40s
          const delayMs = BASE_DELAY * Math.pow(2, attempt - 1);
          console.log(`[ChapterExtractionProcessor] 503 error detected. Retrying after ${delayMs}ms...`);
          await sleep(delayMs);
        } else if (attempt === MAX_RETRIES) {
          // Max retries reached
          console.error(`[ChapterExtractionProcessor] ❌ Max retries (${MAX_RETRIES}) reached for Chapter ${chapter.number}`);
          throw error;
        } else {
          // Non-503 error - fail immediately
          throw error;
        }
      }
    }

    if (!extraction) {
      throw lastError || new Error('Extraction failed without error details');
    }

    await jobTracker.updateProgress(ownerId, jobId, 70);

    // Save to database
    console.log(`[ChapterExtractionProcessor] Saving Chapter ${chapter.number} to database`);

    const result = await queryWrite(
      `INSERT INTO chapter_markdown
       (owner_id, document_id, course_id, chapter_number, chapter_title, markdown_content, page_start, page_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        ownerId,
        documentId,
        courseId,
        extraction.chapterNumber,
        extraction.chapterTitle,
        extraction.markdown,
        chapter.pageStart,
        chapter.pageEnd
      ]
    );

    console.log(`[ChapterExtractionProcessor] ✅ Chapter ${chapter.number} saved (id: ${result.rows[0].id})`);

    await jobTracker.updateProgress(ownerId, jobId, 100);

    // Mark job as completed
    await jobTracker.completeJob(ownerId, jobId, {
      chapter_number: extraction.chapterNumber,
      chapter_title: extraction.chapterTitle,
      chapter_markdown_id: result.rows[0].id,
      document_id: documentId,
      course_id: courseId
    });

    return {
      chapter_number: extraction.chapterNumber,
      chapter_title: extraction.chapterTitle,
      id: result.rows[0].id,
      success: true
    };
  } catch (error) {
    console.error(`[ChapterExtractionProcessor] ❌ Chapter ${chapter.number} extraction failed:`, error);

    // Mark job as failed
    await jobTracker.failJob(ownerId, jobId, error);

    throw error;
  } finally {
    // Cleanup temp file
    if (tempPdfPath) {
      try {
        await fs.rm(tempPdfPath, { force: true });
        console.log(`[ChapterExtractionProcessor] Cleaned up temp file: ${tempPdfPath}`);
      } catch (err) {
        console.warn(`[ChapterExtractionProcessor] Failed to cleanup temp file:`, err.message);
      }
    }
  }
}
