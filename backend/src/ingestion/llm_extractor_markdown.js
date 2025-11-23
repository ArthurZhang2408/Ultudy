/**
 * Plain Markdown PDF Extraction - Two-Phase Approach
 *
 * Phase 1: Analyze PDF structure (JSON metadata: chapter count, page ranges)
 * Phase 2: Extract content as plain markdown (NO JSON)
 *   - Single chapter: Extract full PDF directly
 *   - Multi-chapter: Split PDF by page ranges, extract each separately
 *
 * Benefits:
 * - Handles both single and multi-chapter PDFs intelligently
 * - Avoids token limits by splitting large PDFs
 * - No JSON escaping issues with LaTeX/special chars
 * - Native $ and $$ for math work perfectly
 * - Tables render correctly
 */

import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

/**
 * Extract PDF as plain markdown with chapter structure
 * Uses smart single-call approach: detect single vs multi-chapter in one LLM call
 */
export async function extractPdfAsMarkdown(pdfPath) {
  console.log('[llm_extractor_markdown] ========================================');
  console.log('[llm_extractor_markdown] 📝 SMART SINGLE-CALL EXTRACTION');
  console.log('[llm_extractor_markdown] ========================================');

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are analyzing and extracting educational content from a PDF.

**DEFINITION**: A "chapter" is a chapter/lecture/unit/module of a textbook or course material.

**IF THIS PDF CONTAINS A SINGLE CHAPTER:**
Start with a metadata line, then extract all content as markdown.
Format: CHAPTER: <number> <title>
Then on next line start the markdown content.

Example:
CHAPTER: 3 Relational Query Languages
[markdown content starts here...]

**IF THIS PDF CONTAINS MULTIPLE CHAPTERS:**
List all chapters in this exact format (one per line, space-separated):
<chapter_number> <chapter_title> <page_start> <page_end>

Example for multi-chapter:
3 Database_Systems 1 6
4 Relational_Algebra 7 12
5 SQL_Queries 13 20

**IMPORTANT:**
- Replace spaces in chapter titles with underscores for multi-chapter list
- page_start and page_end are inclusive
- Do NOT extract content for multi-chapter PDFs, only list the chapters`;

  const userPrompt = `Analyze this PDF:

**If it's a SINGLE chapter/lecture/unit:**
Extract ALL educational content as plain markdown.

**WHAT TO INCLUDE:**
- Main content: concepts, explanations, definitions
- Examples and demonstrations
- Math equations: $inline$ and $$display$$
- Tables: | Col 1 | Col 2 |
- Diagrams descriptions
- Notes, theorems, proofs

**WHAT TO EXCLUDE:**
- Course codes, lecture numbers, instructor names, dates (e.g., "ECE356: Database Systems Fall 2025")
- Page numbers
- Footnotes
- References/Bibliography sections
- Repeating headers/footers

**If it's MULTIPLE chapters:**
List them in format: <chapter_number> <chapter_title> <page_start> <page_end>
(One line per chapter, use underscores for spaces in titles)`;

  console.log('[llm_extractor_markdown] 🚀 Calling LLM for smart extraction...');
  const response = await provider.extractAsPlainText(pdfPath, systemPrompt, userPrompt);
  console.log(`[llm_extractor_markdown] ✅ Received ${response.length} characters`);

  // Detect if response is a chapter list or markdown content
  const isChapterList = detectChapterList(response);

  if (isChapterList) {
    // Multi-chapter: parse list and extract each chapter separately
    console.log('[llm_extractor_markdown] 📊 Detected multi-chapter PDF');
    const chapters = parseChapterList(response);
    console.log(`[llm_extractor_markdown] 📚 Found ${chapters.length} chapters`);

    const result = await extractMultiChapterPdf(pdfPath, chapters);
    console.log(`[llm_extractor_markdown] ✅ Extraction complete: ${result.total_chapters} chapter(s)`);
    return result;
  } else {
    // Single-chapter: response contains CHAPTER: header + markdown content
    console.log('[llm_extractor_markdown] 📊 Detected single-chapter PDF');

    // Parse the CHAPTER: header and extract metadata
    const { chapter_number, title, markdown } = parseSingleChapterResponse(response);

    const result = {
      chapters: [{
        chapter_number,
        title,
        page_start: 1,
        page_end: 1,
        markdown
      }],
      total_chapters: 1
    };

    console.log(`[llm_extractor_markdown] ✅ Chapter ${chapter_number}: "${title}" (${markdown.length} chars)`);
    return result;
  }
}

/**
 * Parse single-chapter response with CHAPTER: header
 * Format: CHAPTER: <number> <title>\n<markdown content>
 */
function parseSingleChapterResponse(response) {
  const lines = response.trim().split('\n');

  // Check if first line is CHAPTER: header
  const firstLine = lines[0].trim();
  const chapterHeaderPattern = /^CHAPTER:\s+(\d+)\s+(.+)$/;
  const match = firstLine.match(chapterHeaderPattern);

  if (match) {
    const chapter_number = match[1];
    const title = match[2].trim();
    const markdown = lines.slice(1).join('\n').trim();

    console.log(`[parseSingleChapterResponse] Parsed chapter ${chapter_number}: "${title}"`);

    return { chapter_number, title, markdown };
  } else {
    // Fallback: no CHAPTER: header found, use defaults
    console.warn('[parseSingleChapterResponse] No CHAPTER: header found, using defaults');

    return {
      chapter_number: '1',
      title: 'Chapter Content',
      markdown: response.trim()
    };
  }
}

/**
 * Detect if response is a chapter list (multi-chapter) or markdown (single-chapter)
 */
function detectChapterList(response) {
  const lines = response.trim().split('\n').filter(line => line.trim());

  // If first line starts with "CHAPTER:", it's a single-chapter response
  if (lines[0]?.trim().startsWith('CHAPTER:')) {
    return false;
  }

  // If response is very short (< 2000 chars) and has multiple lines with number pattern
  if (response.length < 2000 && lines.length >= 1 && lines.length <= 50) {
    // Check if most lines match the pattern: <number> <title> <number> <number>
    const chapterPattern = /^\d+\s+\S+\s+\d+\s+\d+$/;
    const matchingLines = lines.filter(line => chapterPattern.test(line.trim()));

    // If more than 50% of lines match the pattern, it's a chapter list
    if (matchingLines.length >= Math.max(1, lines.length * 0.5)) {
      return true;
    }
  }

  return false;
}

/**
 * Parse chapter list from text response
 * Format: <chapter_number> <chapter_title> <page_start> <page_end>
 */
function parseChapterList(response) {
  console.log('[parseChapterList] 🔍 Parsing chapter list from text response');

  const lines = response.trim().split('\n').filter(line => line.trim());
  const chapters = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);

    // Expect at least 4 parts: chapter_number, title, page_start, page_end
    if (parts.length >= 4) {
      const chapter_number = parts[0];
      const title = parts[parts.length - 3].replace(/_/g, ' '); // Title is everything except last 3 parts
      const page_start = parseInt(parts[parts.length - 2], 10);
      const page_end = parseInt(parts[parts.length - 1], 10);

      // Reconstruct title from all middle parts
      const titleParts = parts.slice(1, parts.length - 2);
      const fullTitle = titleParts.join(' ').replace(/_/g, ' ');

      chapters.push({
        chapter_number,
        title: fullTitle,
        page_start,
        page_end
      });

      console.log(`[parseChapterList]   Chapter ${chapter_number}: "${fullTitle}" (pages ${page_start}-${page_end})`);
    }
  }

  console.log(`[parseChapterList] ✅ Parsed ${chapters.length} chapter(s)`);
  return chapters;
}

/**
 * Extract multi-chapter PDF by splitting and processing each chapter
 */
async function extractMultiChapterPdf(pdfPath, chaptersInfo) {
  console.log(`[extractMultiChapterPdf] 📚 Extracting multi-chapter PDF`);
  console.log(`[extractMultiChapterPdf] Processing ${chaptersInfo.length} chapters`);

  // Load source PDF ONCE (optimization: reuse for all chapter splits)
  console.log(`[extractMultiChapterPdf] 📖 Loading source PDF...`);
  const pdfBytes = await fs.readFile(pdfPath);
  const sourcePdfDoc = await PDFDocument.load(pdfBytes);
  console.log(`[extractMultiChapterPdf] ✅ Source PDF loaded (${sourcePdfDoc.getPageCount()} pages)`);

  const allChapters = [];

  for (let i = 0; i < chaptersInfo.length; i++) {
    const chapterInfo = chaptersInfo[i];
    console.log(`[extractMultiChapterPdf] Processing ${i + 1}/${chaptersInfo.length}: Chapter ${chapterInfo.chapter_number}`);

    let chapterPdfPath = null;

    try {
      // Split PDF to extract just this chapter's pages (pass loaded PDF doc)
      chapterPdfPath = await createChapterPdf(
        sourcePdfDoc,
        chapterInfo.page_start,
        chapterInfo.page_end,
        chapterInfo.chapter_number
      );

      // Extract markdown from this chapter
      const markdown = await extractChapterContent(chapterPdfPath);

      // Validate markdown length
      if (markdown.length < 100) {
        console.warn(`[extractMultiChapterPdf] ⚠️ Chapter ${chapterInfo.chapter_number} has very short content (${markdown.length} chars) - may be extraction error`);
      }

      if (markdown.length > 200000) {
        console.warn(`[extractMultiChapterPdf] ⚠️ Chapter ${chapterInfo.chapter_number} has very long content (${markdown.length} chars) - may contain hallucination`);
      }

      allChapters.push({
        chapter_number: chapterInfo.chapter_number,
        title: chapterInfo.title,
        page_start: chapterInfo.page_start,
        page_end: chapterInfo.page_end,
        markdown: markdown.trim()
      });

      console.log(`[extractMultiChapterPdf] ✅ Chapter ${chapterInfo.chapter_number}: ${markdown.length} chars`);
    } catch (error) {
      console.error(`[extractMultiChapterPdf] ❌ Failed to extract Chapter ${chapterInfo.chapter_number}:`);
      console.error(`[extractMultiChapterPdf] Error: ${error.message}`);

      // Add chapter with error message instead of failing entire extraction
      allChapters.push({
        chapter_number: chapterInfo.chapter_number,
        title: chapterInfo.title,
        page_start: chapterInfo.page_start,
        page_end: chapterInfo.page_end,
        markdown: `# Extraction Failed\n\nChapter ${chapterInfo.chapter_number}: ${chapterInfo.title}\n\nError: ${error.message}\n\nPlease try re-uploading this chapter separately.`,
        extraction_error: true
      });

      console.log(`[extractMultiChapterPdf] ⚠️ Added error placeholder for Chapter ${chapterInfo.chapter_number}`);
    } finally {
      // Cleanup temp file
      if (chapterPdfPath) {
        await fs.rm(chapterPdfPath, { force: true });
      }
    }
  }

  console.log(`[extractMultiChapterPdf] ✅ Extracted ${allChapters.length} chapters`);

  return {
    chapters: allChapters,
    total_chapters: allChapters.length
  };
}

/**
 * Extract markdown content from a single chapter PDF
 */
async function extractChapterContent(pdfPath) {
  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are extracting educational content from a PDF chapter.

**CRITICAL: Respond in PLAIN MARKDOWN only. NO JSON, NO DELIMITERS.**

**CONTENT FILTERING - EXCLUDE:**
- Course codes, lecture numbers, instructor names, dates
- Page numbers
- Footnotes
- References/Bibliography sections
- Repeating headers/footers

**FORMATTING:**
- Use $...$ for inline math, $$...$$ for display math
- Tables: | markdown | format |
- Include ALL educational content`;

  const userPrompt = `Extract ALL educational content as plain markdown.

Include: concepts, examples, equations, tables, diagrams, theorems, proofs
Exclude: metadata, page numbers, footnotes, references

Start immediately with content.`;

  const markdown = await provider.extractAsPlainText(pdfPath, systemPrompt, userPrompt);
  return markdown;
}

/**
 * Create a chapter PDF from an already-loaded source PDF document
 * Optimized: Reuses loaded PDFDocument instead of reading/parsing file each time
 */
async function createChapterPdf(sourcePdfDoc, startPage, endPage, chapterNumber) {
  console.log(`[createChapterPdf] ✂️ Creating chapter ${chapterNumber} PDF (pages ${startPage}-${endPage})`);

  const chapterPdf = await PDFDocument.create();

  const startIndex = startPage - 1;
  const endIndex = Math.min(endPage - 1, sourcePdfDoc.getPageCount() - 1);

  const pagesToCopy = [];
  for (let i = startIndex; i <= endIndex; i++) {
    pagesToCopy.push(i);
  }

  const copiedPages = await chapterPdf.copyPages(sourcePdfDoc, pagesToCopy);
  copiedPages.forEach(page => chapterPdf.addPage(page));

  const tempPath = path.join(os.tmpdir(), `chapter_${chapterNumber}_${randomUUID()}.pdf`);
  const chapterPdfBytes = await chapterPdf.save();
  await fs.writeFile(tempPath, chapterPdfBytes);

  console.log(`[createChapterPdf] ✅ Created temp PDF: ${tempPath} (${copiedPages.length} pages)`);
  return tempPath;
}

export default extractPdfAsMarkdown;
