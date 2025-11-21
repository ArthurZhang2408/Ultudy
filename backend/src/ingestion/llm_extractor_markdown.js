/**
 * Plain Markdown PDF Extraction
 *
 * LLM returns pure markdown (no JSON) with chapter delimiters.
 * Post-processing extracts chapters and sections.
 *
 * Benefits:
 * - No JSON escaping issues with LaTeX/special chars
 * - Native $ and $$ for math work perfectly
 * - Tables render correctly
 * - Clean, faithful extraction
 */

import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

/**
 * Extract PDF as plain markdown with chapter/section structure
 */
export async function extractPdfAsMarkdown(pdfPath) {
  console.log('[llm_extractor_markdown] ========================================');
  console.log('[llm_extractor_markdown] 📝 PLAIN MARKDOWN EXTRACTION (NO JSON)');
  console.log('[llm_extractor_markdown] ========================================');

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are extracting educational content from a PDF.

**CRITICAL: Respond in PLAIN MARKDOWN only. NO JSON.**

For each chapter and section, use these exact delimiters:

===CHAPTER_START===
CHAPTER_NUMBER: 3
CHAPTER_TITLE: Database Systems
PAGE_START: 1
PAGE_END: 25
===CHAPTER_CONTENT===

===SECTION: Introduction===
[section content with math as $x^2$ and $$display$$, tables as markdown]

===SECTION: Core Concepts===
[section content...]

===CHAPTER_END===

**IMPORTANT:**
- Use $...$ for inline math, $$...$$ for display math
- Tables use standard | markdown | format |
- Do NOT wrap in JSON or code blocks
- Start immediately with ===CHAPTER_START===`;

  const userPrompt = `Extract ALL content from this PDF as plain markdown.

**FORMAT:**
For each chapter:
1. Start with ===CHAPTER_START===
2. Add metadata: CHAPTER_NUMBER, CHAPTER_TITLE, PAGE_START, PAGE_END
3. Add ===CHAPTER_CONTENT===
4. Mark sections with ===SECTION: Name===
5. End with ===CHAPTER_END===

**CONTENT RULES:**
- Math: $inline$ and $$display$$
- Tables: | Col 1 | Col 2 |
- Include ALL educational content
- DO NOT use JSON

Start now with ===CHAPTER_START===`;

  console.log('[llm_extractor_markdown] 🚀 Calling Gemini for full markdown extraction...');

  const markdown = await provider.extractAsPlainText(pdfPath, systemPrompt, userPrompt);

  console.log(`[llm_extractor_markdown] ✅ Received ${markdown.length} characters`);

  // Parse markdown to extract chapters and sections
  const result = parseFullMarkdown(markdown);

  console.log(`[llm_extractor_markdown] 📑 Parsed ${result.total_chapters} chapters, ${result.total_sections} sections`);

  return result;
}

/**
 * Parse full markdown with chapter delimiters to extract structured data
 *
 * Expected format:
 * ===CHAPTER_START===
 * CHAPTER_NUMBER: 3
 * CHAPTER_TITLE: Database Systems
 * PAGE_START: 1
 * PAGE_END: 25
 * ===CHAPTER_CONTENT===
 *
 * ===SECTION: Introduction===
 * [content]
 *
 * ===SECTION: Core Concepts===
 * [content]
 *
 * ===CHAPTER_END===
 */
function parseFullMarkdown(markdown) {
  console.log('[parseFullMarkdown] 🔍 Parsing chapters and sections from markdown');
  console.log(`[parseFullMarkdown] Total markdown length: ${markdown.length} characters`);

  const chapters = [];
  let totalSections = 0;

  // Split by chapter start delimiter
  const chapterBlocks = markdown.split('===CHAPTER_START===').filter(block => block.trim());

  console.log(`[parseFullMarkdown] Found ${chapterBlocks.length} chapter block(s)`);

  if (chapterBlocks.length === 0) {
    console.error('[parseFullMarkdown] ❌ No chapter blocks found!');
    console.error('[parseFullMarkdown] Response preview (first 1000 chars):');
    console.error(markdown.substring(0, 1000));
    throw new Error('No chapter delimiters found in LLM response. Expected ===CHAPTER_START=== markers.');
  }

  for (let i = 0; i < chapterBlocks.length; i++) {
    const block = chapterBlocks[i];
    console.log(`[parseFullMarkdown] Processing chapter block ${i + 1}/${chapterBlocks.length}`);

    try {
      // Extract chapter metadata
      const chapterNumberMatch = block.match(/CHAPTER_NUMBER:\s*(.+?)(?:\n|===)/);
      const chapterTitleMatch = block.match(/CHAPTER_TITLE:\s*(.+?)(?:\n|===)/);
      const pageStartMatch = block.match(/PAGE_START:\s*(\d+)/);
      const pageEndMatch = block.match(/PAGE_END:\s*(\d+)/);

      // Extract content between ===CHAPTER_CONTENT=== and ===CHAPTER_END===
      const contentMatch = block.match(/===CHAPTER_CONTENT===\s*([\s\S]*?)===CHAPTER_END===/);

      if (!chapterNumberMatch || !chapterTitleMatch) {
        console.warn(`[parseFullMarkdown] Block ${i + 1}: Missing chapter metadata`);
        console.warn(`[parseFullMarkdown] Block preview: ${block.substring(0, 300)}`);
        continue;
      }

      const chapter_number = chapterNumberMatch[1].trim();
      const title = chapterTitleMatch[1].trim();
      const page_start = pageStartMatch ? parseInt(pageStartMatch[1], 10) : 1;
      const page_end = pageEndMatch ? parseInt(pageEndMatch[1], 10) : 1;

      console.log(`[parseFullMarkdown] Chapter ${chapter_number}: "${title}" (pages ${page_start}-${page_end})`);

      if (!contentMatch) {
        console.warn(`[parseFullMarkdown] Block ${i + 1}: No content found between ===CHAPTER_CONTENT=== and ===CHAPTER_END===`);
        console.warn(`[parseFullMarkdown] Block preview: ${block.substring(0, 500)}`);
        continue;
      }

      const chapterContent = contentMatch[1].trim();
      console.log(`[parseFullMarkdown] Chapter content length: ${chapterContent.length} chars`);

      // Parse sections within this chapter
      const sections = parseSectionsFromChapterContent(chapterContent, chapter_number);

      if (sections.length === 0) {
        console.warn(`[parseFullMarkdown] Chapter ${chapter_number} has no sections - skipping`);
        continue;
      }

      chapters.push({
        chapter_number,
        title,
        page_start,
        page_end,
        sections
      });

      totalSections += sections.length;

      console.log(`[parseFullMarkdown] ✅ Chapter ${chapter_number}: ${sections.length} section(s)`);
    } catch (error) {
      console.error(`[parseFullMarkdown] ❌ Error parsing chapter block ${i + 1}:`, error.message);
      continue;
    }
  }

  if (chapters.length === 0) {
    console.error('[parseFullMarkdown] ❌ No valid chapters parsed!');
    throw new Error('No valid chapters found in markdown. Check delimiter format.');
  }

  console.log(`[parseFullMarkdown] ✅ Successfully parsed ${chapters.length} chapter(s) with ${totalSections} total section(s)`);

  return {
    chapters,
    total_chapters: chapters.length,
    total_sections: totalSections
  };
}

/**
 * Parse sections from chapter content
 */
function parseSectionsFromChapterContent(chapterContent, chapterNumber) {
  console.log(`[parseSectionsFromChapterContent] Parsing sections for chapter ${chapterNumber}`);

  const sections = [];
  const sectionPattern = /===SECTION:\s*(.+?)===\s*([\s\S]*?)(?====SECTION:|$)/g;

  let match;
  while ((match = sectionPattern.exec(chapterContent)) !== null) {
    const name = match[1].trim();
    const content = match[2].trim();

    if (content.length > 0) {
      sections.push({
        name: name,
        description: `Section: ${name}`,
        markdown: content
      });

      console.log(`[parseSectionsFromChapterContent]   ✓ "${name}" (${content.length} chars)`);
    }
  }

  // If no sections found, treat entire content as one section
  if (sections.length === 0) {
    console.log(`[parseSectionsFromChapterContent] No section markers found, treating as single section`);
    sections.push({
      name: 'Chapter Content',
      description: 'Complete chapter content',
      markdown: chapterContent
    });
  }

  return sections;
}

export default extractPdfAsMarkdown;
