/**
 * LLM-Based PDF Extraction
 *
 * Uses Gemini vision model to extract structured sections directly from PDF.
 * One call extracts everything: sections + markdown content.
 */

import { createGeminiVisionProvider } from '../providers/llm/gemini_vision.js';

/**
 * Parse markdown document into title and sections
 *
 * Expected format:
 * # Document Title
 * ## Section 1
 * Content...
 * ## Section 2
 * Content...
 *
 * @param {string} markdown - Full markdown document
 * @returns {{ title: string, sections: Array<{ name: string, description: string, markdown: string }> }}
 */
function parseMarkdownSections(markdown) {
  const lines = markdown.split('\n');

  // Extract title (first # heading)
  let title = 'Untitled Document';
  let titleLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      title = line.substring(2).trim();
      titleLineIndex = i;
      break;
    }
  }

  console.log(`[parseMarkdownSections] Found title: "${title}"`);

  // Find all ## section headings
  const sectionIndices = [];
  for (let i = titleLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      sectionIndices.push(i);
    }
  }

  console.log(`[parseMarkdownSections] Found ${sectionIndices.length} section headings`);

  if (sectionIndices.length === 0) {
    throw new Error('No sections found in markdown. Expected ## headings for sections.');
  }

  // Extract sections
  const sections = [];
  for (let i = 0; i < sectionIndices.length; i++) {
    const startIndex = sectionIndices[i];
    const endIndex = i < sectionIndices.length - 1 ? sectionIndices[i + 1] : lines.length;

    // Section name from ## heading
    const name = lines[startIndex].substring(3).trim();

    // Section content (everything after the ## heading until next ## or end)
    const contentLines = lines.slice(startIndex + 1, endIndex);
    const content = contentLines.join('\n').trim();

    // Generate description from first paragraph (first 200 chars)
    const firstParagraph = content.split('\n\n')[0] || content;
    const description = firstParagraph.length > 200
      ? firstParagraph.substring(0, 197) + '...'
      : firstParagraph;

    sections.push({
      name,
      description: description || `Section covering ${name}`,
      markdown: content
    });
  }

  console.log(`[parseMarkdownSections] Parsed ${sections.length} sections successfully`);

  return { title, sections };
}

export async function extractStructuredSections(pdfPath) {
  console.log('[llm_extractor] Starting structured extraction from PDF');

  const provider = await createGeminiVisionProvider();

  const systemPrompt = `You are an expert at analyzing educational PDFs and converting them to clean markdown.

**YOUR TASK:**
Analyze this PDF and convert it to well-structured markdown for educational use.

**OUTPUT FORMAT:**
Return pure markdown (NOT JSON) in this exact structure:

# Document Title

## Section 1 Name

Full content for section 1 with proper markdown formatting...

## Section 2 Name

Full content for section 2 with proper markdown formatting...

**CRITICAL RULES:**
1. Start with the document title as a level-1 heading (#)
2. Use level-2 headings (##) ONLY for section boundaries - each ## marks a new major section
3. Inside sections, use level-3 headings (###) for subsections
4. Extract 3-10 major sections - do NOT combine everything into one section
5. Each section should cover one major topic/concept cluster

**CONTENT TO EXCLUDE:**
- References, bibliographies, acknowledgments
- Page numbers, headers, footers
- Author info, publication details
- Anything not directly educational

**MARKDOWN FORMATTING:**

**Math equations:** Use native LaTeX
- Inline: $x^2 + y^2 = z^2$
- Display: $$E = mc^2$$
- NO special tags needed!

**Tables:** Standard markdown
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |

**Text formatting:**
- Bold: **text**
- Italic: *text*
- Code: \`code\`

**Lists:**
- Numbered: 1. Item
- Bullets: - Item

**Code blocks:**
\`\`\`python
code here
\`\`\`

**Images:**
![Description](ref)

**QUALITY STANDARDS:**
- Be faithful to the original
- Preserve all equations, tables, key information
- Convert everything to clean markdown
- No JSON, no escaping, just pure markdown`;

  const userPrompt = `Convert this educational PDF to markdown format.

**STRUCTURE:**
1. Start with # followed by the document title
2. Create 3-10 sections using ## headings
3. Each ## heading marks a NEW section with its name
4. Put all section content after its ## heading
5. Use ### for subsections within a section

**EXAMPLE OUTPUT:**

# Linear Algebra Fundamentals

## Vector Spaces and Subspaces

A vector space is a set $V$ along with operations...

### Properties of Vector Spaces

Vector spaces must satisfy these axioms...

## Linear Independence

Vectors $v_1, v_2, ..., v_n$ are linearly independent if...

## Matrix Operations

Given matrices $A$ and $B$, we can perform...

**SECTION GUIDELINES:**

Create separate ## sections when:
- Topics are taught in different lectures
- Concepts are independent
- Different major headings exist in the source

Combine into one ## section when:
- Topics build on each other
- Different aspects of same concept
- Closely related material

**FORMATTING:**
- Math: Use $inline$ and $$display$$ LaTeX (NO tags!)
- Tables: Standard markdown format
- Bold/italic: **bold** and *italic*
- Lists: Standard markdown
- Code: \`\`\`language blocks\`\`\`

**EXCLUDE:**
- References, bibliographies
- Page numbers, headers, footers
- Author info
- Non-educational content

Return ONLY the markdown. No JSON, no code blocks, just pure markdown starting with # for the title.`;

  try {
    // Request plain markdown (no JSON schema)
    const markdown = await provider.extractMarkdown(
      pdfPath,
      systemPrompt,
      userPrompt
    );

    console.log('[llm_extractor] ✅ Markdown extraction successful');
    console.log(`[llm_extractor] Markdown length: ${markdown.length} characters`);

    // Post-process markdown to extract title and sections
    const result = parseMarkdownSections(markdown);

    console.log(`[llm_extractor] Title: "${result.title}"`);
    console.log(`[llm_extractor] Sections: ${result.sections.length}`);
    result.sections.forEach((section, index) => {
      console.log(`[llm_extractor]   ${index + 1}. "${section.name}" - ${section.markdown.length} chars`);
    });

    return result;
  } catch (error) {
    console.error('[llm_extractor] ❌ Extraction failed:', error.message);
    throw error;
  }
}

export default extractStructuredSections;
