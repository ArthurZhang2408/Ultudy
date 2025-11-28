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
import { chapterExtractionQueue } from '../jobs/queue.js';
import { createJobTracker } from '../jobs/tracking.js';
import { createTenantHelpers } from '../db/tenant.js';
import pool from '../db/index.js';

const router = express.Router();

// Initialize dependencies
const tenantHelpers = createTenantHelpers(pool);
const jobTracker = createJobTracker(tenantHelpers);

/**
 * POST /api/tier2/extract-chapters
 *
 * Queue chapter extraction jobs for selected chapters from a multi-chapter PDF
 * Returns immediately with job IDs for tracking
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

    console.log(`[tier2/extract-chapters] Queuing ${chapters.length} chapter extraction jobs for document ${documentId}`);

    // Queue individual job for each chapter
    const jobs = [];
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];

      // Create job in database for tracking
      const jobId = await jobTracker.createJob(userId, 'chapter_extraction', {
        document_id: documentId,
        course_id: courseId,
        chapter_number: chapter.number,
        chapter_title: chapter.title,
        chapter_index: i + 1,
        total_chapters: chapters.length
      });

      // Queue the job
      await chapterExtractionQueue.add({
        jobId,
        ownerId: userId,
        documentId,
        storageKey,
        courseId,
        chapter,
        chapterIndex: i + 1,
        totalChapters: chapters.length
      });

      console.log(`[tier2/extract-chapters] Queued Chapter ${chapter.number}: ${chapter.title} (job ${jobId})`);

      jobs.push({
        jobId,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title
      });
    }

    console.log(`[tier2/extract-chapters] Successfully queued ${jobs.length} chapter extraction jobs`);

    res.json({
      success: true,
      total: chapters.length,
      jobs
    });
  } catch (error) {
    console.error('[tier2/extract-chapters] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to queue chapter extraction jobs' });
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
 * PATCH /api/tier2/chapter-markdown/:id/reassign
 *
 * Reassign a tier 2 source to a different chapter
 * Body: { chapterNumber: number | null }
 */
router.patch('/chapter-markdown/:id/reassign', async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { id } = req.params;
    const { chapterNumber } = req.body;

    if (chapterNumber !== null && (typeof chapterNumber !== 'number' || chapterNumber < 1)) {
      return res.status(400).json({ error: 'Invalid chapter number. Must be a positive number or null.' });
    }

    console.log(`[tier2/reassign] Reassigning source ${id} to chapter ${chapterNumber}`);

    // Verify ownership and update
    const result = await queryWrite(
      `UPDATE chapter_markdown
       SET chapter_number = $1, updated_at = NOW()
       WHERE id = $2 AND owner_id = $3
       RETURNING *`,
      [chapterNumber, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chapter markdown not found or access denied' });
    }

    console.log(`[tier2/reassign] Successfully reassigned source ${id} to chapter ${chapterNumber}`);

    res.json({
      success: true,
      source: result.rows[0]
    });
  } catch (error) {
    console.error('[tier2/reassign] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to reassign chapter' });
  }
});

/**
 * DELETE /api/tier2/chapter-markdown/:id
 *
 * Delete a tier 2 chapter markdown source
 */
router.delete('/chapter-markdown/:id', async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { id } = req.params;

    console.log(`[tier2/delete] Deleting chapter markdown source ${id}`);

    // Verify ownership and delete
    const result = await queryWrite(
      `DELETE FROM chapter_markdown
       WHERE id = $1 AND owner_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chapter markdown not found or access denied' });
    }

    console.log(`[tier2/delete] Successfully deleted chapter markdown source ${id}`);

    res.json({
      success: true,
      deletedId: id
    });
  } catch (error) {
    console.error('[tier2/delete] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete chapter markdown' });
  }
});

/**
 * GET /api/tier2/chapter-sources/:courseId
 *
 * Get all chapter sources for a course (grouped by chapter number)
 * Returns: { chapters: { [chapterNumber]: [{ id, documentId, documentTitle, chapterTitle, ... }] } }
 * Note: Uncategorized sources (null chapter_number) are grouped under key "uncategorized"
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
       ORDER BY cm.chapter_number NULLS LAST, cm.created_at`,
      [courseId, userId]
    );

    // Group by chapter number (use "uncategorized" for null chapter numbers)
    const chapters = {};
    for (const row of result.rows) {
      const chapterNum = row.chapter_number ?? 'uncategorized';
      if (!chapters[chapterNum]) {
        chapters[chapterNum] = [];
      }
      chapters[chapterNum].push({
        id: row.id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        chapterTitle: row.chapter_title,
        chapterNumber: row.chapter_number,
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
