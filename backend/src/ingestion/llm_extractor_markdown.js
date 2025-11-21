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
 * Uses two-phase approach: analyze structure, then extract content
 */
export async function extractPdfAsMarkdown(pdfPath) {
  console.log('[llm_extractor_markdown] ========================================');
  console.log('[llm_extractor_markdown] 📝 TWO-PHASE MARKDOWN EXTRACTION');
  console.log('[llm_extractor_markdown] ========================================');

  // Phase 1: Analyze PDF structure
  const analysis = await analyzePdfStructure(pdfPath);

  console.log(`[llm_extractor_markdown] 📊 Analysis: ${analysis.is_single_chapter ? 'Single' : 'Multi'}-chapter PDF`);
  console.log(`[llm_extractor_markdown] 📊 Found ${analysis.chapter_count} chapter(s)`);

  // Phase 2: Extract content
  let result;
  if (analysis.is_single_chapter) {
    // Single chapter: extract directly from full PDF
    result = await extractSingleChapterPdf(pdfPath, analysis.chapters[0]);
  } else {
    // Multi-chapter: split PDF and extract each chapter
    result = await extractMultiChapterPdf(pdfPath, analysis.chapters);
  }

  console.log(`[llm_extractor_markdown] ✅ Extraction complete: ${result.total_chapters} chapter(s)`);

  return result;
}

/**
 * Phase 1: Analyze PDF structure to determine chapter count and page ranges
 * Returns JSON metadata (not content)
 */
async function analyzePdfStructure(pdfPath) {
  console.log('[analyzePdfStructure] 🔍 Phase 1: Analyzing PDF structure...');

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `Analyze this PDF to identify its chapter structure.

You are ONLY analyzing structure - do NOT extract content yet.

Return JSON with chapter count and page ranges.`;

  const userPrompt = `Analyze this PDF and identify all chapters with their page ranges.

Respond in this JSON format:
{
  "chapters": [
    {
      "chapter_number": "3",
      "title": "Chapter title",
      "page_start": 1,
      "page_end": 6
    }
  ]
}

Return one chapter if single-chapter PDF, multiple if multi-chapter PDF.`;

  const responseSchema = {
    type: 'object',
    properties: {
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
    required: ['chapters']
  };

  const analysis = await provider.extractStructuredSections(
    pdfPath,
    systemPrompt,
    userPrompt,
    responseSchema
  );

  // Derive metadata from chapters array
  const is_single_chapter = analysis.chapters.length === 1;
  const chapter_count = analysis.chapters.length;

  console.log(`[analyzePdfStructure] ✅ Analysis complete: ${chapter_count} chapter(s)`);
  analysis.chapters.forEach((ch, idx) => {
    console.log(`[analyzePdfStructure]   ${idx + 1}. Chapter ${ch.chapter_number}: "${ch.title}" (pages ${ch.page_start}-${ch.page_end})`);
  });

  return {
    is_single_chapter,
    chapter_count,
    chapters: analysis.chapters
  };
}

/**
 * Phase 2a: Extract single-chapter PDF directly
 */
async function extractSingleChapterPdf(pdfPath, chapterInfo) {
  console.log(`[extractSingleChapterPdf] 📄 Phase 2: Extracting single chapter PDF`);
  console.log(`[extractSingleChapterPdf] Chapter ${chapterInfo.chapter_number}: "${chapterInfo.title}"`);

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are extracting educational content from a single-chapter PDF.

**CRITICAL: Respond in PLAIN MARKDOWN only. NO JSON, NO DELIMITERS.**

**CONTENT FILTERING - EXCLUDE these elements:**
1. **Header/footer metadata**: Course codes, lecture numbers, instructor names, dates
2. **Page numbers**: Do NOT include page numbers
3. **Footnotes**: Skip footnote markers and text
4. **References/Bibliography sections**: Skip citation lists
5. **Navigation elements**: Skip "Table of Contents", headers/footers

**FORMATTING RULES:**
- Use $...$ for inline math, $$...$$ for display math
- Tables use standard | markdown | format |
- Include ALL educational content (headings, explanations, equations, tables, examples, diagrams)
- Output pure markdown - start immediately with content`;

  const userPrompt = `Extract ALL educational content from this PDF chapter as plain markdown.

**WHAT TO INCLUDE:**
- Main educational content: concepts, explanations, definitions
- Examples and problem-solving demonstrations
- Mathematical equations: $inline$ and $$display$$
- Tables with data: | Col 1 | Col 2 |
- Diagrams descriptions
- Important notes, theorems, proofs

**WHAT TO EXCLUDE:**
- Course codes, lecture numbers, instructor names, dates
- Page numbers
- Footnotes
- References/Bibliography sections
- Repeating headers/footers

**IMPORTANT:**
- Output ONLY plain markdown (no JSON, no delimiters, no code blocks)
- Start immediately with the chapter content`;

  const markdown = await provider.extractAsPlainText(pdfPath, systemPrompt, userPrompt);

  console.log(`[extractSingleChapterPdf] ✅ Received ${markdown.length} characters`);

  return {
    chapters: [{
      chapter_number: chapterInfo.chapter_number,
      title: chapterInfo.title,
      page_start: chapterInfo.page_start,
      page_end: chapterInfo.page_end,
      markdown: markdown.trim()
    }],
    total_chapters: 1
  };
}

/**
 * Phase 2b: Extract multi-chapter PDF by splitting and processing each chapter
 */
async function extractMultiChapterPdf(pdfPath, chaptersInfo) {
  console.log(`[extractMultiChapterPdf] 📚 Phase 2: Extracting multi-chapter PDF`);
  console.log(`[extractMultiChapterPdf] Processing ${chaptersInfo.length} chapters`);

  const allChapters = [];

  for (let i = 0; i < chaptersInfo.length; i++) {
    const chapterInfo = chaptersInfo[i];
    console.log(`[extractMultiChapterPdf] Processing ${i + 1}/${chaptersInfo.length}: Chapter ${chapterInfo.chapter_number}`);

    // Split PDF to extract just this chapter's pages
    const chapterPdfPath = await splitPdfByPageRange(
      pdfPath,
      chapterInfo.page_start,
      chapterInfo.page_end,
      chapterInfo.chapter_number
    );

    // Extract this chapter as if it were a single-chapter PDF
    const result = await extractSingleChapterPdf(chapterPdfPath, chapterInfo);

    // Cleanup temp file
    await fs.rm(chapterPdfPath, { force: true });

    allChapters.push(result.chapters[0]);
    console.log(`[extractMultiChapterPdf] ✅ Chapter ${chapterInfo.chapter_number}: ${result.chapters[0].markdown.length} chars`);
  }

  console.log(`[extractMultiChapterPdf] ✅ Extracted ${allChapters.length} chapters`);

  return {
    chapters: allChapters,
    total_chapters: allChapters.length
  };
}

/**
 * Split PDF by page range and return path to temporary PDF file
 */
async function splitPdfByPageRange(sourcePdfPath, startPage, endPage, chapterNumber) {
  console.log(`[splitPdfByPageRange] ✂️ Splitting pages ${startPage}-${endPage} for chapter ${chapterNumber}`);

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

  const tempPath = path.join(os.tmpdir(), `chapter_${chapterNumber}_${randomUUID()}.pdf`);
  const newPdfBytes = await newPdf.save();
  await fs.writeFile(tempPath, newPdfBytes);

  console.log(`[splitPdfByPageRange] ✅ Created temp PDF: ${tempPath} (${copiedPages.length} pages)`);
  return tempPath;
}

export default extractPdfAsMarkdown;
