/**
 * Tier 2 Chapter Detection Service
 *
 * Analyzes PDFs to determine if they contain single or multiple chapters
 * For single chapter: extracts markdown directly
 * For multi-chapter: returns list of chapters with page ranges
 */

import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';

/**
 * Parse single chapter response from LLM
 * Expected format:
 * # Chapter_5: Introduction to Algorithms
 *
 * Content here...
 *
 * ---
 * # SUMMARY
 * Summary here...
 *
 * @param {string} response
 * @returns {{ chapterNumber: number, chapterTitle: string, markdown: string, summary: string }}
 */
function parseSingleChapterMarkdown(response) {
  // Find the summary marker (same format as multi-chapter extraction)
  const summaryPattern = /\n---+\s*\n#\s*SUMMARY/i;
  const summaryMatch = response.search(summaryPattern);

  let summary = '';
  let contentPart = response;

  if (summaryMatch !== -1) {
    // Split at the summary marker
    contentPart = response.substring(0, summaryMatch).trim();
    const summaryPart = response.substring(summaryMatch).trim();

    // Extract summary text
    const summaryStartMatch = summaryPart.match(/#\s*SUMMARY/i);
    if (summaryStartMatch) {
      const summaryStartIndex = summaryStartMatch.index + summaryStartMatch[0].length;
      summary = summaryPart.substring(summaryStartIndex).trim();
      console.log(`[tier2Detection] Extracted summary (${summary.length} chars)`);
    }
  } else {
    console.log('[tier2Detection] No summary found in single chapter response');
  }

  const lines = contentPart.split('\n');

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
        const markdown = contentLines.join('\n').trim();

        return {
          chapterNumber,
          chapterTitle,
          markdown,
          summary
        };
      }
    }
  }

  throw new Error('Could not parse chapter heading. Expected format: # Chapter_N: Title');
}

/**
 * Consolidate duplicate chapter numbers into single entries
 * Handles cases where LLM returns page-by-page or interleaved chapters
 *
 * Example input:
 * [{number: 4, title: "Network Layer", pages: 1-2}, {number: 4, title: "Routing", pages: 3-4}]
 *
 * Example output:
 * [{number: 4, title: "Network Layer", pageStart: 1, pageEnd: 4}]
 *
 * @param {Array} chapters
 * @returns {Array}
 */
function consolidateChapters(chapters) {
  console.log(`[tier2Detection] Consolidating ${chapters.length} raw entries...`);

  // Group by chapter number
  const grouped = {};

  for (const chapter of chapters) {
    const num = chapter.number;

    if (!grouped[num]) {
      grouped[num] = {
        number: num,
        title: chapter.title,
        ranges: [] // Store multiple ranges instead of collecting all pages
      };
    }

    grouped[num].ranges.push({ start: chapter.pageStart, end: chapter.pageEnd });
  }

  // Convert back to consolidated chapter entries
  const consolidated = Object.values(grouped).map(ch => {
    // Sort ranges by start page
    ch.ranges.sort((a, b) => a.start - b.start);

    // Check if ranges are contiguous (can be merged into single range)
    let isContiguous = true;
    for (let i = 1; i < ch.ranges.length; i++) {
      // If there's a gap between ranges, they're not contiguous
      if (ch.ranges[i].start > ch.ranges[i - 1].end + 1) {
        isContiguous = false;
        break;
      }
    }

    // If contiguous, merge into single range
    if (isContiguous || ch.ranges.length === 1) {
      return {
        number: ch.number,
        title: ch.title,
        pageStart: ch.ranges[0].start,
        pageEnd: ch.ranges[ch.ranges.length - 1].end
      };
    } else {
      // Interleaved/non-contiguous - return all ranges separately
      // This prevents incorrect range consolidation like Ch4: 1-124 when it should be 1-48, 73-124
      console.log(`[tier2Detection] ⚠️  Chapter ${ch.number} has non-contiguous ranges - keeping separate`);
      return ch.ranges.map(range => ({
        number: ch.number,
        title: ch.title,
        pageStart: range.start,
        pageEnd: range.end
      }));
    }
  }).flat().sort((a, b) => a.pageStart - b.pageStart); // Sort by page start

  console.log(`[tier2Detection] Consolidated to ${consolidated.length} chapter entries`);

  // Log what changed
  if (chapters.length !== consolidated.length) {
    console.log(`[tier2Detection] Merged/split ${Math.abs(chapters.length - consolidated.length)} entries`);
    for (const ch of consolidated) {
      console.log(`[tier2Detection]   Chapter ${ch.number}: "${ch.title}" pages ${ch.pageStart}-${ch.pageEnd}`);
    }
  }

  return consolidated;
}

/**
 * Parse multi-chapter detection response
 * Expected format (pipe-separated):
 * 1|Introduction to Algorithms|5
 * 2|Data Structures|29
 * 3|Graph Theory|58
 * LASTPAGE|102
 *
 * @param {string} text
 * @returns {Array<{number: number, title: string, pageStart: number, pageEnd: number}>}
 */
function parseMultiChapterResponse(text) {
  const lines = text.trim().split('\n').filter(line => line.trim());
  const chapters = [];
  let lastPage = null;

  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim());

    // Check for LASTPAGE marker
    if (parts[0].toUpperCase() === 'LASTPAGE' && parts.length === 2) {
      lastPage = parseInt(parts[1], 10);
      continue;
    }

    // Parse chapter line: number|title|startPage
    if (parts.length === 3) {
      const [number, title, startPage] = parts;
      chapters.push({
        number: parseInt(number, 10),
        title,
        pageStart: parseInt(startPage, 10),
        pageEnd: -1 // Will be calculated
      });
    }
  }

  if (chapters.length === 0) {
    throw new Error('No chapters parsed from multi-chapter response');
  }

  console.log(`[tier2Detection] Parsed ${chapters.length} raw entries with starting pages`);

  // Calculate page ranges: each chapter ends where the next one starts (minus 1)
  for (let i = 0; i < chapters.length - 1; i++) {
    chapters[i].pageEnd = chapters[i + 1].pageStart - 1;
  }

  // Handle last chapter
  if (lastPage) {
    chapters[chapters.length - 1].pageEnd = lastPage;
    console.log(`[tier2Detection] Using explicit last page: ${lastPage}`);
  } else {
    // Fallback: assume last chapter is at least 10 pages
    chapters[chapters.length - 1].pageEnd = chapters[chapters.length - 1].pageStart + 10;
    console.log(`[tier2Detection] ⚠️  No LASTPAGE provided, using fallback for last chapter`);
  }

  console.log('[tier2Detection] Calculated page ranges:');
  for (const ch of chapters) {
    console.log(`[tier2Detection]   Chapter ${ch.number}: "${ch.title}" pages ${ch.pageStart}-${ch.pageEnd}`);
  }

  // Consolidate duplicate chapter numbers
  return consolidateChapters(chapters);
}

/**
 * Detect if PDF is single or multi-chapter and extract accordingly
 *
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<{type: 'single', chapterNumber: number, chapterTitle: string, markdown: string} | {type: 'multi', chapters: Array}>}
 */
export async function detectChapterStructure(pdfPath) {
  console.log('[tier2Detection] Starting chapter detection');

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are an expert at analyzing educational PDFs (textbooks, lecture notes).

**YOUR TASK:**
Determine if this PDF contains a SINGLE chapter or MULTIPLE chapters, then respond accordingly.

**DECISION CRITERIA:**

**SINGLE CHAPTER if:**
- PDF covers ONE chapter/topic only
- Titled like "Chapter 5", "Lecture 3", "Unit 2", etc.
- All content is cohesive and related to one topic
- Typically 10-50 pages

**MULTI-CHAPTER if:**
- PDF contains multiple chapters/lectures
- Has a table of contents with multiple chapters
- Clear chapter boundaries (e.g., "Chapter 1", "Chapter 2", etc.)
- Covers multiple distinct topics
- Typically 50+ pages (but not always)

**RESPONSE FORMAT:**

**For SINGLE CHAPTER:**
Return markdown with this EXACT format:

# Chapter_N: Title

[Full faithful markdown extraction of the chapter content]

---

# SUMMARY

[Write a comprehensive 2-3 paragraph summary of this chapter]

**FORMATTING RULES:**
- Replace N with the chapter number (extract from PDF or use 1 if unclear)
- Replace Title with the chapter title
- Extract full content as clean markdown
- Include image descriptions where images appear: ![Tree structure with 5 nodes: root(A) connects to B and C, B connects to D and E]
- Preserve equations, tables, code examples
- Use LaTeX for math: inline $x^2$ and display $$E=mc^2$$
- **CRITICAL:** Always include the summary section after --- separator

**CONTENT TO EXCLUDE:**
- **Metadata:** Course codes (e.g., "ECE356", "CS101"), instructor names, semester/term (e.g., "Fall 2025"), lecture dates/times, university names
- **References & Citations:** Bibliographies, reference lists, "References" sections, citation lists, "Further Reading" sections
- **Non-content elements:** Page numbers, headers, footers, running headers, margin notes
- **Administrative:** Copyright notices, ISBN numbers, publication details, acknowledgments, prefaces
- **Navigation:** Table of contents sections
- **Anything not directly educational content**

**For MULTI-CHAPTER:**
Return ONLY a list of chapters with STARTING PAGES (pipe-separated), one per line:

number|title|startPage
number|title|startPage
...
LASTPAGE|pageNumber

Example:
1|Introduction to Programming|5
2|Variables and Data Types|29
3|Control Flow|58
LASTPAGE|102

**CRITICAL RULES FOR MULTI-CHAPTER:**

**STEP 1: Find chapter starting pages**
- Report ONLY the page number where each chapter BEGINS
- Look for chapter headings like "Chapter N:", "Lecture N:", etc.
- Use actual PDF page numbers (visible in PDF), NOT table of contents page numbers

**⚠️ TABLE OF CONTENTS WARNING:**
- ToC page numbers may be OFFSET from actual PDF pages
- Example: ToC says "Chapter 1 ... 3" but it's actually on PDF page 5
- ALWAYS verify against the ACTUAL PDF pages where chapters appear
- When in doubt, scan the PDF to find where chapter headings actually are

**STEP 2: Find the last page**
- Add a final line: LASTPAGE|XXX where XXX is the last content page of the PDF
- This should be the last page with actual chapter content
- DO NOT include: bibliography, references, appendices (unless they're part of the last chapter)

**FORMATTING RULES:**
- ONE entry per chapter - Do NOT create separate entries for subsections
  - Use main chapter heading only (e.g., "Chapter 9: Database Design")
  - Ignore subsections like "9.1", "9.2", etc.
- Do NOT include: preface pages, title pages, ToC pages in your chapter list
- Use ONLY pipe separators |, NO JSON
- Include ALL chapters found in the PDF
- Do not include any other text or formatting

**Example with offset:**
If ToC shows:
- Chapter 1 ... page 1
- Chapter 2 ... page 15

But the PDF has 2 cover pages, then:
1|Chapter 1 Title|3
2|Chapter 2 Title|17
LASTPAGE|50`;

  const userPrompt = `Analyze this PDF and determine if it's a single chapter or multiple chapters.

If SINGLE CHAPTER:
- Extract the full chapter as clean markdown
- Start with: # Chapter_N: Title
- Include all content with proper formatting
- Replace images with detailed descriptions
- Use LaTeX for equations
- **EXCLUDE:** course metadata (codes, instructors, dates), references/bibliographies, page numbers, headers/footers

If MULTI-CHAPTER:
- List all chapters with STARTING PAGES ONLY: number|title|startPage
- One chapter per line
- End with: LASTPAGE|pageNumber
- Use actual PDF page numbers (NOT table of contents numbers)
- Verify ToC page numbers against actual PDF pages (may have offset)
- Use pipe separator |`;

  console.log('[tier2Detection] Calling Gemini Vision API...');

  const response = await provider.extractMarkdown(pdfPath, systemPrompt, userPrompt);

  console.log(`[tier2Detection] Received response (${response.length} chars)`);

  // Detect response type
  const lines = response.split('\n');
  const firstLine = lines[0].trim();

  console.log('[tier2Detection] First line:', firstLine);
  console.log('[tier2Detection] First 10 lines:');
  console.log(lines.slice(0, 10).join('\n'));

  if (firstLine.startsWith('# Chapter')) {
    // Single chapter response
    console.log('[tier2Detection] Detected SINGLE CHAPTER format');
    const parsed = parseSingleChapterMarkdown(response);

    return {
      type: 'single',
      chapterNumber: parsed.chapterNumber,
      chapterTitle: parsed.chapterTitle,
      markdown: parsed.markdown,
      summary: parsed.summary
    };
  } else if (firstLine.includes('|')) {
    // Multi-chapter response
    console.log('[tier2Detection] Detected MULTI-CHAPTER format');
    const chapters = parseMultiChapterResponse(response);

    return {
      type: 'multi',
      chapters
    };
  } else {
    // Try to find table format in subsequent lines (LLM might add preamble)
    // Look for lines with pipe-separated format: number|title|pageStart|pageEnd
    const tableLineIndex = lines.findIndex(line => {
      const trimmed = line.trim();
      if (!trimmed.includes('|')) return false;

      const parts = trimmed.split('|');
      // Valid table line: 4 parts, first is a number
      return parts.length === 4 && !isNaN(parseInt(parts[0].trim(), 10));
    });

    if (tableLineIndex !== -1) {
      console.log(`[tier2Detection] Found table at line ${tableLineIndex}, trimming preamble...`);
      const trimmedResponse = lines.slice(tableLineIndex).join('\n');
      const chapters = parseMultiChapterResponse(trimmedResponse);

      return {
        type: 'multi',
        chapters
      };
    }

    console.error('[tier2Detection] Could not determine format. Full response:');
    console.error(response);
    throw new Error('Could not determine response format. Expected either "# Chapter_N: Title" or "number|title|pageStart|pageEnd"');
  }
}
