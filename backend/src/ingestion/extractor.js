import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pdfParse from 'pdf-parse';
import { extractTextWithDeterministic, extractPageRange } from './extractor-enhanced.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'extract_text.py');

function parsePythonOutput(output) {
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed.pages)) {
      return parsed.pages.map((page) => ({
        page: page.page,
        text: page.text || ''
      }));
    }
  } catch (error) {
    throw new Error(`Failed to parse extractor output: ${error.message}`);
  }

  throw new Error('Extractor output missing pages array');
}

export async function extractTextWithPython(filePath, options = {}) {
  const pythonCommand = options.pythonCommand || 'python3';
  const child = spawn(pythonCommand, [SCRIPT_PATH, filePath], {
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
    throw new Error(`Python extractor failed (${exitCode}): ${stderr}`);
  }

  return parsePythonOutput(stdout);
}

function splitTextIntoPages(text, pageCount) {
  if (!text) {
    return [];
  }

  const segments = text.split(/\f|\n{2,}/).map((segment) => segment.trim()).filter(Boolean);
  const result = [];

  for (let i = 0; i < pageCount; i += 1) {
    result.push({
      page: i + 1,
      text: segments[i] || ''
    });
  }

  return result;
}

export async function extractTextWithPdfParse(filePath) {
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  const pageCount = data.numpages || (data.metadata && data.metadata.has('pageCount') && Number(data.metadata.get('pageCount')));
  const pages = splitTextIntoPages(data.text || '', pageCount || 1);
  return pages.map((page, index) => ({ page: page.page ?? index + 1, text: page.text }));
}

/**
 * Extract text from PDF with automatic mode selection
 *
 * Supported extraction modes (via PDF_EXTRACTION_MODE env var):
 * - 'enhanced': Uses deterministic extraction with markdown support (tables, formulas, code)
 * - 'standard': Uses pdf-parse (simple, fast, no dependencies)
 * - 'auto' (default): Tries Python extractor, falls back to pdf-parse
 *
 * @param {string} filePath - Path to PDF file
 * @param {object} options - Extraction options
 * @returns {Promise<Array>} Array of page objects
 */
export async function extractTextFromPdf(filePath, options = {}) {
  const mode = process.env.PDF_EXTRACTION_MODE || 'auto';

  console.log(`[extractor] Using PDF extraction mode: ${mode}`);

  // Enhanced mode: Use deterministic extraction with rich content support
  if (mode === 'enhanced') {
    try {
      return await extractTextWithDeterministic(filePath, options);
    } catch (error) {
      console.error('[extractor] Enhanced extraction failed, falling back:', error.message);
      // Fall through to standard mode
    }
  }

  // Standard mode: Use pdf-parse directly
  if (mode === 'standard') {
    return extractTextWithPdfParse(filePath);
  }

  // Auto mode (default): Try Python extractor, fall back to pdf-parse
  const usePython = options.usePython ?? true;

  if (usePython) {
    try {
      await fs.access(SCRIPT_PATH);
      return await extractTextWithPython(filePath, options);
    } catch (error) {
      if (options.strict) {
        throw error;
      }
      console.log('[extractor] Python extractor not available, using pdf-parse fallback');
    }
  }

  return extractTextWithPdfParse(filePath);
}

// Re-export enhanced extractor functions for direct use
export { extractTextWithDeterministic, extractPageRange };

export default extractTextFromPdf;
