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

  const userPrompt = `Extract all chapters and their sections from this PDF file with COMPLETE content fidelity.

**YOUR MISSION:**
This is a critical step in preserving educational content. You must extract EVERY piece of information from this PDF that students need to learn. This extracted markdown will be the ONLY source we have for generating learning materials later.

**EXCLUSIONS:**
- **DO NOT create chapters for**: References, Bibliography, Acknowledgments, Table of Contents, Index
- **DO NOT include**: Page numbers, headers, footers, copyright notices, publisher information
- **ONLY include**: Educational content that students need to learn

**CHAPTER ORGANIZATION:**
- Identify chapter numbers from headings (e.g., "Chapter 2", "Ch. 3", "Unit 2")
- If no explicit numbers, assign sequential numbers starting from 1
- If this is a single-chapter file (e.g., "Chapter 5.pdf"), extract that one chapter
- Order chapters numerically

**FOR EACH CHAPTER PROVIDE:**
- **chapter**: The chapter number (integer)
- **title**: Clear chapter title
- **description** (optional): Brief overview of the chapter
- **sections**: Array of sections within this chapter

**FOR EACH SECTION PROVIDE:**
- **name**: Clear, descriptive name for this section (e.g., "5.1 Introduction to Limits", "Newton's Laws of Motion")
- **description**: 1-2 sentence overview of concepts covered
- **markdown**: **COMPLETE FAITHFUL EXTRACTION** of all content
  - Extract EVERY explanation, formula, theorem, definition, proof, example
  - Include ALL worked examples with complete step-by-step solutions
  - Preserve ALL text, diagrams descriptions, table data
  - Do NOT summarize or abbreviate - this must be complete
  - This is the master copy that students will learn from

**CONVERT ALL CONTENT WITH FULL FIDELITY:**
- Math equations → LaTeX ($inline$ for inline, $$display$$ for block equations)
- Tables → Full markdown tables with all data preserved
- Text formatting → **bold**, *italic*, headers (#, ##, ###)
- Images/Diagrams → ![detailed description](reference)
- Code blocks → \`\`\`language with full code\`\`\`
- Lists → Numbered or bullet lists maintaining hierarchy
- Proofs → Complete step-by-step derivations
- Examples → Full worked solutions with all steps
- Definitions → Complete with context and explanation
- Theorems → Statement + proof + explanation

**CRITICAL JSON FORMATTING:**
- Escape all special characters in markdown (quotes, backslashes, newlines)
- Use \\n for newlines in strings
- Escape " as \\"
- Test that output is valid JSON

**REMEMBER:** Quality AND Quantity - extract EVERYTHING. This is the complete course material.`;

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

/**
 * Extract chapters with raw unsectionalized markdown (Phase 1)
 * This is for the two-phase processing approach where sections are generated later
 *
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<object>} - {chapters: [{chapter, title, description, raw_markdown}]}
 */
export async function extractChaptersWithRawMarkdown(pdfPath) {
  console.log('[llm_extractor] Starting raw chapter extraction from PDF');

  const provider = getProvider();

  const systemPrompt = `You are an expert educational content extractor specializing in converting textbook PDFs to structured markdown.

Your task: Extract chapters from this PDF, preserving ALL educational content as raw markdown (no section splitting yet).

Focus on:
- Identifying chapter boundaries
- Extracting complete chapter content
- Converting to high-fidelity markdown
- Preserving formulas, tables, code, images`;

  const userPrompt = `Extract all chapters from this PDF file with COMPLETE content preservation.

**MISSION:**
Extract the FULL content of each chapter as unsectionalized markdown. Do NOT split into sections yet - that will be done later. Just identify chapter boundaries and extract everything within each chapter.

**EXCLUSIONS:**
- **DO NOT create chapters for**: References, Bibliography, Acknowledgments, Table of Contents, Index, Appendix
- **DO NOT include**: Page numbers, headers, footers, copyright notices
- **ONLY include**: Educational content students need to learn

**CHAPTER IDENTIFICATION:**
- Identify chapter numbers from headings (e.g., "Chapter 2", "Ch. 3", "Unit 2", "Lecture 5")
- If no explicit numbers, assign sequential numbers starting from 1
- If this is a single-chapter file (e.g., "chapter_5.pdf"), extract that one chapter
- Order chapters numerically

**FOR EACH CHAPTER PROVIDE:**
- **chapter**: The chapter number (integer)
- **title**: Chapter title (e.g., "Introduction to Calculus", "Newton's Laws")
- **description**: Brief 1-2 sentence overview of the chapter (optional)
- **raw_markdown**: **COMPLETE** chapter content as one markdown blob
  - Extract ALL text, explanations, examples, proofs, definitions
  - Include ALL formulas, equations, derivations
  - Preserve ALL tables, diagrams (with descriptions), code blocks
  - Do NOT organize into sections - keep as continuous content
  - This is the master copy - nothing should be lost

**CONVERT CONTENT WITH FULL FIDELITY:**
- Math equations → LaTeX ($inline$, $$display$$)
- Tables → Full markdown tables
- Text formatting → **bold**, *italic*, headers (# ## ###)
- Images/Diagrams → ![detailed description](ref)
- Code → \`\`\`language blocks\`\`\`
- Lists → Numbered/bullet lists
- Proofs → Complete step-by-step
- Examples → Full worked solutions

**CRITICAL JSON FORMATTING:**
- Escape all special characters (quotes, backslashes, newlines)
- Use \\n for newlines in markdown strings
- Escape " as \\"
- Ensure valid JSON output

**REMEMBER:** Extract EVERYTHING from each chapter. This raw markdown will be split into sections later.`;

  const responseSchema = {
    type: 'object',
    properties: {
      chapters: {
        type: 'array',
        description: 'Array of chapters with raw unsectionalized markdown',
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
              description: 'Optional brief chapter overview (1-2 sentences)'
            },
            raw_markdown: {
              type: 'string',
              description: 'Complete unsectionalized markdown content for entire chapter'
            }
          },
          required: ['chapter', 'title', 'raw_markdown']
        }
      }
    },
    required: ['chapters']
  };

  try {
    const result = await provider.extractChaptersFromMultiplePDFs(
      [pdfPath], // Single PDF at a time
      systemPrompt,
      userPrompt,
      responseSchema
    );

    console.log('[llm_extractor] ✅ Raw chapter extraction successful');
    console.log(`[llm_extractor] Chapters: ${result.chapters.length}`);
    result.chapters.forEach(chapter => {
      const markdownLength = chapter.raw_markdown?.length || 0;
      console.log(`[llm_extractor]   Chapter ${chapter.chapter}: "${chapter.title}" (${(markdownLength / 1024).toFixed(1)}KB markdown)`);
    });

    return result;
  } catch (error) {
    console.error('[llm_extractor] ❌ Raw chapter extraction failed:', error.message);
    throw error;
  }
}

/**
 * Generate sections from raw chapter markdown (Phase 2)
 * Takes unsectionalized markdown and intelligently splits into logical sections
 *
 * @param {number} chapterNumber - Chapter number
 * @param {string} chapterTitle - Chapter title
 * @param {string[]} rawMarkdownSources - Array of raw markdown from different sources
 * @returns {Promise<object>} - {sections: [{name, description, markdown}]}
 */
export async function generateSectionsFromRawMarkdown(chapterNumber, chapterTitle, rawMarkdownSources) {
  console.log(`[llm_extractor] Starting section generation for Chapter ${chapterNumber}: ${chapterTitle}`);
  console.log(`[llm_extractor] Processing ${rawMarkdownSources.length} source(s)`);

  const provider = getProvider();

  // Combine all sources with separators
  const combinedMarkdown = rawMarkdownSources.map((md, idx) => {
    return `<!-- SOURCE ${idx + 1} -->\n\n${md}`;
  }).join('\n\n<!-- END SOURCE -->\n\n');

  const totalLength = combinedMarkdown.length;
  console.log(`[llm_extractor] Total content: ${(totalLength / 1024).toFixed(1)}KB`);

  const systemPrompt = `You are an expert educational content organizer specializing in creating logical section breakdowns for textbook chapters.

Your task: Take raw chapter markdown and split it into well-organized sections that students can learn from incrementally.`;

  const userPrompt = `You have the COMPLETE content for **Chapter ${chapterNumber}: ${chapterTitle}**.

${rawMarkdownSources.length > 1 ? `This chapter combines content from ${rawMarkdownSources.length} different sources (marked with <!-- SOURCE N --> tags). Your job is to intelligently merge and organize ALL this content into logical sections.` : 'This chapter comes from a single source. Your job is to organize it into logical sections.'}

**YOUR TASK:**
Split this chapter into logical sections that make sense for learning. Each section should cover a coherent topic or concept.

**SECTION ORGANIZATION:**
- Create 3-10 sections per chapter (depending on content)
- Each section should be substantial (not too granular)
- Sections should follow natural learning progression
- Use clear, descriptive names (e.g., "5.1 Introduction to Limits", "Newton's First Law")

${rawMarkdownSources.length > 1 ? `
**MULTI-SOURCE MERGING:**
- If multiple sources cover the same topic, MERGE them intelligently
- Use the best explanation, but include additional examples/perspectives from other sources
- Eliminate redundancy - don't repeat the same explanation twice
- If one source has a better derivation/proof, use that one
- Combine worked examples from all sources
- Create ONE unified section per topic, not separate sections per source
` : ''}

**FOR EACH SECTION PROVIDE:**
- **name**: Clear section name (e.g., "5.2 Limit Laws and Properties")
- **description**: 1-2 sentence overview of concepts covered
- **markdown**: Complete markdown content for this section
  - Include ALL relevant content from the raw chapter
  - Preserve ALL formulas, examples, proofs, tables
  - Maintain high fidelity to original content
  - This will be used for concept generation later

**CONTENT PRESERVATION:**
- Do NOT summarize or abbreviate - keep full content
- Do NOT lose any formulas, examples, or key information
- ALL content from raw markdown must appear in some section
- Quality AND quantity - preserve everything

**CRITICAL JSON FORMATTING:**
- Escape special characters properly
- Use \\n for newlines
- Escape quotes as \\"
- Ensure valid JSON

Here is the raw chapter content:

\`\`\`markdown
${combinedMarkdown}
\`\`\`

Generate a well-organized section breakdown that preserves ALL content.`;

  const responseSchema = {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        description: 'Array of sections created from raw chapter markdown',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Clear, descriptive section name'
            },
            description: {
              type: 'string',
              description: 'Brief 1-2 sentence overview of concepts covered in this section'
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
    required: ['sections']
  };

  try {
    // For text-only generation (no PDF input), use the text generation method
    const result = await provider.generateText(systemPrompt, userPrompt, responseSchema);

    console.log('[llm_extractor] ✅ Section generation successful');
    console.log(`[llm_extractor] Sections: ${result.sections.length}`);
    result.sections.forEach((section, idx) => {
      const markdownLength = section.markdown?.length || 0;
      console.log(`[llm_extractor]   ${idx + 1}. ${section.name} (${(markdownLength / 1024).toFixed(1)}KB)`);
    });

    return result;
  } catch (error) {
    console.error('[llm_extractor] ❌ Section generation failed:', error.message);
    throw error;
  }
}

export default extractStructuredSections;
