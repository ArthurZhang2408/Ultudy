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
  console.log('[llm_extractor_markdown] 📝 PLAIN MARKDOWN EXTRACTION');
  console.log('[llm_extractor_markdown] ========================================');

  // Phase 1: Analyze structure to get chapter page ranges
  const analysis = await analyzePdfStructure(pdfPath);

  console.log(`[llm_extractor_markdown] 📊 Found ${analysis.chapter_count} chapter(s)`);

  if (analysis.is_single_chapter) {
    // Single chapter: extract directly
    return await extractSingleChapter(pdfPath, analysis.chapters[0]);
  } else {
    // Multiple chapters: split and extract each
    return await extractMultipleChapters(pdfPath, analysis.chapters);
  }
}

/**
 * Phase 1: Analyze PDF structure (this can stay as JSON - just metadata)
 */
async function analyzePdfStructure(pdfPath) {
  console.log('[analyzePdfStructure] 🔍 Analyzing PDF structure...');

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `Analyze this PDF to identify its chapter structure.

Return JSON with chapter count and page ranges only (no content).`;

  const userPrompt = `Analyze this PDF and tell me:
1. How many chapters does it contain?
2. What are the page ranges for each chapter?

Respond in this JSON format:
{
  "is_single_chapter": true/false,
  "chapter_count": number,
  "chapters": [
    {
      "chapter_number": "3",
      "title": "Chapter title",
      "page_start": 5,
      "page_end": 17
    }
  ]
}`;

  const responseSchema = {
    type: 'object',
    properties: {
      is_single_chapter: { type: 'boolean' },
      chapter_count: { type: 'integer' },
      chapters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            chapter_number: { type: 'string' },
            title: { type: 'string' },
            page_start: { type: 'integer' },
            page_end: { type: 'integer' }
          },
          required: ['chapter_number', 'title', 'page_start', 'page_end']
        }
      }
    },
    required: ['is_single_chapter', 'chapter_count', 'chapters']
  };

  const analysis = await provider.extractStructuredSections(
    pdfPath,
    systemPrompt,
    userPrompt,
    responseSchema
  );

  console.log(`[analyzePdfStructure] ✅ Analysis complete: ${analysis.chapter_count} chapter(s)`);
  analysis.chapters.forEach((ch, idx) => {
    console.log(`[analyzePdfStructure]   ${idx + 1}. Chapter ${ch.chapter_number}: "${ch.title}" (pages ${ch.page_start}-${ch.page_end})`);
  });

  return analysis;
}

/**
 * Extract single chapter as plain markdown
 */
async function extractSingleChapter(pdfPath, chapterInfo) {
  console.log(`[extractSingleChapter] 📄 Extracting Chapter ${chapterInfo.chapter_number}`);

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are extracting educational content from a PDF chapter.

**CRITICAL: Respond in PLAIN MARKDOWN only. NO JSON.**

Output format:
- Use standard markdown syntax
- Math equations: $inline$ and $$display$$
- Tables: standard markdown tables with | delimiters
- Code blocks: \`\`\`language
- Headers: #, ##, ###

Mark sections with this exact format:
===SECTION: Section Name===
[section content]

Example:
===SECTION: Introduction===
This is the introduction text with $x^2$ equation.

===SECTION: Main Concepts===
Here are the main concepts...`;

  const userPrompt = `Extract ALL content from this chapter as plain markdown.

**IMPORTANT:**
1. Output PURE MARKDOWN (not JSON, not code block)
2. Mark each section with: ===SECTION: Section Name===
3. Include ALL educational content
4. Use $...$ for inline math, $$...$$ for display math
5. Use proper markdown tables with | delimiters

Start your response immediately with markdown content.`;

  console.log('[extractSingleChapter] 🚀 Calling Gemini for markdown extraction...');

  const markdown = await provider.extractAsPlainText(pdfPath, systemPrompt, userPrompt);

  console.log(`[extractSingleChapter] ✅ Received ${markdown.length} characters`);

  // Parse markdown to extract sections
  const sections = parseSectionsFromMarkdown(markdown);

  console.log(`[extractSingleChapter] 📑 Parsed ${sections.length} sections`);

  return {
    chapters: [{
      chapter_number: chapterInfo.chapter_number,
      title: chapterInfo.title,
      page_start: chapterInfo.page_start,
      page_end: chapterInfo.page_end,
      sections: sections
    }],
    total_chapters: 1,
    total_sections: sections.length
  };
}

/**
 * Extract multiple chapters
 */
async function extractMultipleChapters(pdfPath, chaptersInfo) {
  console.log(`[extractMultipleChapters] 📚 Processing ${chaptersInfo.length} chapters`);

  const allChapters = [];
  let totalSections = 0;

  for (let i = 0; i < chaptersInfo.length; i++) {
    const chapterInfo = chaptersInfo[i];
    console.log(`[extractMultipleChapters] Processing ${i + 1}/${chaptersInfo.length}: Chapter ${chapterInfo.chapter_number}`);

    // Split PDF to get just this chapter
    const chapterPdfPath = await extractPdfPages(
      pdfPath,
      chapterInfo.page_start,
      chapterInfo.page_end
    );

    // Extract this chapter
    const result = await extractSingleChapter(chapterPdfPath, chapterInfo);

    // Cleanup temp file
    await fs.rm(chapterPdfPath, { force: true });

    allChapters.push(result.chapters[0]);
    totalSections += result.total_sections;
  }

  console.log(`[extractMultipleChapters] ✅ Extracted ${totalSections} total sections`);

  return {
    chapters: allChapters,
    total_chapters: chaptersInfo.length,
    total_sections: totalSections
  };
}

/**
 * Parse plain markdown to extract sections
 */
function parseSectionsFromMarkdown(markdown) {
  console.log('[parseSectionsFromMarkdown] 🔍 Parsing sections from markdown');

  const sections = [];
  const sectionPattern = /===SECTION:\s*(.+?)===\n([\s\S]*?)(?====SECTION:|$)/g;

  let match;
  while ((match = sectionPattern.exec(markdown)) !== null) {
    const name = match[1].trim();
    const content = match[2].trim();

    if (content.length > 0) {
      sections.push({
        name: name,
        description: `Section: ${name}`,
        markdown: content
      });

      console.log(`[parseSectionsFromMarkdown]   ✓ ${name} (${content.length} chars)`);
    }
  }

  // If no sections found, treat entire content as one section
  if (sections.length === 0) {
    console.log('[parseSectionsFromMarkdown] No section markers found, treating as single section');
    sections.push({
      name: 'Chapter Content',
      description: 'Complete chapter content',
      markdown: markdown.trim()
    });
  }

  console.log(`[parseSectionsFromMarkdown] ✅ Found ${sections.length} section(s)`);
  return sections;
}

/**
 * Extract page range from PDF
 */
async function extractPdfPages(sourcePdfPath, startPage, endPage) {
  console.log(`[extractPdfPages] Extracting pages ${startPage}-${endPage}`);

  const pdfBytes = await fs.readFile(sourcePdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const newPdf = await PDFDocument.create();

  const startIndex = startPage - 1;
  const endIndex = Math.min(endPage - 1, pdfDoc.getPageCount() - 1);

  const pagesToCopy = [];
  for (let i = startIndex; i <= endIndex; i++) {
    pagesToCopy.push(i);
  }

  const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
  copiedPages.forEach(page => newPdf.addPage(page));

  const tempPath = path.join(os.tmpdir(), `chapter_${randomUUID()}.pdf`);
  const newPdfBytes = await newPdf.save();
  await fs.writeFile(tempPath, newPdfBytes);

  console.log(`[extractPdfPages] ✅ Created temp PDF with ${copiedPages.length} pages`);
  return tempPath;
}

export default extractPdfAsMarkdown;
