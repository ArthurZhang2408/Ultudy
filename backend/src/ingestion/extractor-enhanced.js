/**
 * Enhanced PDF Extractor with Markdown Support
 *
 * This extractor uses the deterministic extraction pipeline which:
 * - Extracts rich content (tables, formulas, code blocks, images)
 * - Converts to structured Markdown format
 * - Preserves native page boundaries (no calculation needed)
 * - Supports direct page range extraction
 *
 * To enable this extractor, set environment variable:
 *   PDF_EXTRACTION_MODE=enhanced
 *
 * Default mode uses the simpler pdf-parse extractor.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DETERMINISTIC_SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'extract_text_deterministic.py');

/**
 * Parse JSON output from Python extractor
 */
function parseExtractorOutput(output) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`Failed to parse extractor output: ${error.message}`);
  }
}

/**
 * Extract text using deterministic pipeline with rich content support
 *
 * Returns structured data with:
 * - pages: Array of {page: number, text: string, markdown: string}
 * - tables: Array of table objects with page ranges
 * - formulas: Array of LaTeX formulas with bbox
 * - code_blocks: Array of code blocks with language detection
 * - images: Array of image references with bbox
 *
 * @param {string} filePath - Path to PDF file
 * @param {object} options - Extraction options
 * @param {string} options.pythonCommand - Python command (default: 'python3')
 * @param {string} options.format - Output format: 'json' or 'markdown' (default: 'json')
 * @returns {Promise<Array>} Array of page objects with text
 */
export async function extractTextWithDeterministic(filePath, options = {}) {
  const pythonCommand = options.pythonCommand || 'python3';
  const format = options.format || 'json';

  const args = [DETERMINISTIC_SCRIPT, filePath];
  if (format === 'markdown') {
    args.push('--format', 'markdown');
  }

  console.log(`[extractor-enhanced] Using deterministic extraction: ${filePath}`);

  const child = spawn(pythonCommand, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (exitCode !== 0) {
    console.error(`[extractor-enhanced] Python extraction failed:`, stderr);
    throw new Error(`Deterministic extractor failed (${exitCode}): ${stderr}`);
  }

  // If format is markdown, stdout is the markdown text
  if (format === 'markdown') {
    console.log(`[extractor-enhanced] Extracted as markdown (${stdout.length} chars)`);

    // Parse markdown into pages (split by ## Page N markers)
    const pages = parseMarkdownIntoPages(stdout);
    return pages;
  }

  // Otherwise, parse JSON output
  const result = parseExtractorOutput(stdout);

  if (!result.pages || !Array.isArray(result.pages)) {
    throw new Error('Extractor output missing pages array');
  }

  console.log(`[extractor-enhanced] Extracted ${result.pages.length} pages with rich content:`, {
    tables: result.tables?.length || 0,
    formulas: result.formulas?.length || 0,
    code_blocks: result.code_blocks?.length || 0,
    images: result.images?.length || 0
  });

  // Return pages in expected format, enriched with full extraction result
  const pages = result.pages.map(page => ({
    page: page.page,
    text: page.text,
    // Store full extraction result for later use (e.g., by markdown converter)
    _fullResult: result
  }));

  return pages;
}

/**
 * Parse markdown output into page objects
 * Splits by ## Page N markers and extracts text
 */
function parseMarkdownIntoPages(markdown) {
  const pages = [];
  const pagePattern = /^## Page (\d+)$/gm;

  let match;
  let lastIndex = 0;
  let currentPageNum = null;

  while ((match = pagePattern.exec(markdown)) !== null) {
    // Save previous page if exists
    if (currentPageNum !== null) {
      const pageText = markdown.substring(lastIndex, match.index).trim();
      pages.push({
        page: currentPageNum,
        text: pageText,
        markdown: pageText // Same as text for markdown format
      });
    }

    currentPageNum = parseInt(match[1], 10);
    lastIndex = match.index + match[0].length;
  }

  // Save last page
  if (currentPageNum !== null) {
    const pageText = markdown.substring(lastIndex).trim();
    pages.push({
      page: currentPageNum,
      text: pageText,
      markdown: pageText
    });
  }

  return pages;
}

/**
 * Extract text for a specific page range (native support)
 *
 * This is more efficient than extracting all pages then filtering,
 * as it only processes the requested pages.
 *
 * @param {string} filePath - Path to PDF file
 * @param {number} startPage - Starting page number (1-indexed)
 * @param {number} endPage - Ending page number (inclusive)
 * @param {object} options - Extraction options
 * @returns {Promise<string>} Text from specified page range
 */
export async function extractPageRange(filePath, startPage, endPage, options = {}) {
  console.log(`[extractor-enhanced] Extracting pages ${startPage}-${endPage} from ${filePath}`);

  // Extract all pages (with rich content)
  const pages = await extractTextWithDeterministic(filePath, options);

  // Filter to requested page range
  const rangePages = pages.filter(p => p.page >= startPage && p.page <= endPage);

  // Combine text from pages in range
  const text = rangePages.map(p => p.text).join('\n\n');

  console.log(`[extractor-enhanced] Extracted ${rangePages.length} pages, ${text.length} chars`);

  return text;
}

/**
 * Get full extraction result with rich content
 * Returns complete structured data including tables, formulas, etc.
 *
 * @param {string} filePath - Path to PDF file
 * @param {object} options - Extraction options
 * @returns {Promise<object>} Full extraction result with pages, tables, formulas, etc.
 */
export async function extractFullContent(filePath, options = {}) {
  const pythonCommand = options.pythonCommand || 'python3';

  const child = spawn(pythonCommand, [DETERMINISTIC_SCRIPT, filePath, '--format', 'json'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`Deterministic extractor failed (${exitCode}): ${stderr}`);
  }

  return parseExtractorOutput(stdout);
}

export default {
  extractTextWithDeterministic,
  extractPageRange,
  extractFullContent
};
