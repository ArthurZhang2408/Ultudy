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
 * Parse one-pass extraction response
 * Expected format:
 * # CHAPTER_CONTENT
 *
 * # Chapter_5: Introduction to Algorithms
 * # SECTION: Introduction
 * [Content...]
 * # SECTION: Core Concepts
 * [Content...]
 *
 * ---
 * # CHAPTER_SUMMARY
 * [2-3 paragraph summary]
 *
 * ---
 * # SECTION_LIST
 * 1. Introduction - Basic introduction to algorithms
 * 2. Core Concepts - Key algorithmic concepts
 */
function parseOnePassExtraction(response) {
  // Split by --- markers
  const parts = response.split(/^---$/gm).map(part => part.trim());

  if (parts.length !== 3) {
    throw new Error(`Expected 3 parts (content, summary, sections), got ${parts.length}`);
  }

  // Part 1: Markdown content with sections
  const contentPart = parts[0];

  // Extract chapter heading (# Chapter_N: Title)
  const headingMatch = contentPart.match(/^#\s+Chapter[_\s]*(\d+):\s*(.+)$/m);
  if (!headingMatch) {
    throw new Error('Could not parse chapter heading. Expected format: # Chapter_N: Title');
  }

  const chapterNumber = parseInt(headingMatch[1], 10);
  const chapterTitle = headingMatch[2].trim();

  // Extract markdown content (everything after # CHAPTER_CONTENT)
  const contentStart = contentPart.indexOf('# CHAPTER_CONTENT');
  if (contentStart === -1) {
    throw new Error('Could not find # CHAPTER_CONTENT marker');
  }
  const markdown = contentPart.substring(contentStart + '# CHAPTER_CONTENT'.length).trim();

  // Part 2: Summary
  const summaryPart = parts[1];
  const summaryStart = summaryPart.indexOf('# CHAPTER_SUMMARY');
  if (summaryStart === -1) {
    throw new Error('Could not find # CHAPTER_SUMMARY marker');
  }
  const summary = summaryPart.substring(summaryStart + '# CHAPTER_SUMMARY'.length).trim();

  // Part 3: Section list
  const sectionsPart = parts[2];
  const sectionsStart = sectionsPart.indexOf('# SECTION_LIST');
  if (sectionsStart === -1) {
    throw new Error('Could not find # SECTION_LIST marker');
  }
  const sectionListText = sectionsPart.substring(sectionsStart + '# SECTION_LIST'.length).trim();

  // Parse section list: "1. Name - Description"
  const sections = [];
  const sectionLines = sectionListText.split('\n').filter(line => line.trim());

  for (const line of sectionLines) {
    const match = line.match(/^(\d+)\.\s+([^-]+)\s*-\s*(.+)$/);
    if (match) {
      sections.push({
        sectionNumber: parseInt(match[1], 10),
        sectionName: match[2].trim(),
        sectionDescription: match[3].trim()
      });
    }
  }

  return {
    chapterNumber,
    chapterTitle,
    markdown,
    summary,
    sections
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
Extract this chapter as clean, faithful markdown WITH clear section markers, plus generate a summary and section list.

**CRITICAL OUTPUT FORMAT:**
You must output THREE parts separated by --- (three dashes on a line by themselves):

Part 1: MARKDOWN CONTENT WITH SECTION MARKERS
Part 2: CHAPTER SUMMARY
Part 3: SECTION LIST

**EXACT FORMAT:**

# CHAPTER_CONTENT

# Chapter_${chapterNumber}: ${chapterTitle}

# SECTION: Introduction
[Introduction content with all details, equations, tables, etc.]

# SECTION: Core Concepts
[Core concepts content with all details...]

# SECTION: Advanced Topics
[Advanced topics content...]

---

# CHAPTER_SUMMARY

[Write a comprehensive 2-3 paragraph summary of this chapter. This summary will be used when this chapter is a supplemental source for lesson generation, so it should capture the key concepts, main topics covered, and important learning points. Make it detailed enough to provide valuable context.]

---

# SECTION_LIST

1. Introduction - Brief description of introduction content
2. Core Concepts - Brief description of core concepts
3. Advanced Topics - Brief description of advanced topics

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

**Section Markers (# SECTION:):**
- Use # SECTION: for major logical sections in the chapter
- Each section should be substantial (multiple paragraphs/pages)
- Section names should be clear and descriptive
- These sections will be used to organize lesson generation
- Aim for 3-8 sections per chapter (not too granular, not too broad)

**Formatting:**
- Use # for chapter title (already provided above)
- Use # SECTION: for major sections
- Use ## for subsections WITHIN each section
- Use ### for sub-subsections
- Use **bold** for key terms and definitions
- Use *italic* for emphasis
- Preserve lists, numbering, bullet points
- Keep equation formatting clean

**Quality Standards:**
- Be faithful to the original text
- Preserve technical accuracy
- Don't summarize or skip content in the markdown
- Extract everything valuable for learning
- Make the summary comprehensive but concise
- Ensure section list matches the # SECTION: markers in content`;

    const userPrompt = `Extract this chapter with THREE parts separated by ---:

**Part 1: MARKDOWN CONTENT**
Start with:
# CHAPTER_CONTENT
# Chapter_${chapterNumber}: ${chapterTitle}

Then add # SECTION: markers for each major section.
Extract all content with proper formatting, replacing images with descriptions.

**Part 2: CHAPTER SUMMARY** (after first ---)
Write a comprehensive 2-3 paragraph summary.

**Part 3: SECTION LIST** (after second ---)
List all sections with brief descriptions.

**IMPORTANT - EXCLUDE:**
- Course metadata (course codes, instructor names, dates like "Fall 2025" or "2023-09-12")
- References/bibliographies sections at the end
- Page numbers, headers, footers
- Any non-educational administrative content

Remember: THREE parts separated by --- markers!`;

    console.log('[tier2Extraction] Calling Gemini Vision API...');

    const response = await provider.extractMarkdown(tempPdfPath, systemPrompt, userPrompt);

    console.log(`[tier2Extraction] Received response (${response.length} chars)`);

    // Parse one-pass extraction response
    const parsed = parseOnePassExtraction(response);

    console.log(`[tier2Extraction] Parsed chapter ${parsed.chapterNumber}: ${parsed.chapterTitle}`);
    console.log(`[tier2Extraction] Summary length: ${parsed.summary.length} chars`);
    console.log(`[tier2Extraction] Sections found: ${parsed.sections.length}`);

    return {
      chapterNumber: parsed.chapterNumber,
      chapterTitle: parsed.chapterTitle,
      markdown: parsed.markdown,
      summary: parsed.summary,
      sections: parsed.sections
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
