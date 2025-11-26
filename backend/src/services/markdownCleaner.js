/**
 * Markdown Cleaner Service
 *
 * Post-processes extracted markdown to remove unwanted metadata
 * that the LLM may have included despite prompt instructions
 */

/**
 * Remove course metadata from the beginning of markdown content
 * Common patterns:
 * - Course codes: ECE356, CS135, MATH239
 * - Instructor names: Jeff Zarnett, John Smith
 * - Terms: Fall 2025, Winter 2024, Spring 2023
 * - Lecture info: Lecture 1, Lecture 2 —
 * - Dates: 2023-09-12, September 12, 2023
 *
 * @param {string} markdown - Raw markdown content
 * @returns {string} - Cleaned markdown content
 */
export function removeCourseMetadata(markdown) {
  if (!markdown) return markdown;

  const lines = markdown.split('\n');
  const cleanedLines = [];
  let skippingMetadata = true;
  let emptyLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Stop skipping once we hit actual content
    if (skippingMetadata) {
      // Empty lines at the start
      if (line === '') {
        emptyLineCount++;
        // Allow up to 2 empty lines, then start keeping content
        if (emptyLineCount > 2) {
          skippingMetadata = false;
        }
        continue;
      }

      // Course code pattern (e.g., ECE356, CS 135, MATH239)
      if (/^[A-Z]{2,4}\s*\d{3,4}:?/.test(line)) {
        continue;
      }

      // Instructor name pattern (common first + last names)
      if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(line)) {
        continue;
      }

      // Term pattern (e.g., Fall 2025, Winter 2024, Spring 2023)
      if (/^(Fall|Winter|Spring|Summer)\s+\d{4}$/.test(line)) {
        continue;
      }

      // Lecture number pattern (e.g., Lecture 1, Lecture 2 —, Lecture 2 - Title)
      if (/^Lecture\s+\d+(\s*[—\-])?/.test(line)) {
        continue;
      }

      // Date pattern (e.g., 2023-09-12, September 12, 2023)
      if (/^\d{4}-\d{2}-\d{2}$/.test(line) || /^[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}$/.test(line)) {
        continue;
      }

      // Combined course + title pattern (e.g., "ECE356: Database Systems")
      if (/^[A-Z]{2,4}\s*\d{3,4}:\s*.+/.test(line)) {
        continue;
      }

      // If we reach a markdown heading (## or ###), we're definitely past metadata
      if (line.startsWith('##')) {
        skippingMetadata = false;
      }

      // If we reach substantive text (longer than 30 chars, not matching patterns above)
      if (line.length > 30 && !line.match(/^[A-Z][a-z]+\s+[A-Z][a-z]+/) && !line.match(/^\d{4}/)) {
        skippingMetadata = false;
      }
    }

    // Once we're past metadata, keep everything
    if (!skippingMetadata) {
      cleanedLines.push(lines[i]);
    }
  }

  return cleanedLines.join('\n').trim();
}

/**
 * Remove references section from end of markdown
 *
 * @param {string} markdown - Markdown content
 * @returns {string} - Markdown without references
 */
export function removeReferences(markdown) {
  if (!markdown) return markdown;

  // Find "References", "Bibliography", "Works Cited" section
  const referencesRegex = /^#{2,3}\s*(References|Bibliography|Works Cited|Citations)\s*$/mi;
  const match = markdown.match(referencesRegex);

  if (match && match.index !== undefined) {
    // Cut off everything from the references heading onward
    return markdown.substring(0, match.index).trim();
  }

  return markdown;
}

/**
 * Clean extracted markdown by removing metadata and references
 *
 * @param {string} markdown - Raw extracted markdown
 * @returns {string} - Cleaned markdown
 */
export function cleanExtractedMarkdown(markdown) {
  if (!markdown) return markdown;

  let cleaned = markdown;

  // Remove course metadata from beginning
  cleaned = removeCourseMetadata(cleaned);

  // Remove references section from end
  cleaned = removeReferences(cleaned);

  // Remove excessive blank lines (more than 2 in a row)
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

  return cleaned.trim();
}
