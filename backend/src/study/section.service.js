import { getLLMProvider } from '../providers/llm/index.js';

/**
 * Section Extraction Service
 *
 * Provides two-phase lesson generation:
 * 1. Extract sections from document (TOC-based or LLM-based)
 * 2. Generate concepts for specific sections on-demand
 */

/**
 * Validates if a heading looks like a genuine section title
 * Filters out table cells, addresses, and other noise
 */
function isValidSectionHeading(text) {
  // Filter out common false positives

  // Too short (likely abbreviations or table cells)
  if (text.length < 8) {
    return false;
  }

  // All caps without spaces (likely acronyms/codes: "VNTY PLT", "GORLFAST")
  if (/^[A-Z]{3,15}$/.test(text)) {
    return false;
  }

  // Looks like an address (contains numbers + street suffixes)
  const streetSuffixes = /\b(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Pl|Place|Way|Court|Ct)\b/i;
  if (/\d+/.test(text) && streetSuffixes.test(text)) {
    return false;
  }

  // Single word all caps (likely table headers: "UNION", "TOTAL")
  if (/^[A-Z]+$/.test(text) && !/\s/.test(text)) {
    return false;
  }

  // Contains multiple consecutive numbers (likely page numbers or IDs: "24 Eastern Avenue")
  if (/^\d+\s+\d+/.test(text)) {
    return false;
  }

  // Looks like a date or page number
  if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/.test(text)) {
    return false;
  }

  // Common table headers or footers
  const tableNoise = /^(Page|Figure|Table|Appendix|Index|References|Bibliography|Glossary)\s+\d+$/i;
  if (tableNoise.test(text)) {
    return false;
  }

  return true;
}

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

  // Patterns for common heading formats (more restrictive now)
  const patterns = [
    /^(Chapter\s+\d+[\.:]\s*.+)$/im,                    // Chapter 1: Title
    /^(\d+\.\d+\s+[A-Z][^\.]+)$/m,                     // 1.1 Title (numbered sections)
    /^(Section\s+\d+[\.:]\s*.+)$/im,                   // Section 1: Title
    /^([A-Z][A-Z\s]{8,50}[A-Z])$/m,                    // ALL CAPS HEADINGS (min 10 chars, must end with letter)
    /^(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){2,6})$/m   // 1 Network Core Fundamentals (at least 3 words)
  ];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length < 8 || trimmed.length > 200) return;

    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        // Apply validation filter
        if (isValidSectionHeading(trimmed)) {
          headings.push({
            text: trimmed,
            line: index,
            // Try to extract page number if nearby (heuristic)
            estimatedPage: Math.floor(index / 50) + 1
          });
        }
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
 * Estimate appropriate number of sections based on document size
 * Small docs (1-10 pages): 2-4 sections
 * Medium docs (11-30 pages): 4-8 sections
 * Large docs (31+ pages): 6-12 sections
 */
function estimateSectionCount(fullText) {
  const estimatedPages = Math.ceil(fullText.length / 2000); // ~2000 chars per page average

  if (estimatedPages <= 10) {
    return { min: 2, max: 4, target: 3 };
  } else if (estimatedPages <= 30) {
    return { min: 4, max: 8, target: 6 };
  } else {
    return { min: 6, max: 12, target: 8 };
  }
}

/**
 * Use LLM to extract sections from document
 * Fallback when TOC parsing fails or for better quality
 */
async function extractSectionsWithLLM(documentInfo, options = {}) {
  const provider = await getLLMProvider();
  const { full_text, title, material_type } = documentInfo;

  const sectionCount = estimateSectionCount(full_text);
  console.log(`[section.service] Document ~${Math.ceil(full_text.length / 2000)} pages, targeting ${sectionCount.target} sections`);

  // For very large documents, sample from beginning, middle, and end
  let textSample;
  if (full_text.length > 100000) {
    const chunkSize = 30000;
    const beginning = full_text.substring(0, chunkSize);
    const middleStart = Math.floor((full_text.length - chunkSize) / 2);
    const middle = full_text.substring(middleStart, middleStart + chunkSize);
    const end = full_text.substring(full_text.length - chunkSize);
    textSample = `${beginning}\n\n[... middle section ...]\n\n${middle}\n\n[... later section ...]\n\n${end}`;
  } else {
    textSample = full_text;
  }

  const systemInstruction = `You are an expert at analyzing educational documents and identifying their main sections.
Your task is to extract major sections or topics from the provided document.

Focus on:
- Major conceptual divisions (not just chapter numbers)
- Topics that could be studied independently
- Logical groupings of related concepts
- Section-level granularity (not too broad, not too narrow)

CRITICAL - IGNORE:
- Table cells, table headers, or data from tables
- Addresses, names, or identification codes
- Page numbers, headers, and footers
- Figure captions and table titles
- Short acronyms or abbreviations without context
- Metadata like dates, IDs, or reference numbers

Return ONLY valid JSON, no markdown code blocks or explanatory text.`;

  const userPrompt = `Extract the major sections from this ${material_type || 'educational'} document titled "${title}".

**Document Text:**
${textSample}

Identify ${sectionCount.min}-${sectionCount.max} major sections that divide this content into logical study units (aim for ${sectionCount.target}).

Return JSON in this exact format:
{
  "sections": [
    {
      "name": "Clear, descriptive section title (at least 10 characters)",
      "description": "1-2 sentence overview of what this section covers",
      "page_range": "estimated page numbers (e.g., '1-5' or 'unknown')"
    }
  ]
}

Requirements:
- ${sectionCount.min}-${sectionCount.max} sections total (aim for ${sectionCount.target})
- Each section should cover a substantial topic
- Section names must be descriptive (not abbreviations or codes)
- Descriptions should explain what concepts are introduced
- If page numbers are visible in the text, extract them
- Focus on the most important, testable content
- IGNORE table cells, addresses, metadata, and other non-content text
- Section names should be at least 10 characters and read like actual topics`;

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

    // Validate section count (allow some flexibility)
    if (parsed.sections.length < 2) {
      throw new Error(`Too few sections generated: ${parsed.sections.length}`);
    }

    if (parsed.sections.length > 20) {
      console.warn(`[section.service] LLM generated ${parsed.sections.length} sections, trimming to 15`);
      parsed.sections = parsed.sections.slice(0, 15);
    }

    // Filter out invalid sections and normalize
    const validSections = [];
    let invalidCount = 0;

    for (const section of parsed.sections) {
      // Validate section name quality
      const name = section.name?.trim();

      if (!name || name.length < 10) {
        console.warn(`[section.service] Skipping section with too short name: "${name}"`);
        invalidCount++;
        continue;
      }

      if (!isValidSectionHeading(name)) {
        console.warn(`[section.service] Skipping invalid section name (looks like table/address): "${name}"`);
        invalidCount++;
        continue;
      }

      // Parse page range if provided
      let pageStart = null;
      let pageEnd = null;
      if (section.page_range && section.page_range !== 'unknown') {
        const match = section.page_range.match(/(\d+)-(\d+)/);
        if (match) {
          pageStart = parseInt(match[1], 10);
          pageEnd = parseInt(match[2], 10);

          // Validate page range (start must be <= end)
          if (pageStart > pageEnd) {
            console.warn(`[section.service] Invalid page range for section "${name}": ${pageStart}-${pageEnd}, swapping`);
            [pageStart, pageEnd] = [pageEnd, pageStart]; // Swap them
          }

          // Sanity check: page numbers should be reasonable
          if (pageStart < 1 || pageEnd > 10000) {
            console.warn(`[section.service] Unreasonable page range for section "${name}": ${pageStart}-${pageEnd}, ignoring`);
            pageStart = pageEnd = null;
          }
        }
      }

      validSections.push({
        section_number: validSections.length + 1,
        name: name,
        description: section.description?.trim() || null,
        page_start: pageStart,
        page_end: pageEnd
      });
    }

    // If we filtered out too many sections, throw error to trigger fallback
    if (validSections.length < 2) {
      throw new Error(`After validation, only ${validSections.length} valid sections remain (filtered ${invalidCount} invalid). LLM may have extracted table data instead of sections.`);
    }

    if (invalidCount > 0) {
      console.log(`[section.service] Filtered out ${invalidCount} invalid sections, kept ${validSections.length} valid sections`);
    }

    return validSections;
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
 * Create fallback sections when all extraction methods fail
 * Divides document into equal parts as a last resort
 */
function createFallbackSections(fullText, title) {
  const estimatedPages = Math.ceil(fullText.length / 2000);
  const sectionCount = Math.min(Math.max(3, Math.ceil(estimatedPages / 10)), 8);
  const charsPerSection = Math.floor(fullText.length / sectionCount);

  console.log(`[section.service] Creating ${sectionCount} fallback sections for ${estimatedPages}-page document`);

  const sections = [];
  for (let i = 0; i < sectionCount; i++) {
    const startPage = Math.floor((i * estimatedPages) / sectionCount) + 1;
    const endPage = Math.floor(((i + 1) * estimatedPages) / sectionCount);

    sections.push({
      section_number: i + 1,
      name: `${title} - Part ${i + 1}`,
      description: `Study material from pages ${startPage} to ${endPage}`,
      page_start: startPage,
      page_end: endPage
    });
  }

  return sections;
}

/**
 * Main section extraction function
 * Uses TOC if available, falls back to LLM, then to equal divisions
 */
export async function extractSections(documentInfo, options = {}) {
  const { full_text, title } = documentInfo;
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
  try {
    console.log('[section.service] Using LLM for section extraction');
    return await extractSectionsWithLLM(documentInfo, options);
  } catch (error) {
    console.error('[section.service] LLM extraction failed:', error.message);

    // Last resort: create fallback sections by dividing document equally
    console.warn('[section.service] Using fallback: dividing document into equal sections');
    return createFallbackSections(full_text, title || 'Document');
  }
}

/**
 * Extract text for a specific section based on page numbers or heuristics
 *
 * @param {string} fullText - The full document text
 * @param {object} sectionInfo - The section metadata (with page_start, page_end, name)
 * @param {array} allSections - All sections for this document (for context)
 * @param {number} totalPages - Total pages in the document (optional, will be estimated if not provided)
 */
export function extractSectionText(fullText, sectionInfo, allSections, totalPages = null) {
  // Estimate total pages if not provided (assuming ~2000 chars per page)
  const estimatedPages = totalPages || Math.ceil(fullText.length / 2000);

  // Strategy 1: Use page numbers if available
  if (sectionInfo.page_start && sectionInfo.page_end && estimatedPages > 0) {
    // Calculate chars per page based on actual document size
    const charsPerPage = Math.floor(fullText.length / estimatedPages);
    const startChar = Math.max(0, (sectionInfo.page_start - 1) * charsPerPage);
    const endChar = Math.min(fullText.length, sectionInfo.page_end * charsPerPage);

    console.log(`[extractSectionText] Using page numbers: pages ${sectionInfo.page_start}-${sectionInfo.page_end}, chars ${startChar}-${endChar}`);
    return fullText.substring(startChar, endChar);
  }

  // Strategy 2: Try to find section by name in text (case-insensitive, partial match)
  const sectionIndex = allSections.findIndex(s => s.section_number === sectionInfo.section_number);
  const currentSection = allSections[sectionIndex];
  const nextSection = allSections[sectionIndex + 1];

  // Try exact match first
  let sectionStart = fullText.indexOf(currentSection.name);

  // If exact match fails, try case-insensitive search
  if (sectionStart === -1) {
    const lowerFullText = fullText.toLowerCase();
    const lowerSectionName = currentSection.name.toLowerCase();
    const foundIndex = lowerFullText.indexOf(lowerSectionName);

    if (foundIndex !== -1) {
      sectionStart = foundIndex;
      console.log(`[extractSectionText] Found section via case-insensitive match: "${currentSection.name}"`);
    }
  }

  // If name-based search fails, use proportional chunking
  if (sectionStart === -1) {
    console.log(`[extractSectionText] Section name "${currentSection.name}" not found in text, using proportional chunking`);
    const chunkSize = Math.floor(fullText.length / allSections.length);
    const start = sectionIndex * chunkSize;
    const end = Math.min(fullText.length, start + chunkSize);
    return fullText.substring(start, end);
  }

  // Extract from section start to next section (or end of document)
  let sectionEnd = fullText.length;
  if (nextSection) {
    // Try to find next section name
    const nextStart = fullText.indexOf(nextSection.name, sectionStart + 1);

    if (nextStart !== -1) {
      sectionEnd = nextStart;
    } else {
      // Try case-insensitive for next section too
      const lowerFullText = fullText.toLowerCase();
      const lowerNextName = nextSection.name.toLowerCase();
      const nextFoundIndex = lowerFullText.indexOf(lowerNextName, sectionStart + 1);

      if (nextFoundIndex !== -1) {
        sectionEnd = nextFoundIndex;
      }
    }
  }

  console.log(`[extractSectionText] Extracted section "${currentSection.name}" from char ${sectionStart} to ${sectionEnd} (${sectionEnd - sectionStart} chars)`);
  return fullText.substring(sectionStart, sectionEnd);
}

export default {
  extractSections,
  extractSectionText
};
