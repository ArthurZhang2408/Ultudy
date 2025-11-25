/**
 * Tier 2 Routes
 *
 * Handles tier 2-specific operations:
 * - Chapter extraction from multi-chapter PDFs
 * - Chapter markdown retrieval
 * - Chapter source listing
 */

import express from 'express';
import { queryRead, queryWrite } from '../db/index.js';
import { extractSingleChapter } from '../services/tier2Extraction.js';
import { StorageService } from '../lib/storage.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const router = express.Router();

/**
 * POST /api/tier2/extract-chapters
 *
 * Extract selected chapters from a multi-chapter PDF
 * Body: {
 *   documentId: string,
 *   storageKey: string,
 *   courseId: string,
 *   chapters: [{ number, title, pageStart, pageEnd }]
 * }
 */
router.post('/extract-chapters', async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { documentId, storageKey, courseId, chapters } = req.body;

    if (!documentId || !storageKey || !courseId || !Array.isArray(chapters) || chapters.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: documentId, storageKey, courseId, chapters'
      });
    }

    console.log(`[tier2/extract-chapters] Extracting ${chapters.length} chapters from document ${documentId}`);

    // Download PDF from storage
    const storageService = new StorageService();
    const pdfBuffer = await storageService.download(storageKey);

    // Write to temp file
    const tempPdfPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);
    await fs.writeFile(tempPdfPath, pdfBuffer);

    console.log(`[tier2/extract-chapters] PDF downloaded to: ${tempPdfPath}`);

    // Extract each chapter
    const results = [];
    for (const chapter of chapters) {
      try {
        console.log(`[tier2/extract-chapters] Extracting Chapter ${chapter.number}: ${chapter.title}`);

        const extraction = await extractSingleChapter(
          tempPdfPath,
          chapter.number,
          chapter.title,
          chapter.pageStart,
          chapter.pageEnd
        );

        // Save to database
        const result = await queryWrite(
          `INSERT INTO chapter_markdown
           (owner_id, document_id, course_id, chapter_number, chapter_title, markdown_content, page_start, page_end)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            userId,
            documentId,
            courseId,
            extraction.chapterNumber,
            extraction.chapterTitle,
            extraction.markdown,
            chapter.pageStart,
            chapter.pageEnd
          ]
        );

        console.log(`[tier2/extract-chapters] Saved Chapter ${chapter.number} markdown (id: ${result.rows[0].id})`);

        results.push({
          chapter_number: extraction.chapterNumber,
          chapter_title: extraction.chapterTitle,
          id: result.rows[0].id,
          success: true
        });
      } catch (error) {
        console.error(`[tier2/extract-chapters] Failed to extract Chapter ${chapter.number}:`, error);
        results.push({
          chapter_number: chapter.number,
          chapter_title: chapter.title,
          success: false,
          error: error.message
        });
      }
    }

    // Cleanup temp file
    try {
      await fs.rm(tempPdfPath, { force: true });
      console.log(`[tier2/extract-chapters] Cleaned up temp file`);
    } catch (err) {
      console.warn(`[tier2/extract-chapters] Failed to cleanup temp file:`, err.message);
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[tier2/extract-chapters] Extraction complete: ${successCount}/${chapters.length} successful`);

    res.json({
      success: true,
      extracted: successCount,
      total: chapters.length,
      results
    });
  } catch (error) {
    console.error('[tier2/extract-chapters] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to extract chapters' });
  }
});

/**
 * GET /api/tier2/chapter-markdown/:id
 *
 * Get chapter markdown by ID
 */
router.get('/chapter-markdown/:id', async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { id } = req.params;

    const result = await queryRead(
      `SELECT * FROM chapter_markdown WHERE id = $1 AND owner_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chapter markdown not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[tier2/chapter-markdown] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to get chapter markdown' });
  }
});

/**
 * GET /api/tier2/chapter-sources/:courseId
 *
 * Get all chapter sources for a course (grouped by chapter number)
 * Returns: { chapters: { [chapterNumber]: [{ id, documentId, documentTitle, chapterTitle, ... }] } }
 */
router.get('/chapter-sources/:courseId', async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { courseId } = req.params;

    const result = await queryRead(
      `SELECT
        cm.id,
        cm.document_id,
        cm.chapter_number,
        cm.chapter_title,
        cm.page_start,
        cm.page_end,
        cm.created_at,
        d.title as document_title
       FROM chapter_markdown cm
       JOIN documents d ON cm.document_id = d.id
       WHERE cm.course_id = $1 AND cm.owner_id = $2
       ORDER BY cm.chapter_number, cm.created_at`,
      [courseId, userId]
    );

    // Group by chapter number
    const chapters = {};
    for (const row of result.rows) {
      const chapterNum = row.chapter_number;
      if (!chapters[chapterNum]) {
        chapters[chapterNum] = [];
      }
      chapters[chapterNum].push({
        id: row.id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        chapterTitle: row.chapter_title,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        createdAt: row.created_at
      });
    }

    res.json({ chapters });
  } catch (error) {
    console.error('[tier2/chapter-sources] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to get chapter sources' });
  }
});

export default router;
