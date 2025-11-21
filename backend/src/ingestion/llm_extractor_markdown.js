/**
 * Plain Markdown PDF Extraction
 *
 * LLM returns pure markdown (no JSON) with chapter delimiters.
 * Post-processing extracts chapters only (no section subdivision).
 *
 * Benefits:
 * - No JSON escaping issues with LaTeX/special chars
 * - Native $ and $$ for math work perfectly
 * - Tables render correctly
 * - Clean, faithful extraction
 * - Simple chapter-based structure
 */

import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';

/**
 * Extract PDF as plain markdown with chapter structure
 */
export async function extractPdfAsMarkdown(pdfPath) {
  console.log('[llm_extractor_markdown] ========================================');
  console.log('[llm_extractor_markdown] 📝 PLAIN MARKDOWN EXTRACTION (NO JSON)');
  console.log('[llm_extractor_markdown] ========================================');

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are extracting educational content from a PDF.

**CRITICAL: Respond in PLAIN MARKDOWN only. NO JSON.**

For each chapter, use these exact delimiters:

===CHAPTER_START===
CHAPTER_NUMBER: 3
CHAPTER_TITLE: Database Systems
PAGE_START: 1
PAGE_END: 25
===CHAPTER_CONTENT===
[Complete chapter content with math as $x^2$ and $$display$$, tables as markdown, all formatting preserved]
===CHAPTER_END===

**IMPORTANT:**
- Use $...$ for inline math, $$...$$ for display math
- Tables use standard | markdown | format |
- Include ALL chapter content (headings, text, equations, tables, examples)
- Do NOT wrap in JSON or code blocks
- Do NOT subdivide into sections - keep full chapter content together
- Start immediately with ===CHAPTER_START===`;

  const userPrompt = `Extract ALL chapters from this PDF as plain markdown.

**FORMAT:**
For each chapter:
1. Start with ===CHAPTER_START===
2. Add metadata: CHAPTER_NUMBER, CHAPTER_TITLE, PAGE_START, PAGE_END
3. Add ===CHAPTER_CONTENT===
4. Include complete chapter markdown with ALL content
5. End with ===CHAPTER_END===

**CONTENT RULES:**
- Math: $inline$ and $$display$$
- Tables: | Col 1 | Col 2 |
- Include ALL educational content from the chapter
- Keep chapter content together (do NOT subdivide)
- DO NOT use JSON

Start now with ===CHAPTER_START===`;

  console.log('[llm_extractor_markdown] 🚀 Calling Gemini for full markdown extraction...');

  const markdown = await provider.extractAsPlainText(pdfPath, systemPrompt, userPrompt);

  console.log(`[llm_extractor_markdown] ✅ Received ${markdown.length} characters`);

  // Parse markdown to extract chapters
  const result = parseChaptersFromMarkdown(markdown);

  console.log(`[llm_extractor_markdown] 📑 Parsed ${result.total_chapters} chapters`);

  return result;
}

/**
 * Parse markdown with chapter delimiters to extract chapters
 *
 * Expected format:
 * ===CHAPTER_START===
 * CHAPTER_NUMBER: 3
 * CHAPTER_TITLE: Database Systems
 * PAGE_START: 1
 * PAGE_END: 25
 * ===CHAPTER_CONTENT===
 * [full chapter markdown content]
 * ===CHAPTER_END===
 */
function parseChaptersFromMarkdown(markdown) {
  console.log('[parseChaptersFromMarkdown] 🔍 Parsing chapters from markdown');
  console.log(`[parseChaptersFromMarkdown] Total markdown length: ${markdown.length} characters`);

  const chapters = [];

  // Split by chapter start delimiter
  const chapterBlocks = markdown.split('===CHAPTER_START===').filter(block => block.trim());

  console.log(`[parseChaptersFromMarkdown] Found ${chapterBlocks.length} chapter block(s)`);

  if (chapterBlocks.length === 0) {
    console.error('[parseChaptersFromMarkdown] ❌ No chapter blocks found!');
    console.error('[parseChaptersFromMarkdown] Response preview (first 1000 chars):');
    console.error(markdown.substring(0, 1000));
    throw new Error('No chapter delimiters found in LLM response. Expected ===CHAPTER_START=== markers.');
  }

  for (let i = 0; i < chapterBlocks.length; i++) {
    const block = chapterBlocks[i];
    console.log(`[parseChaptersFromMarkdown] Processing chapter block ${i + 1}/${chapterBlocks.length}`);

    try {
      // Extract chapter metadata
      const chapterNumberMatch = block.match(/CHAPTER_NUMBER:\s*(.+?)(?:\n|===)/);
      const chapterTitleMatch = block.match(/CHAPTER_TITLE:\s*(.+?)(?:\n|===)/);
      const pageStartMatch = block.match(/PAGE_START:\s*(\d+)/);
      const pageEndMatch = block.match(/PAGE_END:\s*(\d+)/);

      // Extract content between ===CHAPTER_CONTENT=== and ===CHAPTER_END===
      const contentMatch = block.match(/===CHAPTER_CONTENT===\s*([\s\S]*?)===CHAPTER_END===/);

      if (!chapterNumberMatch || !chapterTitleMatch) {
        console.warn(`[parseChaptersFromMarkdown] Block ${i + 1}: Missing chapter metadata`);
        console.warn(`[parseChaptersFromMarkdown] Block preview: ${block.substring(0, 300)}`);
        continue;
      }

      const chapter_number = chapterNumberMatch[1].trim();
      const title = chapterTitleMatch[1].trim();
      const page_start = pageStartMatch ? parseInt(pageStartMatch[1], 10) : 1;
      const page_end = pageEndMatch ? parseInt(pageEndMatch[1], 10) : 1;

      console.log(`[parseChaptersFromMarkdown] Chapter ${chapter_number}: "${title}" (pages ${page_start}-${page_end})`);

      if (!contentMatch) {
        console.warn(`[parseChaptersFromMarkdown] Block ${i + 1}: No content found between ===CHAPTER_CONTENT=== and ===CHAPTER_END===`);
        console.warn(`[parseChaptersFromMarkdown] Block preview: ${block.substring(0, 500)}`);
        continue;
      }

      const markdown = contentMatch[1].trim();
      console.log(`[parseChaptersFromMarkdown] Chapter content length: ${markdown.length} chars`);

      if (markdown.length < 100) {
        console.warn(`[parseChaptersFromMarkdown] ⚠️ Chapter ${chapter_number} has very short content (${markdown.length} chars)`);
      }

      chapters.push({
        chapter_number,
        title,
        page_start,
        page_end,
        markdown
      });

      console.log(`[parseChaptersFromMarkdown] ✅ Chapter ${chapter_number}: ${markdown.length} chars`);
    } catch (error) {
      console.error(`[parseChaptersFromMarkdown] ❌ Error parsing chapter block ${i + 1}:`, error.message);
      continue;
    }
  }

  if (chapters.length === 0) {
    console.error('[parseChaptersFromMarkdown] ❌ No valid chapters parsed!');
    throw new Error('No valid chapters found in markdown. Check delimiter format.');
  }

  console.log(`[parseChaptersFromMarkdown] ✅ Successfully parsed ${chapters.length} chapter(s)`);

  return {
    chapters,
    total_chapters: chapters.length
  };
}

export default extractPdfAsMarkdown;
