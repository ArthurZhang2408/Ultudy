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
 * @param {string} markdown
 * @returns {{ chapterNumber: number, chapterTitle: string, markdown: string }}
 */
function parseSingleChapterMarkdown(markdown) {
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

        return {
          chapterNumber,
          chapterTitle,
          markdown: content
        };
      }
    }
  }

  throw new Error('Could not parse chapter heading. Expected format: # Chapter_N: Title');
}

/**
 * Parse multi-chapter detection response
 * Expected format (pipe-separated):
 * 1|Introduction to Algorithms|1|25
 * 2|Data Structures|26|58
 * 3|Graph Theory|59|102
 *
 * @param {string} text
 * @returns {Array<{number: number, title: string, pageStart: number, pageEnd: number}>}
 */
function parseMultiChapterResponse(text) {
  const lines = text.trim().split('\n').filter(line => line.trim());
  const chapters = [];

  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim());

    if (parts.length === 4) {
      const [number, title, pageStart, pageEnd] = parts;
      chapters.push({
        number: parseInt(number, 10),
        title,
        pageStart: parseInt(pageStart, 10),
        pageEnd: parseInt(pageEnd, 10)
      });
    }
  }

  if (chapters.length === 0) {
    throw new Error('No chapters parsed from multi-chapter response');
  }

  console.log(`[tier2Detection] Parsed ${chapters.length} chapters`);
  return chapters;
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

- Replace N with the chapter number (extract from PDF or use 1 if unclear)
- Replace Title with the chapter title
- Extract full content as clean markdown
- Include image descriptions where images appear: ![Tree structure with 5 nodes: root(A) connects to B and C, B connects to D and E]
- Preserve equations, tables, code examples
- Use LaTeX for math: inline $x^2$ and display $$E=mc^2$$

**CONTENT TO EXCLUDE:**
- **Metadata:** Course codes (e.g., "ECE356", "CS101"), instructor names, semester/term (e.g., "Fall 2025"), lecture dates/times, university names
- **References & Citations:** Bibliographies, reference lists, "References" sections, citation lists, "Further Reading" sections
- **Non-content elements:** Page numbers, headers, footers, running headers, margin notes
- **Administrative:** Copyright notices, ISBN numbers, publication details, acknowledgments, prefaces
- **Navigation:** Table of contents sections
- **Anything not directly educational content**

**For MULTI-CHAPTER:**
Return ONLY a list of chapters (pipe-separated), one per line:

number|title|pageStart|pageEnd
number|title|pageStart|pageEnd

Example:
1|Introduction to Programming|1|28
2|Variables and Data Types|29|52
3|Control Flow|53|89

**IMPORTANT:**
- Use ONLY pipe separators |, NO JSON
- Include ALL chapters found in the PDF
- Page numbers should cover the full chapter range
- Do not include any other text or formatting`;

  const userPrompt = `Analyze this PDF and determine if it's a single chapter or multiple chapters.

If SINGLE CHAPTER:
- Extract the full chapter as clean markdown
- Start with: # Chapter_N: Title
- Include all content with proper formatting
- Replace images with detailed descriptions
- Use LaTeX for equations
- **EXCLUDE:** course metadata (codes, instructors, dates), references/bibliographies, page numbers, headers/footers

If MULTI-CHAPTER:
- List all chapters as: number|title|pageStart|pageEnd
- One chapter per line
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
      markdown: parsed.markdown
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
