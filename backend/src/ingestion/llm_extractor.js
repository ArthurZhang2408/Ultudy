/**
 * LLM-Based PDF Extraction
 *
 * Uses Gemini vision model to extract structured sections directly from PDF.
 * One call extracts everything: sections + markdown content.
 */

import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';

export async function extractStructuredSections(pdfPathOrPaths, materialType = null) {
  // Support both single file (string) and multiple files (array)
  const isMultiFile = Array.isArray(pdfPathOrPaths);

  if (isMultiFile) {
    console.log(`[llm_extractor] Starting multi-chapter extraction from ${pdfPathOrPaths.length} PDF(s)`);
    console.log(`[llm_extractor] Material type: ${materialType}`);
    return await extractMultiChapterContent(pdfPathOrPaths, materialType);
  } else {
    console.log('[llm_extractor] Starting structured extraction from PDF (legacy single-file)');
    return await extractSingleFileContent(pdfPathOrPaths);
  }
}

async function extractSingleFileContent(pdfPath) {
  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are an expert at analyzing educational PDFs and extracting structured content for student learning.

**YOUR TASK:**
Analyze this PDF and extract its main sections as separate markdown documents for generating educational lessons.

**IMPORTANT CONTEXT:**
These sections will be used to generate lessons for students to learn from. Focus on educational content only.

**SECTION CREATION RULES:**

Your goal is to create sections that maximize learning effectiveness. Each section should:

1. **Focus on a single coherent learning objective**: Students should be able to say "I'm learning about X" where X is clear and specific
2. **Contain substantial educational content**: Each section must have enough depth for students to build real understanding
3. **Separate when topics are distinct**: If you would teach two topics in separate lessons because they're fundamentally different concepts, create separate sections
4. **Combine when topics are related**: If topics build on each other or are different aspects of the same concept, keep them together

**Decision framework:**
- Would a student studying this topic need to understand both parts together, or are they independent?
- Could a student master one topic without the other?
- Do these topics appear in different chapters of typical textbooks?

**Section naming:**
- Name sections to accurately reflect what students will learn
- If a section covers multiple concepts, the name should indicate this
- Avoid generic names that hide the actual content

**Content to exclude:**
- References, bibliographies, acknowledgments
- Page numbers, headers, footers, metadata
- Author information, publication details
- Anything not directly educational

**MARKDOWN CONVERSION RULES:**
For each section, convert ALL content to clean markdown:

1. **Text Formatting:**
   - Headers: # Heading, ## Heading, ### Heading
   - Bold: **bold text**
   - Italic: *italic text*
   - Code: \`inline code\`

2. **Math Equations:**
   - Inline math: $x^2 + y^2 = z^2$
   - Display math: $$E = mc^2$$
   - Preserve all LaTeX formatting
   - Convert all equations faithfully

3. **Tables:**
   - Convert to markdown tables:
   | Header 1 | Header 2 |
   |----------|----------|
   | Cell 1   | Cell 2   |

4. **Code Blocks:**
   - Use syntax highlighting:
   \`\`\`python
   code here
   \`\`\`

5. **Images:**
   - Describe with: ![Description of what the image shows](image_ref)

6. **Lists:**
   - Numbered: 1. Item
   - Bullets: - Item

**CRITICAL JSON SAFETY:**
- Ensure ALL markdown is properly escaped for JSON
- Handle newlines, quotes, backslashes correctly
- Return direct JSON (no markdown code blocks)

**QUALITY STANDARDS:**
- Be faithful to the original content
- Don't skip important details
- Preserve all formulas, tables, and key information
- Each section should be comprehensive

Return structured JSON with title and sections.`;

  const userPrompt = `Extract all major sections from this PDF for educational lesson generation.

**CRITICAL EXCLUSIONS:**
- **DO NOT create sections for**: References, Bibliography, Works Cited, Acknowledgments
- **DO NOT include**: Page numbers, headers, footers, chapter numbers
- **DO NOT include**: Author information, publication dates, copyright notices
- **ONLY include**: Educational content that students need to learn

**SECTION CREATION APPROACH:**

Think like an educator designing a curriculum. For each section you create:

1. **Ask yourself**: "What is the ONE main thing students will learn in this section?"
2. **Test independence**: Could this be studied and mastered separately from other content?
3. **Check coherence**: Do all parts of this section support the same learning goal?
4. **Verify completeness**: Does this section contain everything needed to understand this topic?

**When to separate into different sections:**
- Topics that could be taught in different class sessions
- Concepts that don't depend on each other to be understood
- Content that serves different learning objectives

**When to combine into one section:**
- Content that builds sequentially (must learn A before B)
- Different aspects of the same underlying concept
- Examples and applications of the same principle

**Naming guidelines:**
- Use precise, descriptive names that tell students exactly what they'll learn
- If multiple topics are covered, the name must reflect all of them
- Avoid vague umbrella terms when specific terminology exists

**FOR EACH SECTION PROVIDE:**
- **name**: A clear, logical name for this learning cluster (short but descriptive)
- **description**: 1-2 sentence overview of what concepts students will learn in this section
- **markdown**: Complete markdown content for this entire section (educational content only)

**CONVERT ALL CONTENT FAITHFULLY:**
- Math equations → LaTeX ($inline$, $$display$$)
- Tables → Markdown tables with proper structure
- Text formatting → **bold**, *italic*, # headers
- Images → Descriptions with ![alt text](reference)
- Code → \`\`\`language code blocks\`\`\`
- Lists → Numbered or bullet lists

**CRITICAL:** Ensure markdown is properly escaped for JSON!`;

  const responseSchema = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Document title or main topic'
      },
      sections: {
        type: 'array',
        description: 'Array of sections, each containing 4-20 concepts',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Clear, logical name for this conceptual cluster'
            },
            description: {
              type: 'string',
              description: 'Brief 1-2 sentence overview of concepts covered'
            },
            markdown: {
              type: 'string',
              description: 'Complete markdown content for this section (properly escaped for JSON)'
            }
          },
          required: ['name', 'description', 'markdown']
        }
      }
    },
    required: ['title', 'sections']
  };

  try {
    const result = await provider.extractStructuredSections(
      pdfPath,
      systemPrompt,
      userPrompt,
      responseSchema
    );

    console.log('[llm_extractor] ✅ Extraction successful');
    console.log(`[llm_extractor] Title: "${result.title}"`);
    console.log(`[llm_extractor] Sections: ${result.sections.length}`);

    return result;
  } catch (error) {
    console.error('[llm_extractor] ❌ Extraction failed:', error.message);
    throw error;
  }
}

/**
 * Extract structured chapters and sections from multiple PDF files
 * Handles overlapping content (e.g., full textbook + lecture notes)
 */
async function extractMultiChapterContent(pdfPaths, materialType) {
  const provider = await createGeminiVisionProvider();

  // Build context about what we're processing
  const fileList = pdfPaths.map((p, i) => `File ${i + 1}: ${p.filename}`).join('\n');

  const systemPrompt = `You are an expert at analyzing educational PDFs and extracting structured content organized by chapters.

**YOUR TASK:**
Analyze ${pdfPaths.length} PDF file(s) and extract content organized by chapters, where each chapter contains sections.

**IMPORTANT CONTEXT:**
- Material type: ${materialType || 'textbook/lecture notes'}
- These files may contain overlapping content (e.g., a full textbook + individual lecture notes for each chapter)
- Your goal is to intelligently combine and organize this content by chapter
- Each chapter should have multiple sections that break down the learning content

**FILES PROVIDED:**
${fileList}

**HANDLING OVERLAPPING CONTENT:**
When you encounter the same chapter content in multiple files:
1. **Merge and consolidate**: Combine information from all sources for that chapter
2. **Preserve completeness**: Include ALL unique content, examples, and details
3. **Avoid duplication**: Don't repeat the same information multiple times
4. **Faithful extraction**: Extract exact content, formulas, tables, and examples from the PDFs
5. **Smart grouping**: If file names suggest chapter numbers (e.g., "Chapter_3.pdf", "Lecture_3.pdf"), group them accordingly

**CHAPTER ORGANIZATION:**
- Identify chapter numbers from file names, content, or headings
- If chapter numbers aren't explicit, infer them from the content sequence
- Each chapter should have a clear title
- Organize sections within each chapter logically

**SECTION CREATION RULES:**
Your goal is to create sections that maximize learning effectiveness. Each section should:

1. **Focus on a single coherent learning objective**: Students should be able to say "I'm learning about X" where X is clear and specific
2. **Contain substantial educational content**: Each section must have enough depth for students to build real understanding
3. **Separate when topics are distinct**: If you would teach two topics in separate lessons, create separate sections
4. **Combine when topics are related**: If topics build on each other or are different aspects of the same concept, keep them together

**Content to exclude:**
- References, bibliographies, acknowledgments
- Page numbers, headers, footers, metadata
- Author information, publication details
- Anything not directly educational

**MARKDOWN CONVERSION RULES:**
For each section, convert ALL content to clean markdown:

1. **Text Formatting:**
   - Headers: # Heading, ## Heading, ### Heading
   - Bold: **bold text**
   - Italic: *italic text*
   - Code: \`inline code\`

2. **Math Equations:**
   - Inline math: $x^2 + y^2 = z^2$
   - Display math: $$E = mc^2$$
   - Preserve all LaTeX formatting
   - Convert all equations faithfully

3. **Tables:**
   - Convert to markdown tables with proper structure

4. **Code Blocks:**
   - Use syntax highlighting: \`\`\`language

5. **Images:**
   - Describe with: ![Description](image_ref)

6. **Lists:**
   - Numbered: 1. Item
   - Bullets: - Item

**CRITICAL JSON SAFETY:**
- Ensure ALL markdown is properly escaped for JSON
- Handle newlines, quotes, backslashes correctly
- Return direct JSON (no markdown code blocks)

**QUALITY STANDARDS:**
- Be faithful to the original content
- Don't skip important details
- Preserve all formulas, tables, and key information
- Each section should be comprehensive`;

  const userPrompt = `Extract all chapters and their sections from these ${pdfPaths.length} PDF file(s).

**CRITICAL EXCLUSIONS:**
- **DO NOT create sections for**: References, Bibliography, Works Cited, Acknowledgments
- **DO NOT include**: Page numbers, headers, footers, chapter numbers
- **DO NOT include**: Author information, publication dates, copyright notices
- **ONLY include**: Educational content that students need to learn

**PROCESSING APPROACH:**

1. **Identify chapters**: Look for chapter indicators in file names, headings, and content structure
2. **Merge overlapping content**: If multiple files cover the same chapter, combine them intelligently
3. **Extract sections per chapter**: Break each chapter into logical learning sections
4. **Maintain completeness**: Include all unique content, examples, and explanations

**FOR EACH CHAPTER PROVIDE:**
- **chapter**: Chapter number (integer)
- **title**: Clear chapter title
- **sections**: Array of sections within this chapter, where each section has:
  - **name**: Clear, descriptive section name
  - **description**: 1-2 sentence overview of what students will learn
  - **markdown**: Complete markdown content for this section

**EXAMPLE STRUCTURE:**
If you have:
- "Textbook.pdf" (chapters 1-5)
- "Lecture_3_Notes.pdf" (detailed notes for chapter 3)
- "Chapter4_Examples.pdf" (additional examples for chapter 4)

You should output chapters 1-5, where:
- Chapter 3 combines content from textbook + lecture notes
- Chapter 4 combines content from textbook + examples
- Chapters 1, 2, 5 use only textbook content

**CONVERT ALL CONTENT FAITHFULLY:**
- Math equations → LaTeX ($inline$, $$display$$)
- Tables → Markdown tables
- Text formatting → **bold**, *italic*, # headers
- Images → Descriptions
- Code → \`\`\`language blocks\`\`\`
- Lists → Numbered or bullet lists

**CRITICAL:** Ensure markdown is properly escaped for JSON!`;

  const responseSchema = {
    type: 'object',
    properties: {
      chapters: {
        type: 'array',
        description: 'Array of chapters extracted from the PDF(s)',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            chapter: {
              type: 'integer',
              description: 'Chapter number'
            },
            title: {
              type: 'string',
              description: 'Chapter title'
            },
            sections: {
              type: 'array',
              description: 'Sections within this chapter',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Clear, logical name for this section'
                  },
                  description: {
                    type: 'string',
                    description: 'Brief 1-2 sentence overview'
                  },
                  markdown: {
                    type: 'string',
                    description: 'Complete markdown content (properly escaped for JSON)'
                  }
                },
                required: ['name', 'description', 'markdown']
              }
            }
          },
          required: ['chapter', 'title', 'sections']
        }
      }
    },
    required: ['chapters']
  };

  try {
    const result = await provider.extractStructuredChapters(
      pdfPaths.map(p => p.path),
      systemPrompt,
      userPrompt,
      responseSchema
    );

    console.log('[llm_extractor] ✅ Multi-chapter extraction successful');
    console.log(`[llm_extractor] Chapters: ${result.chapters.length}`);

    // Log chapter summary
    result.chapters.forEach(ch => {
      console.log(`[llm_extractor]   Chapter ${ch.chapter}: ${ch.title} (${ch.sections.length} sections)`);
    });

    return result;
  } catch (error) {
    console.error('[llm_extractor] ❌ Multi-chapter extraction failed:', error.message);
    throw error;
  }
}

export default extractStructuredSections;
