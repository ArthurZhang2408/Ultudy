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
     * Extract markdown from PDF using vision model (returns plain text)
     *
     * @param {string} pdfPath - Path to PDF file
     * @param {string} systemPrompt - System instruction
     * @param {string} userPrompt - User prompt
     * @returns {Promise<string>} Plain markdown text
     */
    async extractMarkdown(pdfPath, systemPrompt, userPrompt) {
      console.log('[gemini_vision] Reading PDF file:', pdfPath);

      // Read PDF as binary
      const pdfData = await fs.readFile(pdfPath);
      const pdfBase64 = pdfData.toString('base64');
      const pdfSizeMB = (pdfData.length / 1024 / 1024).toFixed(2);

      console.log(`[gemini_vision] PDF size: ${pdfSizeMB} MB`);
      console.log('[gemini_vision] Creating vision model for markdown extraction...');

      const visionModel = process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash-exp';
      const temperature = parseFloat(process.env.GEMINI_VISION_TEMPERATURE || '0.4');

      console.log(`[gemini_vision] Using model: ${visionModel}, temperature: ${temperature}`);

      const model = genAI.getGenerativeModel({
        model: visionModel,
        systemInstruction: systemPrompt
      });

      console.log('[gemini_vision] Sending PDF to Gemini for markdown conversion...');

      const startTime = Date.now();

      // Generate plain text markdown (no JSON schema)
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
          temperature: temperature
          // No responseMimeType - returns plain text by default
        }
      });

      const duration = Date.now() - startTime;
      console.log(`[gemini_vision] Response received in ${duration}ms`);

      const response = result.response;
      const markdown = response.text();

      console.log(`[gemini_vision] ✅ Markdown extraction successful`);
      console.log(`[gemini_vision] Response length: ${markdown.length} characters`);

      // Basic validation
      if (!markdown || markdown.trim().length === 0) {
        throw new Error('LLM returned empty response');
      }

      return markdown;
    },

    /**
     * Extract structured sections from PDF using vision model (DEPRECATED - uses JSON)
     *
     * @param {string} pdfPath - Path to PDF file
     * @param {string} systemPrompt - System instruction
     * @param {string} userPrompt - User prompt
     * @param {object} responseSchema - JSON schema for response
     * @returns {Promise<object>} Parsed JSON response
     * @deprecated Use extractMarkdown instead
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
    }
  };
}

export default createGeminiVisionProvider;
