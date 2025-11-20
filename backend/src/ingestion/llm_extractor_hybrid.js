/**
 * Hybrid PDF Extraction - Two-Phase Approach
 *
 * Phase 1: Determine if PDF contains single or multiple chapters
 *          If multiple, get page ranges for each chapter
 *
 * Phase 2: For each chapter (or the whole PDF if single chapter):
 *          - Split PDF by page range
 *          - Extract sections from that chapter
 *          - Return sections with chapter metadata
 *
 * This avoids token limits by processing in smaller chunks.
 */

import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

/**
 * Main extraction function - determines strategy and extracts accordingly
 */
export async function extractPdfWithHybridApproach(pdfPath) {
  console.log('[llm_extractor_hybrid] ========================================');
  console.log('[llm_extractor_hybrid] 🎯 HYBRID TWO-PHASE EXTRACTION');
  console.log('[llm_extractor_hybrid] ========================================');
  console.log('[llm_extractor_hybrid] PDF path:', pdfPath);

  // Phase 1: Analyze PDF structure
  const analysis = await analyzePdfStructure(pdfPath);

  console.log('[llm_extractor_hybrid] 📊 Analysis result:');
  console.log(`[llm_extractor_hybrid]   Is single chapter: ${analysis.is_single_chapter}`);
  console.log(`[llm_extractor_hybrid]   Chapter count: ${analysis.chapter_count}`);

  if (analysis.is_single_chapter) {
    // Single chapter: extract sections directly
    console.log('[llm_extractor_hybrid] 📄 Single chapter detected - extracting sections directly');
    return await extractSingleChapterBySections(pdfPath, analysis);
  } else {
    // Multiple chapters: split by page ranges, then extract sections for each
    console.log('[llm_extractor_hybrid] 📚 Multiple chapters detected - splitting and extracting');
    return await extractMultipleChaptersBySections(pdfPath, analysis);
  }
}

/**
 * Phase 1: Analyze PDF to determine if it's single or multiple chapters
 * Returns chapter count and page ranges
 */
async function analyzePdfStructure(pdfPath) {
  console.log('[analyzePdfStructure] 🔍 Analyzing PDF structure...');

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are an expert at analyzing educational PDFs to identify chapter structure.

**YOUR TASK:**
Analyze this PDF and determine:
1. Does it contain a SINGLE chapter or MULTIPLE chapters?
2. If multiple chapters, what are the page ranges for each chapter?

**IMPORTANT:**
- Chapters might overlap on pages (e.g., Chapter 2 ends on page 25, Chapter 3 starts on page 25)
- Be precise about page numbers - they are critical for splitting
- If the PDF is just one chapter (or appears to be lecture notes, tutorial, etc. without clear chapter divisions), mark as single chapter`;

  const userPrompt = `Analyze this PDF and tell me about its chapter structure.

**RESPOND IN THIS EXACT JSON FORMAT:**

{
  "is_single_chapter": true or false,
  "chapter_count": number,
  "chapters": [
    {
      "chapter_number": "1",
      "title": "Chapter title",
      "page_start": 5,
      "page_end": 17
    }
  ]
}

**RULES:**
- If single chapter: set is_single_chapter=true, chapter_count=1, and provide one entry in chapters array
- If multiple chapters: set is_single_chapter=false, chapter_count=actual count, and list all chapters with accurate page ranges
- Page numbers must be the actual page numbers from the PDF
- If chapters overlap on a page, that's fine - include the same page in both ranges`;

  const responseSchema = {
    type: 'object',
    properties: {
      is_single_chapter: {
        type: 'boolean',
        description: 'True if PDF contains only one chapter'
      },
      chapter_count: {
        type: 'integer',
        description: 'Number of chapters in the PDF'
      },
      chapters: {
        type: 'array',
        description: 'Array of chapter metadata with page ranges',
        items: {
          type: 'object',
          properties: {
            chapter_number: {
              type: 'string',
              description: 'Chapter number or identifier'
            },
            title: {
              type: 'string',
              description: 'Chapter title'
            },
            page_start: {
              type: 'integer',
              description: 'Starting page number (inclusive)'
            },
            page_end: {
              type: 'integer',
              description: 'Ending page number (inclusive)'
            }
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

  console.log('[analyzePdfStructure] ✅ Analysis complete');
  analysis.chapters.forEach((ch, idx) => {
    console.log(`[analyzePdfStructure]   ${idx + 1}. Chapter ${ch.chapter_number}: "${ch.title}" (pages ${ch.page_start}-${ch.page_end})`);
  });

  return analysis;
}

/**
 * Extract sections from a single-chapter PDF
 */
async function extractSingleChapterBySections(pdfPath, analysis) {
  console.log('[extractSingleChapterBySections] 📄 Processing single chapter PDF');

  const provider = await createGeminiVisionProvider();

  const chapterInfo = analysis.chapters[0];

  const systemPrompt = `You are an expert at analyzing educational PDFs and extracting structured content for student learning.

**YOUR TASK:**
Extract all major SECTIONS from this chapter as separate entries for generating educational lessons.

**SECTION CREATION RULES:**
- Each section should focus on a coherent learning objective
- Sections should be substantial enough for students to build understanding
- Separate when topics are distinct; combine when topics build on each other

**EXCLUDE:**
- References, bibliographies, acknowledgments
- Page numbers, headers, footers
- Author information, publication details`;

  const userPrompt = `Extract all sections from this chapter.

**FOR EACH SECTION PROVIDE:**
- **name**: Clear, descriptive section name
- **description**: 1-2 sentence overview
- **markdown**: Complete markdown content with:
  - Math equations: $inline$ and $$display$$
  - Tables as markdown tables
  - Code blocks with syntax highlighting
  - Proper formatting (headers, bold, italic, lists)

Return structured JSON with sections array.`;

  const responseSchema = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Chapter title'
      },
      sections: {
        type: 'array',
        description: 'Array of sections from this chapter',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Section name'
            },
            description: {
              type: 'string',
              description: 'Brief overview'
            },
            markdown: {
              type: 'string',
              description: 'Complete markdown content'
            }
          },
          required: ['name', 'description', 'markdown']
        }
      }
    },
    required: ['title', 'sections']
  };

  const extraction = await provider.extractStructuredSections(
    pdfPath,
    systemPrompt,
    userPrompt,
    responseSchema
  );

  console.log(`[extractSingleChapterBySections] ✅ Extracted ${extraction.sections.length} sections`);

  // Return in unified format
  return {
    chapters: [
      {
        chapter_number: chapterInfo.chapter_number,
        title: chapterInfo.title,
        page_start: chapterInfo.page_start,
        page_end: chapterInfo.page_end,
        sections: extraction.sections
      }
    ],
    total_chapters: 1,
    total_sections: extraction.sections.length
  };
}

/**
 * Extract sections from a multi-chapter PDF
 * Splits PDF by chapter page ranges, then extracts sections from each
 */
async function extractMultipleChaptersBySections(pdfPath, analysis) {
  console.log('[extractMultipleChaptersBySections] 📚 Processing multi-chapter PDF');
  console.log(`[extractMultipleChaptersBySections] Will process ${analysis.chapter_count} chapters`);

  const allChaptersWithSections = [];
  let totalSections = 0;

  for (let i = 0; i < analysis.chapters.length; i++) {
    const chapterInfo = analysis.chapters[i];
    console.log(`[extractMultipleChaptersBySections] ========================================`);
    console.log(`[extractMultipleChaptersBySections] Processing chapter ${i + 1}/${analysis.chapter_count}`);
    console.log(`[extractMultipleChaptersBySections] Chapter ${chapterInfo.chapter_number}: "${chapterInfo.title}"`);
    console.log(`[extractMultipleChaptersBySections] Pages: ${chapterInfo.page_start}-${chapterInfo.page_end}`);
    console.log(`[extractMultipleChaptersBySections] ========================================`);

    try {
      // Step 1: Extract pages for this chapter
      const chapterPdfPath = await extractPdfPages(
        pdfPath,
        chapterInfo.page_start,
        chapterInfo.page_end
      );

      console.log(`[extractMultipleChaptersBySections] ✅ Created chapter PDF: ${chapterPdfPath}`);

      // Step 2: Extract sections from this chapter PDF
      const sections = await extractSectionsFromChapterPdf(chapterPdfPath, chapterInfo);

      console.log(`[extractMultipleChaptersBySections] ✅ Extracted ${sections.length} sections from chapter ${chapterInfo.chapter_number}`);

      // Step 3: Clean up temporary chapter PDF
      await fs.rm(chapterPdfPath, { force: true });

      allChaptersWithSections.push({
        chapter_number: chapterInfo.chapter_number,
        title: chapterInfo.title,
        page_start: chapterInfo.page_start,
        page_end: chapterInfo.page_end,
        sections: sections
      });

      totalSections += sections.length;

    } catch (error) {
      console.error(`[extractMultipleChaptersBySections] ❌ Failed to process chapter ${chapterInfo.chapter_number}:`, error.message);
      throw new Error(`Failed to process chapter ${chapterInfo.chapter_number}: ${error.message}`);
    }
  }

  console.log('[extractMultipleChaptersBySections] ✅ All chapters processed');
  console.log(`[extractMultipleChaptersBySections] Total chapters: ${analysis.chapter_count}`);
  console.log(`[extractMultipleChaptersBySections] Total sections: ${totalSections}`);

  return {
    chapters: allChaptersWithSections,
    total_chapters: analysis.chapter_count,
    total_sections: totalSections
  };
}

/**
 * Extract specific page range from PDF and save as new PDF
 */
async function extractPdfPages(sourcePdfPath, startPage, endPage) {
  console.log(`[extractPdfPages] Extracting pages ${startPage}-${endPage} from PDF`);

  // Read source PDF
  const pdfBytes = await fs.readFile(sourcePdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Create new PDF with only the specified pages
  const newPdf = await PDFDocument.create();

  // Page indices are 0-based, but our page numbers are 1-based
  const startIndex = startPage - 1;
  const endIndex = endPage - 1;

  const totalPages = pdfDoc.getPageCount();
  const actualEndIndex = Math.min(endIndex, totalPages - 1);

  console.log(`[extractPdfPages] Source PDF has ${totalPages} pages`);
  console.log(`[extractPdfPages] Copying pages ${startIndex + 1} to ${actualEndIndex + 1} (0-indexed: ${startIndex}-${actualEndIndex})`);

  // Copy pages
  const pagesToCopy = [];
  for (let i = startIndex; i <= actualEndIndex; i++) {
    pagesToCopy.push(i);
  }

  const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
  copiedPages.forEach(page => newPdf.addPage(page));

  // Save to temp file
  const tempPath = path.join(os.tmpdir(), `chapter_${randomUUID()}.pdf`);
  const newPdfBytes = await newPdf.save();
  await fs.writeFile(tempPath, newPdfBytes);

  console.log(`[extractPdfPages] ✅ Created chapter PDF with ${copiedPages.length} pages at ${tempPath}`);

  return tempPath;
}

/**
 * Extract sections from a single chapter PDF
 */
async function extractSectionsFromChapterPdf(chapterPdfPath, chapterInfo) {
  console.log(`[extractSectionsFromChapterPdf] Extracting sections from chapter ${chapterInfo.chapter_number}`);

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are an expert at analyzing educational PDFs and extracting structured content.

**YOUR TASK:**
Extract all SECTIONS from this chapter (Chapter ${chapterInfo.chapter_number}: "${chapterInfo.title}").

**CRITICAL:**
- This PDF contains ONLY Chapter ${chapterInfo.chapter_number}
- Extract ALL sections from this chapter
- Do NOT skip any educational content

**SECTION CREATION RULES:**
- Each section should have a clear learning objective
- Sections should be substantial and self-contained
- Include all educational content (text, equations, tables, examples)

**EXCLUDE:**
- References, bibliographies
- Page numbers, headers, footers`;

  const userPrompt = `Extract all sections from Chapter ${chapterInfo.chapter_number}: "${chapterInfo.title}".

**FOR EACH SECTION:**
- **name**: Section name
- **description**: 1-2 sentence overview
- **markdown**: Complete content with:
  - Math: $inline$ and $$display$$
  - Tables as markdown
  - Code blocks with syntax
  - Proper formatting

Return JSON with sections array.`;

  const responseSchema = {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            markdown: { type: 'string' }
          },
          required: ['name', 'description', 'markdown']
        }
      }
    },
    required: ['sections']
  };

  const result = await provider.extractStructuredSections(
    chapterPdfPath,
    systemPrompt,
    userPrompt,
    responseSchema
  );

  console.log(`[extractSectionsFromChapterPdf] ✅ Extracted ${result.sections.length} sections`);

  return result.sections;
}

export default extractPdfWithHybridApproach;
