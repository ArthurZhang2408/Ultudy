/**
 * LLM-Based PDF Extraction
 *
 * Uses Gemini vision model to extract structured sections directly from PDF.
 * One call extracts everything: sections + markdown content.
 */

import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';

export async function extractStructuredSections(pdfPath) {
  console.log('[llm_extractor] Starting structured extraction from PDF');

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
 * Extract chapters and sections from multiple PDFs (for textbook/lecture notes)
 *
 * This function processes multiple PDF files together and extracts a structured
 * hierarchy of chapters and sections. The LLM intelligently handles overlapping
 * content between files.
 *
 * @param {string[]} pdfPaths - Array of paths to PDF files
 * @returns {Promise<{chapters: Array<{chapter: number, title: string, description?: string, sections: Array<{name: string, description: string, markdown: string}>}>}>}
 */
export async function extractChaptersFromMultiplePDFs(pdfPaths) {
  console.log(`[llm_extractor] Starting chapter extraction from ${pdfPaths.length} PDFs`);

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are an expert at analyzing educational PDFs and extracting structured content organized by chapters.

**YOUR TASK:**
Analyze these ${pdfPaths.length} PDF file(s) and extract chapters with their sections. The files may contain:
- A single textbook PDF with multiple chapters
- Multiple lecture note PDFs, each covering different chapters
- A combination with overlapping content (e.g., textbook + lecture notes covering the same chapters)

**CRITICAL: HANDLING OVERLAPPING CONTENT:**
When multiple files cover the same chapter:
1. **Merge the content intelligently**: Combine information from all sources
2. **Use the most complete version**: Prefer more detailed explanations
3. **Preserve all important content**: Don't skip unique information from any file
4. **Maintain educational quality**: Ensure combined content flows logically

**CHAPTER EXTRACTION RULES:**

1. **Identify chapter numbers**: Extract chapter numbers from the content (headings, titles, etc.)
2. **Group content by chapter**: All sections belonging to a chapter should be grouped together
3. **Create logical chapters**: Each chapter should represent a major topic or unit of study
4. **Handle edge cases**:
   - If content has no clear chapter numbers, assign logical chapter numbers starting from 1
   - Introductory material can be Chapter 0 or Chapter 1
   - Appendices can be assigned chapter numbers after main content

**SECTION CREATION RULES (within each chapter):**

Each section within a chapter should:
1. **Focus on a single coherent learning objective**: Students should understand "I'm learning about X"
2. **Contain substantial educational content**: Enough depth for real understanding
3. **Separate when topics are distinct**: Different concepts = different sections
4. **Combine when topics are related**: Sequential or related content = same section

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

3. **Tables:** Convert to markdown tables
4. **Code Blocks:** Use \`\`\`language syntax
5. **Images:** ![Description](image_ref)
6. **Lists:** Numbered and bulleted

**CRITICAL JSON SAFETY:**
- Ensure ALL markdown is properly escaped for JSON
- Handle newlines, quotes, backslashes correctly
- Return direct JSON (no markdown code blocks)

**QUALITY STANDARDS:**
- Be faithful to the original content
- Don't skip important details
- Preserve all formulas, tables, and key information
- Each section should be comprehensive

Return structured JSON with chapters array.`;

  const userPrompt = `Extract all chapters and their sections from these ${pdfPaths.length} PDF file(s).

**CRITICAL INSTRUCTIONS:**

${pdfPaths.length > 1 ? `
**HANDLING MULTIPLE FILES:**
You are analyzing ${pdfPaths.length} files. They may have overlapping content (e.g., a textbook and lecture notes covering the same chapters).

Your job:
1. **Identify which chapters are covered across ALL files**
2. **Merge overlapping content**: If Chapter 2 appears in both a textbook and lecture notes, combine them into ONE Chapter 2 with comprehensive sections
3. **Preserve unique content**: If one file has information the other doesn't, include it
4. **Use the best explanations**: If one source explains a concept better, use that version
5. **Maintain coherence**: The final output should read as one unified resource per chapter

Example scenario:
- File 1 (textbook): Chapters 1-15 with detailed theory
- Files 2-16 (lecture notes): 15 separate PDFs, each covering one chapter with examples and simplified explanations

Expected output: 15 chapters, each combining the textbook's theory with the lecture notes' examples and explanations
` : ''}

**EXCLUSIONS:**
- **DO NOT create chapters for**: References, Bibliography, Acknowledgments, Table of Contents
- **DO NOT include**: Page numbers, headers, footers, copyright notices
- **ONLY include**: Educational content that students need to learn

**CHAPTER ORGANIZATION:**
- Identify chapter numbers from headings (e.g., "Chapter 2", "Ch. 3", "Unit 2")
- If no explicit numbers, assign sequential numbers starting from 1
- Order chapters numerically

**FOR EACH CHAPTER PROVIDE:**
- **chapter**: The chapter number (integer)
- **title**: Clear chapter title
- **description** (optional): Brief overview of the chapter
- **sections**: Array of sections within this chapter

**FOR EACH SECTION PROVIDE:**
- **name**: Clear, descriptive name for this section
- **description**: 1-2 sentence overview of concepts covered
- **markdown**: **CONCISE** summary of key concepts, formulas, and examples
  - Focus on: Core concepts, important formulas, key definitions, worked examples
  - Omit: Verbose explanations, redundant examples, auxiliary text
  - Length: Aim for 200-500 words per section (not the entire textbook section!)
  - Quality over quantity - capture essential knowledge, not every word

**CONVERT CONTENT:**
- Math equations → LaTeX ($inline$, $$display$$)
- Key formulas → Highlighted with LaTeX
- Tables → Markdown tables (if essential)
- Important text → **bold**, *italic*
- Code → \`\`\`language blocks\`\`\` (if present)
- Lists → Bullet/numbered for clarity

**OUTPUT SIZE LIMIT:** Keep total response under 8000 tokens. Prioritize breadth (all chapters/sections) over depth (verbose content).

**CRITICAL:** Ensure markdown is properly escaped for JSON!`;

  const responseSchema = {
    type: 'object',
    properties: {
      chapters: {
        type: 'array',
        description: 'Array of chapters, each containing sections',
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
            description: {
              type: 'string',
              description: 'Optional brief chapter overview'
            },
            sections: {
              type: 'array',
              description: 'Array of sections within this chapter',
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
          required: ['chapter', 'title', 'sections']
        }
      }
    },
    required: ['chapters']
  };

  try {
    const result = await provider.extractChaptersFromMultiplePDFs(
      pdfPaths,
      systemPrompt,
      userPrompt,
      responseSchema
    );

    console.log('[llm_extractor] ✅ Chapter extraction successful');
    console.log(`[llm_extractor] Chapters: ${result.chapters.length}`);
    result.chapters.forEach(chapter => {
      console.log(`[llm_extractor]   Chapter ${chapter.chapter}: "${chapter.title}" (${chapter.sections.length} sections)`);
    });

    return result;
  } catch (error) {
    console.error('[llm_extractor] ❌ Chapter extraction failed:', error.message);
    throw error;
  }
}

export default extractStructuredSections;
