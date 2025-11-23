/**
 * Chapter-Based PDF Extraction
 *
 * Uses Gemini vision model to extract chapters directly from PDF.
 * Returns markdown format (not JSON) to avoid equation escaping issues.
 *
 * This approach:
 * - Extracts CHAPTERS instead of sections
 * - Supports multiple chapters per PDF
 * - Uses markdown delimiters instead of JSON for cleaner equation handling
 */

import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';

export async function extractChapters(pdfPath) {
  console.log('[llm_extractor_chapters] Starting chapter extraction from PDF');

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are an expert at analyzing educational PDFs and extracting complete chapters as faithful markdown documents.

**YOUR TASK:**
Analyze this PDF and identify ALL chapters it contains. Extract each chapter's complete content as clean markdown.

**CHAPTER IDENTIFICATION RULES:**

1. **Identify chapter boundaries carefully:**
   - Look for chapter headings, numbers, or clear topic changes
   - A PDF might contain 1 chapter, multiple chapters, or partial chapters
   - If no clear chapter structure exists, treat the entire PDF as one chapter

2. **Include ALL content from each chapter:**
   - All text, equations, tables, diagrams, examples
   - Preserve the exact order and structure
   - Don't skip any educational content
   - Don't create artificial breaks within a chapter

3. **What to exclude:**
   - References, bibliographies (unless part of chapter content)
   - Page numbers, headers, footers
   - Copyright notices, publication info
   - Table of contents (unless analyzing it to find chapters)

**MARKDOWN CONVERSION RULES:**

Convert ALL content to clean markdown with proper formatting:

1. **Math Equations:**
   - Inline math: $x^2 + y^2 = z^2$
   - Display math: $$E = mc^2$$
   - Multi-line equations:
   $$
   \\begin{align}
   a &= b + c \\\\
   d &= e + f
   \\end{align}
   $$
   - Preserve ALL LaTeX exactly as written

2. **Tables:**
   | Header 1 | Header 2 | Header 3 |
   |----------|----------|----------|
   | Cell 1   | Cell 2   | Cell 3   |

3. **Code Blocks:**
   \`\`\`python
   def example():
       return True
   \`\`\`

4. **Text Formatting:**
   - Headers: # H1, ## H2, ### H3
   - Bold: **bold text**
   - Italic: *italic text*
   - Code: \`inline code\`

5. **Lists:**
   - Bullets: - Item
   - Numbered: 1. Item

6. **Images/Figures:**
   - Describe: ![Figure 1: Description of diagram](fig_ref)

**CRITICAL: OUTPUT FORMAT:**

You MUST use this exact format for your response. Use special delimiters to separate chapters:

---CHAPTER_START---
CHAPTER_NUMBER: 1
CHAPTER_TITLE: Introduction to Physics
---CONTENT_START---
[Complete markdown content for chapter 1]
---CHAPTER_END---

---CHAPTER_START---
CHAPTER_NUMBER: 2
CHAPTER_TITLE: Newton's Laws of Motion
---CONTENT_START---
[Complete markdown content for chapter 2]
---CHAPTER_END---

**IMPORTANT NOTES:**
- Each chapter MUST start with ---CHAPTER_START---
- CHAPTER_NUMBER should be the actual chapter number (or sequential if not numbered)
- CHAPTER_TITLE should be descriptive and match the PDF
- Content starts after ---CONTENT_START---
- Each chapter MUST end with ---CHAPTER_END---
- Do NOT use JSON - this is plain text with delimiters
- Preserve all equations exactly - no escaping needed`;

  const userPrompt = `Analyze this PDF and extract ALL chapters it contains.

**STEP 1: Identify chapters**
- How many chapters are in this PDF?
- What are their titles/numbers?
- Where does each chapter begin and end?

**STEP 2: Extract each chapter**
For EACH chapter you identified:
1. Convert all content to markdown
2. Preserve equations as $...$ and $$...$$
3. Convert tables to markdown format
4. Include all educational content
5. Use the exact format with ---CHAPTER_START--- delimiters

**EXAMPLES:**

Example 1: Single chapter PDF
---CHAPTER_START---
CHAPTER_NUMBER: 3
CHAPTER_TITLE: Thermodynamics
---CONTENT_START---
# Thermodynamics

## Introduction
Thermodynamics is the study of heat and energy transfer...

The first law states: $$\\Delta U = Q - W$$

Where:
- $U$ is internal energy
- $Q$ is heat added
- $W$ is work done
---CHAPTER_END---

Example 2: Multiple chapters in one PDF
---CHAPTER_START---
CHAPTER_NUMBER: 1
CHAPTER_TITLE: Classical Mechanics
---CONTENT_START---
# Classical Mechanics
[Complete chapter 1 content]
---CHAPTER_END---

---CHAPTER_START---
CHAPTER_NUMBER: 2
CHAPTER_TITLE: Electromagnetism
---CONTENT_START---
# Electromagnetism
[Complete chapter 2 content]
---CHAPTER_END---

**NOW EXTRACT ALL CHAPTERS FROM THE PDF:**`;

  try {
    console.log('[llm_extractor_chapters] 📤 Calling Gemini vision provider...');

    // Call Gemini with text-only response (no schema)
    const result = await provider.extractChaptersAsMarkdown(
      pdfPath,
      systemPrompt,
      userPrompt
    );

    console.log('[llm_extractor_chapters] 📥 Received response from Gemini');
    console.log(`[llm_extractor_chapters] Response preview (first 500 chars):`);
    console.log(result.substring(0, 500));
    console.log('[llm_extractor_chapters] ...');
    console.log(`[llm_extractor_chapters] Response preview (last 500 chars):`);
    console.log(result.substring(Math.max(0, result.length - 500)));

    console.log('[llm_extractor_chapters] 🔍 Parsing chapter markdown...');

    // Parse the markdown response to extract chapters
    const chapters = parseChapterMarkdown(result);

    console.log('[llm_extractor_chapters] ✅ Extraction successful');
    console.log(`[llm_extractor_chapters] Chapters found: ${chapters.length}`);
    chapters.forEach((ch, idx) => {
      console.log(`[llm_extractor_chapters]   ${idx + 1}. Chapter ${ch.chapter_number}: "${ch.title}" (${ch.markdown.length} chars)`);
    });

    return {
      chapters,
      total_chapters: chapters.length
    };
  } catch (error) {
    console.error('[llm_extractor_chapters] ❌ Extraction failed');
    console.error('[llm_extractor_chapters] Error type:', error.constructor.name);
    console.error('[llm_extractor_chapters] Error message:', error.message);
    console.error('[llm_extractor_chapters] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Parse markdown response with chapter delimiters into structured array
 */
function parseChapterMarkdown(markdownText) {
  console.log('[parseChapterMarkdown] Starting to parse markdown');
  console.log(`[parseChapterMarkdown] Total text length: ${markdownText.length} chars`);

  const chapters = [];

  // Check for chapter start delimiters
  const chapterStartCount = (markdownText.match(/---CHAPTER_START---/g) || []).length;
  console.log(`[parseChapterMarkdown] Found ${chapterStartCount} CHAPTER_START delimiter(s)`);

  if (chapterStartCount === 0) {
    console.error('[parseChapterMarkdown] ❌ No CHAPTER_START delimiters found!');
    console.error('[parseChapterMarkdown] Response preview (first 1000 chars):');
    console.error(markdownText.substring(0, 1000));
    throw new Error('No chapter start delimiters found in LLM response. LLM may have returned wrong format.');
  }

  // Split by chapter start delimiter
  const chapterBlocks = markdownText.split('---CHAPTER_START---').filter(block => block.trim());
  console.log(`[parseChapterMarkdown] Split into ${chapterBlocks.length} blocks`);

  for (let i = 0; i < chapterBlocks.length; i++) {
    const block = chapterBlocks[i];
    console.log(`[parseChapterMarkdown] Processing block ${i + 1}/${chapterBlocks.length} (${block.length} chars)`);

    try {
      // Extract chapter metadata
      const numberMatch = block.match(/CHAPTER_NUMBER:\s*(.+?)(?:\n|---)/);
      const titleMatch = block.match(/CHAPTER_TITLE:\s*(.+?)(?:\n|---)/);
      const contentMatch = block.match(/---CONTENT_START---\s*([\s\S]*?)---CHAPTER_END---/);

      if (!numberMatch) {
        console.warn(`[parseChapterMarkdown] Block ${i + 1}: Missing CHAPTER_NUMBER`);
        console.warn(`[parseChapterMarkdown] Block preview: ${block.substring(0, 200)}`);
      }
      if (!titleMatch) {
        console.warn(`[parseChapterMarkdown] Block ${i + 1}: Missing CHAPTER_TITLE`);
      }
      if (!contentMatch) {
        console.warn(`[parseChapterMarkdown] Block ${i + 1}: Missing CONTENT_START or CHAPTER_END`);
        console.warn(`[parseChapterMarkdown] Block preview: ${block.substring(0, 200)}...${block.substring(Math.max(0, block.length - 200))}`);
      }

      if (!numberMatch || !titleMatch || !contentMatch) {
        console.warn(`[parseChapterMarkdown] Skipping malformed chapter block ${i + 1}`);
        continue;
      }

      const chapter_number = numberMatch[1].trim();
      const title = titleMatch[1].trim();
      const markdown = contentMatch[1].trim();

      console.log(`[parseChapterMarkdown] ✅ Block ${i + 1}: Chapter ${chapter_number} "${title}" (${markdown.length} chars)`);

      if (markdown.length < 100) {
        console.warn(`[parseChapterMarkdown] ⚠️ Chapter ${chapter_number} has very short content (${markdown.length} chars)`);
      }

      chapters.push({
        chapter_number,
        title,
        markdown,
        char_count: markdown.length
      });

    } catch (error) {
      console.error(`[parseChapterMarkdown] ❌ Error parsing chapter block ${i + 1}:`, error.message);
      continue;
    }
  }

  if (chapters.length === 0) {
    console.error('[parseChapterMarkdown] ❌ No valid chapters parsed!');
    throw new Error('No valid chapters found in response. Check delimiter format.');
  }

  console.log(`[parseChapterMarkdown] ✅ Successfully parsed ${chapters.length} chapter(s)`);
  return chapters;
}

export default extractChapters;
