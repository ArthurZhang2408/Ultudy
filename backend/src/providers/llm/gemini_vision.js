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

/**
 * Detect excessive repetition in text (hallucination detection)
 * Checks if a short phrase (3-50 chars) repeats many times
 */
function detectRepetition(text) {
  // Sample the last 10000 characters (where repetition usually occurs)
  const sampleText = text.length > 10000 ? text.substring(text.length - 10000) : text;

  // Try different pattern lengths (3-50 chars)
  for (let patternLength = 3; patternLength <= 50; patternLength++) {
    // Check multiple positions in the text for patterns
    const samples = Math.min(10, Math.floor(sampleText.length / patternLength));

    for (let i = 0; i < samples; i++) {
      const startPos = Math.floor(i * sampleText.length / samples);
      const pattern = sampleText.substring(startPos, startPos + patternLength);

      // Count occurrences of this pattern
      const regex = new RegExp(escapeRegex(pattern), 'g');
      const matches = sampleText.match(regex);
      const count = matches ? matches.length : 0;

      // If pattern repeats > 50 times, it's likely a hallucination
      // Also check if it takes up > 30% of the sample
      const patternPercentage = (count * patternLength) / sampleText.length;

      if (count > 50 && patternPercentage > 0.3) {
        return {
          isRepetitive: true,
          pattern: pattern,
          count: count,
          percentage: (patternPercentage * 100).toFixed(1)
        };
      }
    }
  }

  return { isRepetitive: false };
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
     * Extract chapters as plain markdown (no JSON)
     * Avoids equation escaping issues by using delimited text format
     *
     * @param {string} pdfPath - Path to PDF file
     * @param {string} systemPrompt - System instruction
     * @param {string} userPrompt - User prompt
     * @returns {Promise<string>} Raw markdown text with chapter delimiters
     */
    async extractChaptersAsMarkdown(pdfPath, systemPrompt, userPrompt) {
      console.log('[gemini_vision] Reading PDF file for chapter extraction:', pdfPath);

      // Read PDF as binary
      const pdfData = await fs.readFile(pdfPath);
      const pdfBase64 = pdfData.toString('base64');
      const pdfSizeMB = (pdfData.length / 1024 / 1024).toFixed(2);

      console.log(`[gemini_vision] PDF size: ${pdfSizeMB} MB`);
      console.log('[gemini_vision] Creating vision model for markdown generation...');

      // Create model for text-only response (no schema)
      const visionModel = process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash-exp';
      const temperature = parseFloat(process.env.GEMINI_VISION_TEMPERATURE || '0.4');

      console.log(`[gemini_vision] Using model: ${visionModel}, temperature: ${temperature}`);

      const model = genAI.getGenerativeModel({
        model: visionModel,
        systemInstruction: systemPrompt
      });

      console.log('[gemini_vision] Sending PDF to Gemini for chapter extraction...');

      const startTime = Date.now();

      // Generate plain text markdown (no JSON)
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
          // NO responseMimeType or responseSchema - we want plain text
        }
      });

      const duration = Date.now() - startTime;
      console.log(`[gemini_vision] ⏱️ Response received in ${duration}ms`);

      const response = result.response;
      const text = response.text();

      console.log(`[gemini_vision] 📊 Response length: ${text.length} characters`);
      console.log(`[gemini_vision] Response preview (first 300 chars):`);
      console.log(text.substring(0, 300));
      console.log(`[gemini_vision] ...`);

      // Basic validation - check for chapter delimiters
      if (!text.includes('---CHAPTER_START---')) {
        console.error('[gemini_vision] ❌ Response missing chapter delimiters');
        console.error('[gemini_vision] This means the LLM did NOT follow the delimiter format!');
        console.error('[gemini_vision] Full response preview (first 2000 chars):');
        console.error(text.substring(0, 2000));
        console.error('[gemini_vision] ...');
        console.error('[gemini_vision] Full response preview (last 1000 chars):');
        console.error(text.substring(Math.max(0, text.length - 1000)));
        throw new Error('LLM response missing chapter delimiters. Expected ---CHAPTER_START--- markers. LLM may have ignored the format instructions.');
      }

      const chapterCount = (text.match(/---CHAPTER_START---/g) || []).length;
      console.log(`[gemini_vision] ✅ Found ${chapterCount} chapter delimiter(s)`);

      return text;
    },

    /**
     * Extract as plain text (no JSON, no schema)
     * Perfect for markdown extraction without escaping issues
     *
     * @param {string} pdfPath - Path to PDF file
     * @param {string} systemPrompt - System instruction
     * @param {string} userPrompt - User prompt
     * @returns {Promise<string>} Raw text response
     */
    async extractAsPlainText(pdfPath, systemPrompt, userPrompt) {
      console.log('[gemini_vision] 📝 Extracting as plain text (no JSON)');

      // Read PDF as binary
      const pdfData = await fs.readFile(pdfPath);
      const pdfBase64 = pdfData.toString('base64');
      const pdfSizeMB = (pdfData.length / 1024 / 1024).toFixed(2);

      console.log(`[gemini_vision] PDF size: ${pdfSizeMB} MB`);

      const visionModel = process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash-exp';
      const temperature = parseFloat(process.env.GEMINI_VISION_TEMPERATURE || '0.4');

      const model = genAI.getGenerativeModel({
        model: visionModel,
        systemInstruction: systemPrompt
      });

      console.log('[gemini_vision] 📤 Sending PDF for plain text extraction...');

      const startTime = Date.now();

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
          temperature: temperature,
          maxOutputTokens: 32768 // Limit output to prevent runaway generation (~65K chars)
          // NO responseMimeType or responseSchema - pure text output
        }
      });

      const duration = Date.now() - startTime;
      console.log(`[gemini_vision] ⏱️ Response received in ${duration}ms`);

      const response = result.response;
      const text = response.text();

      console.log(`[gemini_vision] 📊 Response length: ${text.length} characters`);
      console.log(`[gemini_vision] Preview (first 500 chars):`);
      console.log(text.substring(0, 500));

      // Detect excessive repetition (hallucination)
      const repetitionCheck = detectRepetition(text);
      if (repetitionCheck.isRepetitive) {
        console.error('[gemini_vision] ❌ REPETITION DETECTED - LLM hallucination');
        console.error(`[gemini_vision] Repeated pattern: "${repetitionCheck.pattern}"`);
        console.error(`[gemini_vision] Occurrences: ${repetitionCheck.count}`);
        console.error(`[gemini_vision] Last 1000 chars:`);
        console.error(text.substring(Math.max(0, text.length - 1000)));
        throw new Error(`LLM hallucination detected: phrase "${repetitionCheck.pattern}" repeated ${repetitionCheck.count} times. This indicates the model got stuck in a loop.`);
      }

      return text;
    }
  };
}

export default createGeminiVisionProvider;
