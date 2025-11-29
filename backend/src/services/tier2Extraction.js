/**
 * Tier 2 Chapter Extraction Service
 *
 * Extracts individual chapters from multi-chapter PDFs
 * Splits PDF by page range and extracts markdown
 */

import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

/**
 * Parse extraction response with summary
 * Expected format:
 * # Chapter_5: Introduction to Algorithms
 *
 * [Full chapter content in markdown]
 *
 * ---
 * # SUMMARY
 * [2-3 paragraph summary]
 */
function parseChapterWithSummary(response) {
  // Find the summary marker (look for --- followed by # SUMMARY)
  // This is more robust than splitting on just --- (which could appear in markdown content)
  const summaryPattern = /\n---+\s*\n#\s*SUMMARY/i;
  const summaryMatch = response.search(summaryPattern);

  if (summaryMatch === -1) {
    console.error('[parseChapterWithSummary] Could not find summary separator. Response preview:');
    console.error(response.substring(0, 500) + '...');
    console.error('[parseChapterWithSummary] Response end:');
    console.error('...' + response.substring(response.length - 500));
    throw new Error('Could not find summary separator (--- followed by # SUMMARY)');
  }

  // Split at the summary marker
  const contentPart = response.substring(0, summaryMatch).trim();
  const summaryPart = response.substring(summaryMatch).trim();

  console.log(`[parseChapterWithSummary] Split into content (${contentPart.length} chars) and summary (${summaryPart.length} chars)`);

  // Part 1: Parse chapter content
  const lines = contentPart.split('\n');

  // Find the first # heading
  let chapterNumber = null;
  let chapterTitle = null;
  let contentStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      const heading = line.substring(2).trim();

      // Parse format: Chapter_5: Title or just Chapter 5: Title
      const match = heading.match(/Chapter[_\s]*(\d+):\s*(.+)/i);

      if (match) {
        chapterNumber = parseInt(match[1], 10);
        chapterTitle = match[2].trim();
        contentStartIndex = i + 1;
        break;
      }
    }
  }

  if (!chapterNumber || !chapterTitle) {
    console.error('[parseChapterWithSummary] Could not parse chapter heading. First 10 lines:');
    console.error(lines.slice(0, 10).join('\n'));
    throw new Error('Could not parse chapter heading. Expected format: # Chapter_N: Title');
  }

  // Get content after the heading
  const contentLines = lines.slice(contentStartIndex);
  const markdown = contentLines.join('\n').trim();

  console.log(`[parseChapterWithSummary] Parsed Chapter ${chapterNumber}: ${chapterTitle}`);

  // Part 2: Parse summary
  const summaryStartMatch = summaryPart.match(/#\s*SUMMARY/i);
  if (!summaryStartMatch) {
    console.error('[parseChapterWithSummary] Could not find # SUMMARY marker in summary part:');
    console.error(summaryPart.substring(0, 200));
    throw new Error('Could not find # SUMMARY marker');
  }

  const summaryStartIndex = summaryStartMatch.index + summaryStartMatch[0].length;
  const summary = summaryPart.substring(summaryStartIndex).trim();

  console.log(`[parseChapterWithSummary] Extracted summary (${summary.length} chars)`);

  return {
    chapterNumber,
    chapterTitle,
    markdown,
    summary
  };
}

/**
 * Split PDF into a specific page range
 *
 * @param {string} sourcePdfPath - Path to source PDF
 * @param {number} pageStart - Starting page (1-indexed)
 * @param {number} pageEnd - Ending page (1-indexed, inclusive)
 * @returns {Promise<string>} - Path to temporary split PDF
 */
async function splitPdfByPageRange(sourcePdfPath, pageStart, pageEnd) {
  console.log(`[tier2Extraction] Splitting PDF pages ${pageStart}-${pageEnd}`);

  // Read source PDF
  const pdfBuffer = await fs.readFile(sourcePdfPath);
  const sourcePdf = await PDFDocument.load(pdfBuffer);

  // Create new PDF with selected pages
  const newPdf = await PDFDocument.create();

  // Copy pages (convert from 1-indexed to 0-indexed)
  const pageIndices = [];
  for (let i = pageStart - 1; i < pageEnd; i++) {
    if (i < sourcePdf.getPageCount()) {
      pageIndices.push(i);
    }
  }

  const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
  copiedPages.forEach(page => newPdf.addPage(page));

  // Save to temp file
  const tempPath = path.join(os.tmpdir(), `chapter_${randomUUID()}.pdf`);
  const pdfBytes = await newPdf.save();
  await fs.writeFile(tempPath, pdfBytes);

  console.log(`[tier2Extraction] Split PDF saved to: ${tempPath} (${copiedPages.length} pages)`);

  return tempPath;
}

/**
 * Extract a single chapter from a PDF
 *
 * @param {string} pdfPath - Path to full PDF
 * @param {number} chapterNumber - Chapter number
 * @param {string} chapterTitle - Chapter title (hint for LLM)
 * @param {number} pageStart - Starting page (1-indexed)
 * @param {number} pageEnd - Ending page (1-indexed, inclusive)
 * @returns {Promise<{chapterNumber: number, chapterTitle: string, markdown: string}>}
 */
export async function extractSingleChapter(pdfPath, chapterNumber, chapterTitle, pageStart, pageEnd) {
  console.log(`[tier2Extraction] Extracting Chapter ${chapterNumber}: ${chapterTitle} (pages ${pageStart}-${pageEnd})`);

  let tempPdfPath = null;

  try {
    // Split PDF to just the chapter pages
    tempPdfPath = await splitPdfByPageRange(pdfPath, pageStart, pageEnd);

    // Extract markdown from chapter pages
    const provider = await createGeminiVisionProvider();

    const systemPrompt = `You are an expert at extracting educational content from textbook chapters and lecture notes.

**YOUR TASK:**
Extract this chapter as clean, faithful markdown and generate a summary.

**CRITICAL OUTPUT FORMAT:**
You must output TWO parts separated by --- (three dashes on a line by themselves):

Part 1: MARKDOWN CONTENT
Part 2: CHAPTER SUMMARY

**EXACT FORMAT:**

# Chapter_${chapterNumber}: ${chapterTitle}

[Full chapter content in markdown with proper formatting...]

---

# SUMMARY

[Write a comprehensive 2-3 paragraph summary of this chapter. This summary will be used when this chapter is a supplemental source for lesson generation, so it should capture the key concepts, main topics covered, and important learning points. Make it detailed enough to provide valuable context.]

**EXTRACTION RULES:**

**Content to Include:**
- All text content, preserving structure and meaning
- All equations and formulas (use LaTeX: inline $x^2$ and display $$E=mc^2$$)
- All tables (markdown table format)
- All code examples (use code blocks with language)
- All definitions, theorems, examples, exercises

**Images:**
Replace each image with a detailed textual description in this format:
![Description of the image that would allow reconstruction]

Example:
![Tree data structure with 5 nodes: root node A at top, connects to nodes B and C below, B connects to D and E at bottom. Arrows show parent-child relationships.]

For diagrams, charts, graphs:
- Describe structure and relationships
- Include key labels and values
- Describe visual patterns
- Use arrays/tables if helpful

**Content to Exclude:**
- **Metadata:** Course codes (e.g., "ECE356", "CS101"), instructor names (e.g., "Jeff Zarnett"), semester/term (e.g., "Fall 2025"), lecture dates/times (e.g., "2023-09-12"), university names
- **References & Citations:** Bibliographies, reference lists, "References" sections (e.g., "[SKS11] Abraham Silberschatz..."), citation lists, "Further Reading" sections
- **Non-content elements:** Page numbers, headers, footers, running headers, margin notes, chapter/section numbers in margins
- **Administrative:** Copyright notices, ISBN numbers, publication details, acknowledgments, prefaces, author information
- **Navigation:** Table of contents sections
- **Anything not directly educational content**

**Formatting:**
- Use # for chapter title (already provided above)
- Use ## for major sections within the chapter
- Use ### for subsections
- Use **bold** for key terms and definitions
- Use *italic* for emphasis
- Preserve lists, numbering, bullet points
- Keep equation formatting clean

**Quality Standards:**
- Be faithful to the original text
- Preserve technical accuracy
- Don't summarize or skip content in the markdown
- Extract everything valuable for learning
- Make the summary comprehensive but concise`;

    const userPrompt = `Extract this chapter with TWO parts separated by ---:

**Part 1: MARKDOWN CONTENT**
Start with: # Chapter_${chapterNumber}: ${chapterTitle}
Then extract all content with proper formatting, replacing images with descriptions.

**Part 2: SUMMARY** (after ---)
Write a comprehensive 2-3 paragraph summary capturing key concepts and learning points.

**IMPORTANT - EXCLUDE:**
- Course metadata (course codes, instructor names, dates like "Fall 2025" or "2023-09-12")
- References/bibliographies sections at the end
- Page numbers, headers, footers
- Any non-educational administrative content

Remember: TWO parts separated by --- marker!`;

    console.log('[tier2Extraction] Calling Gemini Vision API...');

    const response = await provider.extractMarkdown(tempPdfPath, systemPrompt, userPrompt);

    console.log(`[tier2Extraction] Received response (${response.length} chars)`);

    // Parse extraction response (markdown + summary)
    const parsed = parseChapterWithSummary(response);

    console.log(`[tier2Extraction] Parsed chapter ${parsed.chapterNumber}: ${parsed.chapterTitle}`);
    console.log(`[tier2Extraction] Markdown length: ${parsed.markdown.length} chars`);
    console.log(`[tier2Extraction] Summary length: ${parsed.summary.length} chars`);

    return {
      chapterNumber: parsed.chapterNumber,
      chapterTitle: parsed.chapterTitle,
      markdown: parsed.markdown,
      summary: parsed.summary
    };
  } finally {
    // Cleanup temp file
    if (tempPdfPath) {
      try {
        await fs.rm(tempPdfPath, { force: true });
        console.log(`[tier2Extraction] Cleaned up temp file: ${tempPdfPath}`);
      } catch (err) {
        console.warn(`[tier2Extraction] Failed to cleanup temp file: ${err.message}`);
      }
    }
  }
}
