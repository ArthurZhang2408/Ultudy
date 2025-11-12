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

export default extractStructuredSections;
