import express from 'express';
import { queryRead, queryWrite } from '../db/index.js';
import { requireTier, checkUsageLimit, enforceChapterLimit } from '../middleware/tierCheck.js';
import { trackChapterGeneration } from '../services/usageTracking.js';
import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';
import { StorageService } from '../lib/storage.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const router = express.Router();

// ============================================================
// TIER 2 CHAPTER DETECTION
// ============================================================

/**
 * POST /api/chapters/detect
 * Detect chapters in a multi-chapter PDF (Tier 2 only)
 *
 * Body: { document_id: string }
 * Returns: { type: 'single' | 'multi', chapters: [...] }
 */
router.post('/detect', requireTier('tier2'), checkUsageLimit, async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { document_id } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required' });
    }

    console.log(`[chapters/detect] Detecting chapters for document ${document_id}`);

    // Get document info
    const docResult = await queryRead(
      'SELECT * FROM documents WHERE id = $1 AND owner_id = $2',
      [document_id, userId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult.rows[0];

    // Get PDF from storage
    const storageService = new StorageService({});
    const storageKey = StorageService.generatePdfKey(userId, document_id);

    console.log(`[chapters/detect] Downloading PDF from storage: ${storageKey}`);
    const pdfBuffer = await storageService.download(storageKey);

    // Write to temp file for vision processing
    const tempPdfPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);
    await fs.writeFile(tempPdfPath, pdfBuffer);

    try {
      // Use Gemini Vision to detect chapters
      const provider = await createGeminiVisionProvider();

      const prompt = `Analyze this PDF document and determine if it's a single-chapter or multi-chapter document.

If SINGLE-CHAPTER:
Return JSON: { "type": "single", "chapter_number": 1, "title": "..." }

If MULTI-CHAPTER:
For each chapter, extract:
- chapter_number (integer)
- chapter_title (string)
- page_start (integer, 1-indexed, use actual PDF page numbers)
- page_end (integer, 1-indexed, estimated if not explicit)

Return JSON:
{
  "type": "multi",
  "chapters": [
    {
      "chapter_number": 1,
      "chapter_title": "Introduction",
      "page_start": 1,
      "page_end": 15
    },
    {
      "chapter_number": 2,
      "chapter_title": "Methodology",
      "page_start": 16,
      "page_end": 30
    }
  ]
}

IMPORTANT:
- Only include chapters that are clearly marked in the document
- Use the actual page numbers from the PDF (not the printed page numbers in the document)
- If unsure about page_end, estimate based on next chapter's page_start
- Return ONLY valid JSON, no additional text`;

      const result = await provider.generateFromPdf(tempPdfPath, prompt);

      // Parse JSON response
      let detection;
      try {
        detection = JSON.parse(result);
      } catch (parseError) {
        // Try to extract JSON from markdown code block
        const jsonMatch = result.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          detection = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse chapter detection response');
        }
      }

      console.log(`[chapters/detect] Detected type: ${detection.type}`);

      if (detection.type === 'multi') {
        console.log(`[chapters/detect] Found ${detection.chapters.length} chapters`);

        // Store chapter metadata in database
        for (const chapter of detection.chapters) {
          await queryWrite(
            `INSERT INTO chapter_metadata
             (document_id, course_id, chapter_number, chapter_title, page_start, page_end, owner_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (document_id, chapter_number) DO NOTHING`,
            [
              document_id,
              document.course_id,
              chapter.chapter_number,
              chapter.chapter_title,
              chapter.page_start,
              chapter.page_end,
              userId
            ]
          );
        }
      }

      res.json(detection);
    } finally {
      // Cleanup temp file
      await fs.rm(tempPdfPath, { force: true });
    }
  } catch (error) {
    console.error('[chapters/detect] Error:', error);
    res.status(500).json({ error: 'Failed to detect chapters', message: error.message });
  }
});

// ============================================================
// TIER 2 CHAPTER EXTRACTION
// ============================================================

/**
 * POST /api/chapters/extract
 * Extract specific chapters and convert to markdown (Tier 2 only)
 *
 * Body: {
 *   document_id: string,
 *   chapter_numbers: number[] - array of chapter numbers to extract
 * }
 */
router.post('/extract', requireTier('tier2'), checkUsageLimit, enforceChapterLimit, async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { document_id, chapter_numbers } = req.body;

    if (!document_id || !chapter_numbers || !Array.isArray(chapter_numbers)) {
      return res.status(400).json({ error: 'document_id and chapter_numbers[] are required' });
    }

    console.log(`[chapters/extract] Extracting chapters ${chapter_numbers.join(', ')} for document ${document_id}`);

    // Get chapter metadata
    const metaResult = await queryRead(
      `SELECT * FROM chapter_metadata
       WHERE document_id = $1 AND chapter_number = ANY($2) AND owner_id = $3`,
      [document_id, chapter_numbers, userId]
    );

    if (metaResult.rows.length !== chapter_numbers.length) {
      return res.status(404).json({ error: 'Some chapters not found. Run /detect first.' });
    }

    // Get PDF from storage
    const storageService = new StorageService({});
    const storageKey = StorageService.generatePdfKey(userId, document_id);

    console.log(`[chapters/extract] Downloading PDF from storage: ${storageKey}`);
    const pdfBuffer = await storageService.download(storageKey);

    // Write to temp file
    const tempPdfPath = path.join(os.tmpdir(), `${randomUUID()}.pdf`);
    await fs.writeFile(tempPdfPath, pdfBuffer);

    const extractedChapters = [];

    try {
      const provider = await createGeminiVisionProvider();

      // Extract each chapter
      for (const chapterMeta of metaResult.rows) {
        console.log(`[chapters/extract] Processing Chapter ${chapterMeta.chapter_number}: ${chapterMeta.chapter_title}`);

        // Check if already extracted (cached)
        if (chapterMeta.markdown_content && chapterMeta.markdown_content.length > 0) {
          console.log(`[chapters/extract] Using cached markdown for Chapter ${chapterMeta.chapter_number}`);
          extractedChapters.push({
            chapter_number: chapterMeta.chapter_number,
            chapter_title: chapterMeta.chapter_title,
            markdown: chapterMeta.markdown_content,
            cached: true
          });
          continue;
        }

        // Extract markdown using Gemini Vision
        const prompt = `Convert this chapter to clean, well-formatted markdown.

Chapter: ${chapterMeta.chapter_title}
Pages: ${chapterMeta.page_start}-${chapterMeta.page_end}

Requirements:
- Preserve all headings, subheadings
- Keep all formulas in LaTeX format ($..$ for inline, $$..$$ for display)
- Include all diagrams/figures with descriptions
- Maintain bullet points and numbered lists
- Remove headers/footers/page numbers
- Use ## for main section headings within the chapter
- Use ### for subsections

Return ONLY the markdown, no additional commentary or JSON wrapper.`;

        const markdown = await provider.generateFromPdf(tempPdfPath, prompt);

        // Store markdown in database (cache for future use)
        await queryWrite(
          `UPDATE chapter_metadata
           SET markdown_content = $1, updated_at = NOW()
           WHERE id = $2`,
          [markdown, chapterMeta.id]
        );

        console.log(`[chapters/extract] Extracted ${markdown.length} chars for Chapter ${chapterMeta.chapter_number}`);

        extractedChapters.push({
          chapter_number: chapterMeta.chapter_number,
          chapter_title: chapterMeta.chapter_title,
          markdown: markdown,
          cached: false
        });

        // Track chapter generation
        await trackChapterGeneration(userId, 1);
      }

      res.json({
        success: true,
        chapters: extractedChapters
      });
    } finally {
      // Cleanup temp file
      await fs.rm(tempPdfPath, { force: true });
    }
  } catch (error) {
    console.error('[chapters/extract] Error:', error);
    res.status(500).json({ error: 'Failed to extract chapters', message: error.message });
  }
});

// ============================================================
// TIER 2 MULTI-SOURCE MERGING
// ============================================================

/**
 * POST /api/chapters/merge
 * Merge multiple sources for the same chapter (Tier 2 only)
 *
 * Body: {
 *   chapter_number: number,
 *   course_id: string,
 *   chapter_metadata_ids: string[] - array of chapter_metadata IDs to merge
 * }
 */
router.post('/merge', requireTier('tier2'), async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { chapter_number, course_id, chapter_metadata_ids } = req.body;

    if (!chapter_number || !course_id || !chapter_metadata_ids || !Array.isArray(chapter_metadata_ids)) {
      return res.status(400).json({
        error: 'chapter_number, course_id, and chapter_metadata_ids[] are required'
      });
    }

    console.log(`[chapters/merge] Merging ${chapter_metadata_ids.length} sources for Chapter ${chapter_number}`);

    // Get all chapter markdowns
    const chaptersResult = await queryRead(
      `SELECT * FROM chapter_metadata
       WHERE id = ANY($1) AND owner_id = $2 AND chapter_number = $3`,
      [chapter_metadata_ids, userId, chapter_number]
    );

    if (chaptersResult.rows.length !== chapter_metadata_ids.length) {
      return res.status(404).json({ error: 'Some chapter sources not found' });
    }

    const sources = chaptersResult.rows;

    // If only one source, return it directly
    if (sources.length === 1) {
      return res.json({
        merged_markdown: sources[0].markdown_content,
        sources_used: [{ id: sources[0].id, title: sources[0].chapter_title }],
        conflict_detected: false
      });
    }

    // Step 1: Content conflict detection
    const provider = await createGeminiVisionProvider();

    const conflictPrompt = `Analyze these two markdown documents and determine if they cover the same topic.

Document 1:
${sources[0].markdown_content.substring(0, 2000)}

Document 2:
${sources[1].markdown_content.substring(0, 2000)}

Return JSON:
{
  "same_topic": true/false,
  "similarity_score": 0.0-1.0,
  "topic_1": "brief description",
  "topic_2": "brief description",
  "warning": "optional warning message if different topics"
}`;

    const conflictResponse = await provider.generate(conflictPrompt);
    let conflictDetection;

    try {
      conflictDetection = JSON.parse(conflictResponse);
    } catch (parseError) {
      const jsonMatch = conflictResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        conflictDetection = JSON.parse(jsonMatch[1]);
      } else {
        conflictDetection = { same_topic: true, similarity_score: 1.0 };
      }
    }

    console.log(`[chapters/merge] Conflict detection: same_topic=${conflictDetection.same_topic}, similarity=${conflictDetection.similarity_score}`);

    // Step 2: Deduplication and merging
    const markdownSources = sources.map((s, i) => `## Source ${i + 1}: ${s.chapter_title}\n${s.markdown_content}`).join('\n\n---\n\n');

    const mergePrompt = `You are given multiple markdown documents covering the same topic (Chapter ${chapter_number}).
Your task is to merge them into a single, comprehensive document while:

1. Removing duplicate content
2. Preserving unique information from each source
3. Maintaining clear source attribution
4. Keeping the best explanation for overlapping concepts

Documents:
${markdownSources}

Return the merged markdown with this structure:
# Chapter ${chapter_number}: ${sources[0].chapter_title}

> **Sources:** ${sources.map(s => s.chapter_title).join(', ')}

## [Section 1 Name]
[Content with inline citations like: "According to Source 1, ..." or "(Source 2)"]

## [Section 2 Name]
[Content...]

Include ALL unique information. When content overlaps, choose the clearest explanation.
Return ONLY the merged markdown, no additional commentary.`;

    const mergedMarkdown = await provider.generate(mergePrompt);

    console.log(`[chapters/merge] Merged markdown: ${mergedMarkdown.length} chars`);

    res.json({
      merged_markdown: mergedMarkdown,
      sources_used: sources.map(s => ({ id: s.id, title: s.chapter_title })),
      conflict_detected: !conflictDetection.same_topic,
      conflict_info: conflictDetection
    });
  } catch (error) {
    console.error('[chapters/merge] Error:', error);
    res.status(500).json({ error: 'Failed to merge chapters', message: error.message });
  }
});

// ============================================================
// GET CHAPTERS BY COURSE AND NUMBER
// ============================================================

/**
 * GET /api/chapters/by-course/:course_id/:chapter_number
 * Get all sources for a specific chapter number in a course (Tier 2 only)
 */
router.get('/by-course/:course_id/:chapter_number', requireTier('tier2'), async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { course_id, chapter_number } = req.params;

    const result = await queryRead(
      `SELECT cm.*, d.title as document_name
       FROM chapter_metadata cm
       JOIN documents d ON cm.document_id = d.id
       WHERE cm.course_id = $1 AND cm.chapter_number = $2 AND cm.owner_id = $3
       ORDER BY cm.created_at ASC`,
      [course_id, parseInt(chapter_number), userId]
    );

    res.json({
      chapter_number: parseInt(chapter_number),
      sources: result.rows.map(row => ({
        id: row.id,
        document_id: row.document_id,
        document_name: row.document_name,
        chapter_title: row.chapter_title,
        page_range: `${row.page_start}-${row.page_end}`,
        has_markdown: !!row.markdown_content
      }))
    });
  } catch (error) {
    console.error('[chapters/by-course] Error:', error);
    res.status(500).json({ error: 'Failed to get chapters', message: error.message });
  }
});

export default router;
