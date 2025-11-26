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
import { cleanExtractedMarkdown } from './markdownCleaner.js';

/**
 * Parse single chapter markdown response
 * Expected format:
 * # Chapter_5: Introduction to Algorithms
 *
 * Content here...
 */
function parseChapterMarkdown(markdown) {
  const lines = markdown.split('\n');

  // Find the first # heading
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      const heading = line.substring(2).trim();

      // Parse format: Chapter_5: Title or just Chapter 5: Title
      const match = heading.match(/Chapter[_\s]*(\d+):\s*(.+)/i);

      if (match) {
        const chapterNumber = parseInt(match[1], 10);
        const chapterTitle = match[2].trim();

        // Get content after the heading
        const contentLines = lines.slice(i + 1);
        const content = contentLines.join('\n').trim();

        // Clean the markdown to remove metadata
        const cleanedContent = cleanExtractedMarkdown(content);

        return {
          chapterNumber,
          chapterTitle,
          markdown: cleanedContent
        };
      }
    }
  }

  throw new Error('Could not parse chapter heading. Expected format: # Chapter_N: Title');
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
Extract this chapter as clean, faithful markdown.

**OUTPUT FORMAT:**
Start with this EXACT format:

# Chapter_${chapterNumber}: ${chapterTitle}

[Full chapter content in markdown]

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
- Course information (course codes like "ECE356", instructor names, semester/term like "Fall 2025", lecture dates)
- References, bibliographies, acknowledgments sections
- Page numbers, headers, footers
- Chapter/section numbers that appear in margins
- Copyright notices, publication details
- Running headers
- Table of contents (if present)
- Anything not directly educational content

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
- Don't summarize or skip content
- Extract everything valuable for learning`;

    const userPrompt = `Extract this chapter as markdown.

Start with: # Chapter_${chapterNumber}: ${chapterTitle}

Then extract all content with proper formatting, replacing images with descriptions.`;

    console.log('[tier2Extraction] Calling Gemini Vision API...');

    const response = await provider.extractMarkdown(tempPdfPath, systemPrompt, userPrompt);

    console.log(`[tier2Extraction] Received response (${response.length} chars)`);

    // Parse response
    const parsed = parseChapterMarkdown(response);

    return {
      chapterNumber: parsed.chapterNumber,
      chapterTitle: parsed.chapterTitle,
      markdown: parsed.markdown
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
