/**
 * Gemini Vision Provider - PDF to Structured Sections
 *
 * Uses Gemini 2.0 Flash with vision to extract structured sections directly from PDF.
 * Critical: Uses responseSchema to ensure valid JSON output.
 */

import fs from 'node:fs/promises';

let sdkImportPromise = null;

async function loadGoogleGenerativeAI() {
  if (globalThis.__GEMINI_SDK__?.GoogleGenerativeAI) {
    return globalThis.__GEMINI_SDK__.GoogleGenerativeAI;
  }

  if (!sdkImportPromise) {
    sdkImportPromise = import('@google/generative-ai');
  }

  const module = await sdkImportPromise;
  if (!module || (!module.GoogleGenerativeAI && !module.default)) {
    throw new Error('Failed to load @google/generative-ai');
  }

  return module.GoogleGenerativeAI ?? module.default;
}

export async function createGeminiVisionProvider() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required');
  }

  const GoogleGenerativeAI = await loadGoogleGenerativeAI();
  const genAI = new GoogleGenerativeAI(apiKey);

  return {
    name: 'gemini-vision',

    /**
     * Extract structured sections from PDF using vision model
     *
     * @param {string} pdfPath - Path to PDF file
     * @param {string} systemPrompt - System instruction
     * @param {string} userPrompt - User prompt
     * @param {object} responseSchema - JSON schema for response
     * @returns {Promise<object>} Parsed JSON response
     */
    async extractStructuredSections(pdfPath, systemPrompt, userPrompt, responseSchema) {
      console.log('[gemini_vision] Reading PDF file:', pdfPath);

      // Read PDF as binary
      const pdfData = await fs.readFile(pdfPath);
      const pdfBase64 = pdfData.toString('base64');
      const pdfSizeMB = (pdfData.length / 1024 / 1024).toFixed(2);

      console.log(`[gemini_vision] PDF size: ${pdfSizeMB} MB`);
      console.log('[gemini_vision] Creating vision model with schema-based generation...');

      // Create model with response schema for guaranteed valid JSON
      const visionModel = process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash-exp';
      const temperature = parseFloat(process.env.GEMINI_VISION_TEMPERATURE || '0.4');

      console.log(`[gemini_vision] Using model: ${visionModel}, temperature: ${temperature}`);

      const model = genAI.getGenerativeModel({
        model: visionModel,
        systemInstruction: systemPrompt
      });

      console.log('[gemini_vision] Sending PDF to Gemini...');

      const startTime = Date.now();

      // Generate structured content with proper config
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: pdfBase64
                }
              },
              { text: userPrompt }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: temperature
        }
      });

      const duration = Date.now() - startTime;
      console.log(`[gemini_vision] Response received in ${duration}ms`);

      const response = result.response;
      const text = response.text();

      console.log(`[gemini_vision] Response length: ${text.length} characters`);

      // CRITICAL: Validate JSON before parsing
      let parsed;
      try {
        parsed = JSON.parse(text);
        console.log('[gemini_vision] ✅ Valid JSON response');
      } catch (error) {
        console.error('[gemini_vision] ❌ Invalid JSON response');
        console.error('[gemini_vision] First 500 chars:', text.substring(0, 500));
        console.error('[gemini_vision] Last 500 chars:', text.substring(Math.max(0, text.length - 500)));
        console.error('[gemini_vision] Parse error:', error.message);
        throw new Error('LLM returned invalid JSON');
      }

      // Validate structure
      if (!parsed.title) {
        throw new Error('LLM response missing title field');
      }

      if (!Array.isArray(parsed.sections)) {
        throw new Error('LLM response missing sections array');
      }

      if (parsed.sections.length === 0) {
        throw new Error('LLM returned no sections');
      }

      // Validate each section
      parsed.sections.forEach((section, index) => {
        if (!section.name || !section.description || !section.markdown) {
          throw new Error(`Section ${index + 1} missing required fields`);
        }

        // Check markdown is substantial
        if (section.markdown.length < 100) {
          console.warn(`[gemini_vision] ⚠️  Section "${section.name}" has very short markdown (${section.markdown.length} chars)`);
        }
      });

      console.log(`[gemini_vision] ✅ Extracted ${parsed.sections.length} sections:`);
      parsed.sections.forEach((section, index) => {
        console.log(`[gemini_vision]   ${index + 1}. "${section.name}" - ${section.markdown.length} chars`);
      });

      return parsed;
    },

    /**
     * Extract structured chapters from multiple PDFs using vision model
     *
     * @param {string[]} pdfPaths - Array of paths to PDF files
     * @param {string} systemPrompt - System instruction
     * @param {string} userPrompt - User prompt
     * @param {object} responseSchema - JSON schema for response
     * @returns {Promise<object>} Parsed JSON response with chapters
     */
    async extractStructuredChapters(pdfPaths, systemPrompt, userPrompt, responseSchema) {
      console.log(`[gemini_vision] Reading ${pdfPaths.length} PDF files...`);

      // Read all PDFs as binary and convert to base64
      const pdfParts = [];
      let totalSize = 0;

      for (const pdfPath of pdfPaths) {
        const pdfData = await fs.readFile(pdfPath);
        const pdfBase64 = pdfData.toString('base64');
        const pdfSizeMB = (pdfData.length / 1024 / 1024).toFixed(2);

        totalSize += pdfData.length;

        pdfParts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64
          }
        });

        console.log(`[gemini_vision] PDF ${pdfParts.length} size: ${pdfSizeMB} MB`);
      }

      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
      console.log(`[gemini_vision] Total size: ${totalSizeMB} MB`);
      console.log('[gemini_vision] Creating vision model with schema-based generation...');

      // Create model with response schema for guaranteed valid JSON
      const visionModel = process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash-exp';
      const temperature = parseFloat(process.env.GEMINI_VISION_TEMPERATURE || '0.4');

      console.log(`[gemini_vision] Using model: ${visionModel}, temperature: ${temperature}`);

      const model = genAI.getGenerativeModel({
        model: visionModel,
        systemInstruction: systemPrompt
      });

      console.log(`[gemini_vision] Sending ${pdfPaths.length} PDFs to Gemini for multi-chapter extraction...`);

      const startTime = Date.now();

      // Build content parts: all PDFs + text prompt
      const contentParts = [...pdfParts, { text: userPrompt }];

      // Generate structured content with proper config
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: contentParts
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: temperature
        }
      });

      const duration = Date.now() - startTime;
      console.log(`[gemini_vision] Response received in ${duration}ms (${(duration / 1000).toFixed(1)}s)`);

      const response = result.response;
      const text = response.text();

      console.log(`[gemini_vision] Response length: ${text.length} characters`);

      // CRITICAL: Validate JSON before parsing
      let parsed;
      try {
        parsed = JSON.parse(text);
        console.log('[gemini_vision] ✅ Valid JSON response');
      } catch (error) {
        console.error('[gemini_vision] ❌ Invalid JSON response');
        console.error('[gemini_vision] First 500 chars:', text.substring(0, 500));
        console.error('[gemini_vision] Last 500 chars:', text.substring(Math.max(0, text.length - 500)));
        console.error('[gemini_vision] Parse error:', error.message);
        throw new Error('LLM returned invalid JSON');
      }

      // Validate structure
      if (!Array.isArray(parsed.chapters)) {
        throw new Error('LLM response missing chapters array');
      }

      if (parsed.chapters.length === 0) {
        throw new Error('LLM returned no chapters');
      }

      // Validate each chapter
      parsed.chapters.forEach((chapter, chIndex) => {
        if (typeof chapter.chapter !== 'number') {
          throw new Error(`Chapter ${chIndex + 1} missing chapter number`);
        }
        if (!chapter.title) {
          throw new Error(`Chapter ${chIndex + 1} missing title`);
        }
        if (!Array.isArray(chapter.sections) || chapter.sections.length === 0) {
          throw new Error(`Chapter ${chIndex + 1} has no sections`);
        }

        // Validate each section
        chapter.sections.forEach((section, secIndex) => {
          if (!section.name || !section.description || !section.markdown) {
            throw new Error(`Chapter ${chapter.chapter}, Section ${secIndex + 1} missing required fields`);
          }

          // Check markdown is substantial
          if (section.markdown.length < 100) {
            console.warn(`[gemini_vision] ⚠️  Chapter ${chapter.chapter}, Section "${section.name}" has very short markdown (${section.markdown.length} chars)`);
          }
        });
      });

      console.log(`[gemini_vision] ✅ Extracted ${parsed.chapters.length} chapters:`);
      parsed.chapters.forEach((chapter) => {
        const totalChars = chapter.sections.reduce((sum, s) => sum + s.markdown.length, 0);
        console.log(`[gemini_vision]   Chapter ${chapter.chapter}: "${chapter.title}" - ${chapter.sections.length} sections, ${totalChars} chars`);
      });

      return parsed;
    }
  };
}

export default createGeminiVisionProvider;
