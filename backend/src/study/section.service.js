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

  const systemInstruction = `You are an expert at analyzing educational documents and identifying their main sections based on document structure.

Your task is to extract major sections by looking for STRUCTURAL MARKERS in the text:

**PRIMARY INDICATORS (highest priority):**
1. Markdown headings (# Heading, ## Heading, ### Heading)
2. Bold text that appears to be section titles (**Section Name**)
3. Text with larger font sizes (detected as headings in layout)

**SECONDARY INDICATORS:**
4. Numbered sections (1. Section Name, 1.1 Subsection)
5. Clear topic transitions with new conceptual themes
6. Whitespace patterns suggesting new sections

**EXTRACTION PRINCIPLES:**
- Prefer 4-8 sections for most documents (not too many, not too few)
- Each section should be a substantial topic
- Section names MUST match the text EXACTLY as they appear
- If you see "## Introduction", use "Introduction" as the name
- If you see "**Core Concepts**", use "Core Concepts" as the name
- CRITICAL: Use the EXACT wording from headings/bold text in the document

**IGNORE:**
- Table cells, table headers, or data from tables
- Addresses, names, or identification codes
- Figure captions and table titles
- Short acronyms or abbreviations without context
- Metadata like dates, IDs, or reference numbers

Return ONLY valid JSON, no markdown code blocks or explanatory text.`;

  const userPrompt = `Extract the major sections from this ${material_type || 'educational'} document titled "${title}".

**Document Text:**
${textSample}

**INSTRUCTIONS:**
1. Look for structural markers (headings, bold text, numbered sections)
2. Extract section names EXACTLY as they appear in the text
3. Identify ${sectionCount.min}-${sectionCount.max} major sections (aim for ${sectionCount.target})
4. Each section should be a substantial, independent topic

Return JSON in this exact format:
{
  "sections": [
    {
      "name": "EXACT section title from document (copy it word-for-word)",
      "description": "1-2 sentence overview of what this section covers"
    }
  ]
}

**CRITICAL REQUIREMENTS:**
- Section names MUST match EXACTLY as they appear (don't paraphrase!)
- If you see "## Introduction", use "Introduction"
- If you see "**Learning Objectives**", use "Learning Objectives"
- Aim for ${sectionCount.target} sections (not too many, not too few)
- Each section should cover a substantial topic
- Descriptions should explain what concepts are introduced
- Focus on the most important, testable content
- IGNORE table cells, addresses, metadata, and other non-content text`;

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

      // No page ranges - we split by section headers in markdown
      validSections.push({
        section_number: validSections.length + 1,
        name: name,
        description: section.description?.trim() || null,
        page_start: null,
        page_end: null
      });
    }

    // If we filtered out too many sections, throw error to trigger fallback
    if (validSections.length < 2) {
      throw new Error(`After validation, only ${validSections.length} valid sections remain (filtered ${invalidCount} invalid). LLM may have extracted table data instead of sections.`);
    }

    if (invalidCount > 0) {
      console.log(`[section.service] Filtered out ${invalidCount} invalid sections, kept ${validSections.length} valid sections`);
    }

    // No page-based computation needed - sections will be split by markdown structure
    console.log(`[section.service] Extracted ${validSections.length} sections (split will be based on markdown headers)`);
    validSections.forEach(section => {
      console.log(`[section.service] Section ${section.section_number}: "${section.name}"`);
    });

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
 * Find smart boundary near a position (respects paragraph/sentence boundaries)
 * Searches for the nearest paragraph or sentence break
 */
function findSmartBoundary(text, approximatePos, direction = 'forward') {
  if (approximatePos < 0 || approximatePos >= text.length) {
    return direction === 'forward' ? text.length : 0;
  }

  const searchRadius = 500; // Look 500 chars in each direction
  const searchStart = Math.max(0, approximatePos - searchRadius);
  const searchEnd = Math.min(text.length, approximatePos + searchRadius);
  const searchRegion = text.substring(searchStart, searchEnd);

  // Priority 1: Double newline (paragraph break)
  const paragraphBreaks = [];
  const paragraphRegex = /\n\n+/g;
  let match;
  while ((match = paragraphRegex.exec(searchRegion)) !== null) {
    paragraphBreaks.push(searchStart + match.index);
  }

  if (paragraphBreaks.length > 0) {
    // Find closest paragraph break to approximatePos
    const closest = paragraphBreaks.reduce((prev, curr) =>
      Math.abs(curr - approximatePos) < Math.abs(prev - approximatePos) ? curr : prev
    );
    return closest;
  }

  // Priority 2: Sentence end (. ! ? followed by space or newline)
  const sentenceBreaks = [];
  const sentenceRegex = /[.!?][\s\n]/g;
  while ((match = sentenceRegex.exec(searchRegion)) !== null) {
    sentenceBreaks.push(searchStart + match.index + 1); // After the punctuation
  }

  if (sentenceBreaks.length > 0) {
    const closest = sentenceBreaks.reduce((prev, curr) =>
      Math.abs(curr - approximatePos) < Math.abs(prev - approximatePos) ? curr : prev
    );
    return closest;
  }

  // Priority 3: Single newline
  const newlineBreaks = [];
  const newlineRegex = /\n/g;
  while ((match = newlineRegex.exec(searchRegion)) !== null) {
    newlineBreaks.push(searchStart + match.index);
  }

  if (newlineBreaks.length > 0) {
    const closest = newlineBreaks.reduce((prev, curr) =>
      Math.abs(curr - approximatePos) < Math.abs(prev - approximatePos) ? curr : prev
    );
    return closest;
  }

  // Fallback: Use the approximate position
  return approximatePos;
}

/**
 * Split markdown text by section boundaries
 * Finds each section's content and assigns it to markdown_text field
 */
function splitMarkdownBySections(fullText, sections) {
  console.log(`[section.service] Splitting markdown into ${sections.length} section chunks`);

  const sectionsWithMarkdown = [];

  for (let i = 0; i < sections.length; i++) {
    const currentSection = sections[i];
    const nextSection = i < sections.length - 1 ? sections[i + 1] : null;

    // Strategy 1: Try to find section by name in the text (as heading)
    let sectionStart = -1;
    let sectionEnd = fullText.length;

    // Look for section name as a markdown heading (case-insensitive)
    const namePattern = new RegExp(`^#{1,3}\\s*${escapeRegex(currentSection.name)}`, 'mi');
    const nameMatch = fullText.match(namePattern);

    if (nameMatch) {
      sectionStart = nameMatch.index;
      console.log(`[section.service] Found section "${currentSection.name}" as heading at position ${sectionStart}`);
    } else {
      // Strategy 2: Look for bold text matching section name (**Section Name**)
      const boldPattern = new RegExp(`\\*\\*${escapeRegex(currentSection.name)}\\*\\*`, 'i');
      const boldMatch = fullText.match(boldPattern);

      if (boldMatch) {
        sectionStart = boldMatch.index;
        console.log(`[section.service] Found section "${currentSection.name}" as bold text at position ${sectionStart}`);
      } else {
        // Strategy 3: Search for section name anywhere in expected region
        const simpleName = currentSection.name.toLowerCase();
        const searchStart = Math.floor((i / sections.length) * fullText.length);
        const searchEnd = Math.floor(((i + 1) / sections.length) * fullText.length);
        const searchRegion = fullText.substring(searchStart, searchEnd);
        const simpleMatch = searchRegion.toLowerCase().indexOf(simpleName);

        if (simpleMatch !== -1) {
          sectionStart = searchStart + simpleMatch;
          console.log(`[section.service] Found section "${currentSection.name}" in expected region at position ${sectionStart}`);
        } else {
          // Last resort: Use proportional division with smart boundary
          const approximateStart = Math.floor((i / sections.length) * fullText.length);
          sectionStart = findSmartBoundary(fullText, approximateStart, 'forward');
          console.warn(`[section.service] Could not find section "${currentSection.name}", using smart boundary at ${sectionStart}`);
        }
      }
    }

    // Find where this section ends (where next section begins)
    if (nextSection) {
      // Try to find next section as heading
      const nextNamePattern = new RegExp(`^#{1,3}\\s*${escapeRegex(nextSection.name)}`, 'mi');
      const nextMatch = fullText.substring(sectionStart + 1).match(nextNamePattern);

      if (nextMatch) {
        sectionEnd = sectionStart + 1 + nextMatch.index;
        console.log(`[section.service] Next section "${nextSection.name}" found as heading at ${sectionEnd}`);
      } else {
        // Try bold text
        const nextBoldPattern = new RegExp(`\\*\\*${escapeRegex(nextSection.name)}\\*\\*`, 'i');
        const nextBoldMatch = fullText.substring(sectionStart + 1).match(nextBoldPattern);

        if (nextBoldMatch) {
          sectionEnd = sectionStart + 1 + nextBoldMatch.index;
          console.log(`[section.service] Next section "${nextSection.name}" found as bold at ${sectionEnd}`);
        } else {
          // Fallback: Use proportional division with smart boundary
          const approximateEnd = Math.floor(((i + 1) / sections.length) * fullText.length);
          sectionEnd = findSmartBoundary(fullText, approximateEnd, 'backward');
          console.warn(`[section.service] Could not find next section "${nextSection.name}", using smart boundary at ${sectionEnd}`);
        }
      }
    }

    // Extract markdown chunk for this section
    const markdown_text = fullText.substring(sectionStart, sectionEnd).trim();

    console.log(`[section.service] Section "${currentSection.name}": ${markdown_text.length} chars (${((markdown_text.length / fullText.length) * 100).toFixed(1)}% of document)`);

    sectionsWithMarkdown.push({
      ...currentSection,
      markdown_text
    });
  }

  return sectionsWithMarkdown;
}

/**
 * Helper to escape regex special characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      // Split markdown by section boundaries
      return splitMarkdownBySections(full_text, tocSections);
    }
  }

  // Fall back to LLM extraction
  try {
    console.log('[section.service] Using LLM for section extraction');
    const sections = await extractSectionsWithLLM(documentInfo, options);
    // Split markdown by section boundaries
    return splitMarkdownBySections(full_text, sections);
  } catch (error) {
    console.error('[section.service] LLM extraction failed:', error.message);

    // Last resort: create fallback sections by dividing document equally
    console.warn('[section.service] Using fallback: dividing document into equal sections');
    const sections = createFallbackSections(full_text, title || 'Document');
    // Split markdown by section boundaries
    return splitMarkdownBySections(full_text, sections);
  }
}

/**
 * Calculate extraction quality score (0.0 to 1.0)
 * Higher score = more confident the extracted text is correct
 *
 * @param {string} extractedText - The text that was extracted for the section
 * @param {object} sectionInfo - The section metadata
 * @param {array} allSections - All sections for context
 * @param {string} fullText - The full document text
 * @returns {number} Quality score between 0.0 and 1.0
 */
function calculateExtractionQuality(extractedText, sectionInfo, allSections, fullText) {
  let score = 0.0;

  // Check 1: Text contains section name (30 points)
  if (extractedText.toLowerCase().includes(sectionInfo.name.toLowerCase())) {
    score += 0.3;
  }

  // Check 2: Text length is reasonable - not too small or entire document (30 points)
  const textLengthRatio = extractedText.length / fullText.length;
  if (textLengthRatio > 0.05 && textLengthRatio < 0.5) {
    score += 0.3;
  } else if (textLengthRatio >= 0.5) {
    // Likely extracted too much (maybe entire document)
    score -= 0.2;
  }

  // Check 3: Text doesn't contain too many other section names (40 points)
  const otherSectionNames = allSections
    .filter(s => s.section_number !== sectionInfo.section_number)
    .map(s => s.name.toLowerCase());

  const containedSectionCount = otherSectionNames.filter(name =>
    extractedText.toLowerCase().includes(name)
  ).length;

  if (containedSectionCount === 0) {
    score += 0.4; // Perfect - no other sections
  } else if (containedSectionCount <= 1) {
    score += 0.2; // Acceptable - might have transition text
  } else {
    score -= 0.2; // Bad - likely extracted wrong text
  }

  return Math.max(0.0, Math.min(1.0, score)); // Clamp to [0, 1]
}

/**
 * Extract text for a specific section based on page numbers or heuristics
 *
 * ENHANCED MODE: When PDF_EXTRACTION_MODE=enhanced, this function can use
 * native page range extraction from the enhanced extractor (more accurate).
 * This is handled at the lesson generation level by passing a file path.
 *
 * @param {string} fullText - The full document text
 * @param {object} sectionInfo - The section metadata (with page_start, page_end, name)
 * @param {array} allSections - All sections for this document (for context)
 * @param {number} totalPages - Total pages in the document (optional, will be estimated if not provided)
 * @returns {object} {text: string, quality: number, strategy: string}
 */
export function extractSectionText(fullText, sectionInfo, allSections, totalPages = null) {
  // Estimate total pages if not provided (assuming ~2000 chars per page)
  const estimatedPages = totalPages || Math.ceil(fullText.length / 2000);

  let extractedText = '';
  let strategy = '';

  // Strategy 1: Use page markers to extract exact pages (BEST - no calculation!)
  if (sectionInfo.page_start && sectionInfo.page_end) {
    // Look for "## Page N" markers and extract only pages in the range
    const pageRegex = /^## Page (\d+)$/gm;
    const pagePositions = [];
    let match;

    while ((match = pageRegex.exec(fullText)) !== null) {
      const pageNum = parseInt(match[1], 10);
      const position = match.index;
      pagePositions.push({ pageNum, position });
    }

    if (pagePositions.length > 0) {
      // Find start and end positions for the section's page range
      const startPage = pagePositions.find(p => p.pageNum === sectionInfo.page_start);
      const endPageIndex = pagePositions.findIndex(p => p.pageNum === sectionInfo.page_end);
      const nextPageAfterEnd = endPageIndex >= 0 ? pagePositions[endPageIndex + 1] : null;

      if (startPage) {
        const startChar = startPage.position;
        const endChar = nextPageAfterEnd ? nextPageAfterEnd.position : fullText.length;

        extractedText = fullText.substring(startChar, endChar);
        strategy = 'page_markers';

        console.log(`[extractSectionText] Strategy: page_markers (exact)`);
        console.log(`[extractSectionText] Extracted pages ${sectionInfo.page_start}-${sectionInfo.page_end} using "## Page N" markers`);
        console.log(`[extractSectionText] Chars ${startChar}-${endChar} (${extractedText.length} chars)`);
      } else {
        console.warn(`[extractSectionText] Could not find "## Page ${sectionInfo.page_start}" marker, falling back to calculation`);
      }
    }

    // Fallback: Calculate based on page numbers if no markers found
    if (!extractedText && estimatedPages > 0) {
      const charsPerPage = Math.floor(fullText.length / estimatedPages);
      const startChar = Math.max(0, (sectionInfo.page_start - 1) * charsPerPage);
      const endChar = Math.min(fullText.length, sectionInfo.page_end * charsPerPage);

      extractedText = fullText.substring(startChar, endChar);
      strategy = 'page_range_calc';

      console.log(`[extractSectionText] Strategy: page_range_calc (estimated)`);
      console.log(`[extractSectionText] Pages ${sectionInfo.page_start}-${sectionInfo.page_end} → chars ${startChar}-${endChar}`);
    }
  }

  // Strategy 2: Try to find section by name in text (case-insensitive, partial match)
  if (!extractedText) {
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
        console.log(`[extractSectionText] Strategy: name_search (case-insensitive)`);
      }
    } else {
      console.log(`[extractSectionText] Strategy: name_search (exact match)`);
    }

    // If name-based search succeeds, extract from section start to next section
    if (sectionStart !== -1) {
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

      extractedText = fullText.substring(sectionStart, sectionEnd);
      strategy = 'name_search';
      console.log(`[extractSectionText] Found section from char ${sectionStart} to ${sectionEnd} (${extractedText.length} chars)`);
    }
  }

  // Strategy 3: Proportional chunking (fallback)
  if (!extractedText) {
    console.log(`[extractSectionText] Strategy: proportional_chunking (fallback)`);
    const sectionIndex = allSections.findIndex(s => s.section_number === sectionInfo.section_number);
    const chunkSize = Math.floor(fullText.length / allSections.length);
    const start = sectionIndex * chunkSize;
    const end = Math.min(fullText.length, start + chunkSize);

    extractedText = fullText.substring(start, end);
    strategy = 'proportional_chunking';
    console.log(`[extractSectionText] Using proportional chunk: chars ${start}-${end} (${extractedText.length} chars)`);
  }

  // Calculate extraction quality
  const quality = calculateExtractionQuality(extractedText, sectionInfo, allSections, fullText);
  const qualityPercent = (quality * 100).toFixed(0);

  console.log(`[extractSectionText] ═══════════════════════════════════════════════`);
  console.log(`[extractSectionText] Extraction Quality: ${qualityPercent}% ${quality >= 0.7 ? '✅' : quality >= 0.4 ? '⚠️' : '❌'}`);
  console.log(`[extractSectionText] Strategy: ${strategy}`);
  console.log(`[extractSectionText] Section: "${sectionInfo.name}"`);
  console.log(`[extractSectionText] Extracted: ${extractedText.length} chars (${(extractedText.length / fullText.length * 100).toFixed(1)}% of document)`);

  if (quality < 0.5) {
    console.warn(`[extractSectionText] ⚠️  LOW QUALITY - Concepts may be document-scoped!`);
    console.warn(`[extractSectionText] ⚠️  Consider using enhanced extraction mode or regenerating sections`);
  }

  console.log(`[extractSectionText] ═══════════════════════════════════════════════`);

  return extractedText;
}

export default {
  extractSections,
  extractSectionText
};
