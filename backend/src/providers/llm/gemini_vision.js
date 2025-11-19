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
     * Extract chapters with sections from multiple PDFs using vision model
     *
     * @param {string[]} pdfPaths - Array of paths to PDF files
     * @param {string} systemPrompt - System instruction
     * @param {string} userPrompt - User prompt
     * @param {object} responseSchema - JSON schema for response
     * @returns {Promise<object>} Parsed JSON response with chapters array
     */
    async extractChaptersFromMultiplePDFs(pdfPaths, systemPrompt, userPrompt, responseSchema) {
      console.log(`[gemini_vision] Reading ${pdfPaths.length} PDF files for chapter extraction`);

      // Read all PDFs as binary and convert to base64
      const pdfParts = [];
      let totalSizeMB = 0;

      for (let i = 0; i < pdfPaths.length; i++) {
        const pdfPath = pdfPaths[i];
        console.log(`[gemini_vision] Reading PDF ${i + 1}/${pdfPaths.length}: ${pdfPath}`);

        const pdfData = await fs.readFile(pdfPath);
        const pdfBase64 = pdfData.toString('base64');
        const pdfSizeMB = pdfData.length / 1024 / 1024;
        totalSizeMB += pdfSizeMB;

        console.log(`[gemini_vision] PDF ${i + 1} size: ${pdfSizeMB.toFixed(2)} MB`);

        pdfParts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64
          }
        });
      }

      console.log(`[gemini_vision] Total PDF size: ${totalSizeMB.toFixed(2)} MB`);
      console.log('[gemini_vision] Creating vision model with schema-based generation...');

      // Use gemini-2.5-flash-lite (65K token output limit, fast and cost-effective)
      // or gemini-1.5-pro for longer outputs
      const visionModel = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash-lite';
      const temperature = parseFloat(process.env.GEMINI_VISION_TEMPERATURE || '0.2');

      console.log(`[gemini_vision] Using model: ${visionModel}, temperature: ${temperature}`);

      const model = genAI.getGenerativeModel({
        model: visionModel,
        systemInstruction: systemPrompt
      });

      console.log(`[gemini_vision] Sending ${pdfPaths.length} PDFs to Gemini for chapter extraction...`);

      const startTime = Date.now();

      // Generate structured content with all PDFs and user prompt
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              ...pdfParts,
              { text: userPrompt }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: temperature,
          maxOutputTokens: 65536 // Gemini 2.5 Flash-Lite output limit
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
        console.error('[gemini_vision] Response length:', text.length);
        console.error('[gemini_vision] Parse error:', error.message);

        // Try to find where the JSON broke
        const errorPos = error.message.match(/position (\d+)/);
        if (errorPos) {
          const pos = parseInt(errorPos[1]);
          console.error('[gemini_vision] Error near position', pos);
          console.error('[gemini_vision] Context:', text.substring(Math.max(0, pos - 200), Math.min(text.length, pos + 200)));
        }

        // Save failed response to temp file for debugging
        try {
          const debugPath = `/tmp/failed-gemini-response-${Date.now()}.json`;
          await fs.writeFile(debugPath, text);
          console.error('[gemini_vision] Failed response saved to:', debugPath);
        } catch (writeErr) {
          console.error('[gemini_vision] Could not save debug file:', writeErr.message);
        }

        throw new Error(`LLM returned invalid JSON at position ${errorPos ? errorPos[1] : 'unknown'}: ${error.message}`);
      }

      // Validate structure for chapter-based response
      if (!Array.isArray(parsed.chapters)) {
        throw new Error('LLM response missing chapters array');
      }

      if (parsed.chapters.length === 0) {
        throw new Error('LLM returned no chapters');
      }

      // Validate each chapter
      parsed.chapters.forEach((chapter, chapterIndex) => {
        if (typeof chapter.chapter !== 'number') {
          throw new Error(`Chapter ${chapterIndex + 1} missing chapter number`);
        }

        if (!chapter.title) {
          throw new Error(`Chapter ${chapterIndex + 1} missing title`);
        }

        if (!Array.isArray(chapter.sections)) {
          throw new Error(`Chapter ${chapterIndex + 1} missing sections array`);
        }

        if (chapter.sections.length === 0) {
          throw new Error(`Chapter ${chapterIndex + 1} has no sections`);
        }

        // Validate each section within the chapter
        chapter.sections.forEach((section, sectionIndex) => {
          if (!section.name || !section.description || !section.markdown) {
            throw new Error(`Chapter ${chapter.chapter}, Section ${sectionIndex + 1} missing required fields`);
          }

          // Check markdown is substantial
          if (section.markdown.length < 100) {
            console.warn(`[gemini_vision] ⚠️  Chapter ${chapter.chapter}, Section "${section.name}" has very short markdown (${section.markdown.length} chars)`);
          }
        });
      });

      console.log(`[gemini_vision] ✅ Extracted ${parsed.chapters.length} chapters:`);
      parsed.chapters.forEach((chapter) => {
        console.log(`[gemini_vision]   Chapter ${chapter.chapter}: "${chapter.title}" - ${chapter.sections.length} sections`);
        chapter.sections.forEach((section, index) => {
          console.log(`[gemini_vision]     ${index + 1}. "${section.name}" - ${section.markdown.length} chars`);
        });
      });

      return parsed;
    }
  };
}

export default createGeminiVisionProvider;
