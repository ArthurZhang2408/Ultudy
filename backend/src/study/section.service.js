import { getLLMProvider } from '../providers/llm/index.js';

/**
 * Section Extraction Service
 *
 * Provides two-phase lesson generation:
 * 1. Extract sections from document (TOC-based or LLM-based)
 * 2. Generate concepts for specific sections on-demand
 */

/**
 * Extract headings that might indicate sections
 * Looks for patterns like:
 * - "1.1 Introduction"
 * - "Chapter 3: Networks"
 * - "Section 2.1: Packet Switching"
 */
function extractHeadingsFromText(fullText) {
  const headings = [];
  const lines = fullText.split('\n');

  // Patterns for common heading formats
  const patterns = [
    /^(Chapter\s+\d+[\.:]\s*.+)$/im,                    // Chapter 1: Title
    /^(\d+\.\d+\s+[A-Z][^\.]+)$/m,                     // 1.1 Title
    /^(Section\s+\d+[\.:]\s*.+)$/im,                   // Section 1: Title
    /^([A-Z][A-Z\s]{3,50})$/m,                         // ALL CAPS HEADINGS
    /^(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,6})$/m   // 1 Network Fundamentals
  ];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length < 5 || trimmed.length > 200) return;

    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        headings.push({
          text: trimmed,
          line: index,
          // Try to extract page number if nearby (heuristic)
          estimatedPage: Math.floor(index / 50) + 1
        });
        break;
      }
    }
  });

  return headings;
}

/**
 * Attempt to parse table of contents from document
 * Returns structured sections if TOC is found, null otherwise
 */
function parseTableOfContents(fullText) {
  const headings = extractHeadingsFromText(fullText);

  // If we found potential headings, return them
  if (headings.length >= 3 && headings.length <= 30) {
    return headings.map((heading, index) => ({
      section_number: index + 1,
      name: heading.text,
      page_start: heading.estimatedPage,
      page_end: headings[index + 1]?.estimatedPage - 1 || null
    }));
  }

  return null;
}

/**
 * Use LLM to extract sections from document
 * Fallback when TOC parsing fails or for better quality
 */
async function extractSectionsWithLLM(documentInfo, options = {}) {
  const provider = await getLLMProvider();
  const { full_text, title, material_type } = documentInfo;

  // For very large documents, use a sample for section extraction
  const textSample = full_text.length > 50000
    ? full_text.substring(0, 50000) + '\n\n[... document continues ...]'
    : full_text;

  const systemInstruction = `You are an expert at analyzing educational documents and identifying their main sections.
Your task is to extract 6-10 major sections or topics from the provided document.

Focus on:
- Major conceptual divisions (not just chapter numbers)
- Topics that could be studied independently
- Logical groupings of related concepts
- Section-level granularity (not too broad, not too narrow)

Return ONLY valid JSON, no markdown code blocks or explanatory text.`;

  const userPrompt = `Extract the major sections from this ${material_type || 'educational'} document titled "${title}".

**Document Text:**
${textSample}

Identify 6-10 major sections that divide this content into logical study units.

Return JSON in this exact format:
{
  "sections": [
    {
      "name": "Clear, descriptive section title",
      "description": "1-2 sentence overview of what this section covers",
      "page_range": "estimated page numbers (e.g., '1-5' or 'unknown')"
    }
  ]
}

Requirements:
- 6-10 sections total (aim for ~8)
- Each section should cover a substantial topic
- Descriptions should explain what concepts are introduced
- If page numbers are visible in the text, extract them
- Focus on the most important, testable content`;

  try {
    const response = await provider.generateRawCompletion({
      systemInstruction,
      userPrompt,
      temperature: 0.3 // Lower temperature for more structured output
    });

    // Parse the response
    const parsed = parseJsonOutput(response);

    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      throw new Error('LLM response missing sections array');
    }

    // Validate section count
    if (parsed.sections.length < 3) {
      throw new Error(`Too few sections generated: ${parsed.sections.length}`);
    }

    if (parsed.sections.length > 15) {
      console.warn(`[section.service] LLM generated ${parsed.sections.length} sections, trimming to 10`);
      parsed.sections = parsed.sections.slice(0, 10);
    }

    // Normalize section data
    return parsed.sections.map((section, index) => {
      // Parse page range if provided
      let pageStart = null;
      let pageEnd = null;
      if (section.page_range && section.page_range !== 'unknown') {
        const match = section.page_range.match(/(\d+)-(\d+)/);
        if (match) {
          pageStart = parseInt(match[1], 10);
          pageEnd = parseInt(match[2], 10);
        }
      }

      return {
        section_number: index + 1,
        name: section.name,
        description: section.description || null,
        page_start: pageStart,
        page_end: pageEnd
      };
    });
  } catch (error) {
    console.error('[section.service] LLM section extraction failed:', error.message);
    throw new Error(`Failed to extract sections: ${error.message}`);
  }
}

/**
 * Parse JSON output from LLM (handles markdown code blocks)
 */
function parseJsonOutput(rawText) {
  if (!rawText) {
    throw new Error('Empty LLM response');
  }

  let jsonText = rawText.trim();

  // Try to extract JSON from markdown code blocks
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  // Try to find JSON object boundaries if there's surrounding text
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('[section.service] Failed to parse JSON. Raw response (first 500 chars):',
                  rawText.substring(0, 500));
    throw new Error('Invalid JSON response from LLM');
  }
}

/**
 * Main section extraction function
 * Uses TOC if available, falls back to LLM
 */
export async function extractSections(documentInfo, options = {}) {
  const { full_text } = documentInfo;
  const { forceLLM = false } = options;

  if (!full_text || full_text.length === 0) {
    throw new Error('Document has no text content');
  }

  // Try TOC parsing first (unless forced to use LLM)
  if (!forceLLM) {
    const tocSections = parseTableOfContents(full_text);
    if (tocSections && tocSections.length >= 6 && tocSections.length <= 15) {
      console.log(`[section.service] Extracted ${tocSections.length} sections from TOC`);
      return tocSections;
    }
  }

  // Fall back to LLM extraction
  console.log('[section.service] Using LLM for section extraction');
  return extractSectionsWithLLM(documentInfo, options);
}

/**
 * Extract text for a specific section based on page numbers or heuristics
 */
export function extractSectionText(fullText, sectionInfo, allSections) {
  // If we have page numbers, try to extract based on that
  // This is a simplified implementation - in production you might want
  // to use the page-by-page data from the PDF extractor

  if (sectionInfo.page_start && sectionInfo.page_end) {
    // Estimate text boundaries based on page numbers
    // Assuming ~2000 chars per page (rough average)
    const charsPerPage = Math.floor(fullText.length / 60); // Assume 60 pages average
    const startChar = (sectionInfo.page_start - 1) * charsPerPage;
    const endChar = sectionInfo.page_end * charsPerPage;

    return fullText.substring(startChar, endChar);
  }

  // Fallback: try to find section by name in text
  const sectionIndex = allSections.findIndex(s => s.section_number === sectionInfo.section_number);
  const currentSection = allSections[sectionIndex];
  const nextSection = allSections[sectionIndex + 1];

  // Find section heading in text
  const sectionStart = fullText.indexOf(currentSection.name);
  if (sectionStart === -1) {
    // Can't find section, return a chunk from the start
    const chunkSize = Math.floor(fullText.length / allSections.length);
    const start = sectionIndex * chunkSize;
    return fullText.substring(start, start + chunkSize);
  }

  // Extract from section start to next section (or end of document)
  let sectionEnd = fullText.length;
  if (nextSection) {
    const nextStart = fullText.indexOf(nextSection.name, sectionStart + 1);
    if (nextStart !== -1) {
      sectionEnd = nextStart;
    }
  }

  return fullText.substring(sectionStart, sectionEnd);
}

export default {
  extractSections,
  extractSectionText
};
