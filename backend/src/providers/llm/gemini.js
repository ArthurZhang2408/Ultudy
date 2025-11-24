const DEFAULT_MODEL = 'gemini-2.0-flash-exp';
const MAX_CONTEXT_CHARS = 8000;
const MAX_SNIPPET_CHARS = 600;

let sdkImportPromise = null;

function sanitizeText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function formatPageRange(chunk) {
  const start = chunk.page_start ?? chunk.pageStart;
  const end = chunk.page_end ?? chunk.pageEnd;

  if (Number.isFinite(start) && Number.isFinite(end)) {
    if (start === end) {
      return `p.${start}`;
    }
    return `p.${start}-${end}`;
  }

  if (Number.isFinite(start)) {
    return `p.${start}`;
  }

  if (Number.isFinite(end)) {
    return `p.${end}`;
  }

  return 'p.?';
}

function formatSourceLabel(chunk) {
  const title = sanitizeText(chunk.title).trim();
  if (title) {
    return title;
  }

  const docId = sanitizeText(chunk.document_id || chunk.documentId);
  if (docId) {
    return `Document ${docId.slice(0, 8)}`;
  }

  return 'Document';
}

function truncateSnippet(text) {
  const normalized = sanitizeText(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_SNIPPET_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_SNIPPET_CHARS)}…`;
}

function buildContext(hits = []) {
  const pieces = [];
  let total = 0;

  for (const hit of hits) {
    const snippet = truncateSnippet(hit.excerpt ?? hit.text ?? '');
    if (!snippet) {
      continue;
    }

    const line = `- ${formatSourceLabel(hit)} (${formatPageRange(hit)}): ${snippet}`;
    if (total + line.length > MAX_CONTEXT_CHARS) {
      break;
    }
    pieces.push(line);
    total += line.length + 1;
  }

  return pieces.join('\n');
}

function requireString(value, fieldName) {
  const str = sanitizeText(value).trim();
  if (!str) {
    throw new Error(`Gemini LLM provider returned an invalid ${fieldName}`);
  }
  return str;
}

function requireStringArray(values, minLength, fieldName) {
  if (!Array.isArray(values)) {
    throw new Error(`Gemini LLM provider returned an invalid ${fieldName} array`);
  }

  const sanitized = values
    .map((entry) => sanitizeText(entry).trim())
    .filter((entry) => entry.length > 0);

  if (sanitized.length < minLength) {
    throw new Error(`Gemini LLM provider returned insufficient ${fieldName}`);
  }

  return sanitized;
}

function normalizeSources(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Gemini LLM provider returned invalid sources');
  }

  return values.map((entry) => {
    const documentId = sanitizeText(entry?.document_id || entry?.documentId).trim();
    const pageStart = Number.parseInt(entry?.page_start ?? entry?.pageStart, 10);
    const pageEnd = Number.parseInt(entry?.page_end ?? entry?.pageEnd, 10);

    if (!documentId) {
      throw new Error('Gemini LLM provider returned a source without document_id');
    }
    if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd)) {
      throw new Error('Gemini LLM provider returned a source without valid page range');
    }

    return {
      document_id: documentId,
      page_start: pageStart,
      page_end: pageEnd
    };
  });
}

/**
 * Process code block tags in examples
 * Converts <cb lang="language">code</cb> tags to markdown code blocks
 *
 * @deprecated This is for backward compatibility with JSON-based lessons.
 * New markdown-based lessons use native code blocks.
 */
function processCodeBlocks(examples) {
  if (!Array.isArray(examples)) {
    return [];
  }

  return examples.map((ex, idx) => {
    if (typeof ex !== 'string') {
      console.warn(`[processCodeBlocks] Example ${idx + 1} is not a string:`, typeof ex);
      return String(ex || '');
    }

    // Check if this example contains a <cb> tag
    const cbRegex = /<cb\s+lang="([^"]+)">(.+?)<\/cb>/s;
    const match = ex.match(cbRegex);

    if (match) {
      const language = match[1];
      const code = match[2];

      // Replace \n with actual newlines
      const processedCode = code.replace(/\\n/g, '\n');

      console.log(`[processCodeBlocks] Example ${idx + 1}: Found code block (${language}, ${processedCode.length} chars)`);

      // Convert to markdown code block
      return `\`\`\`${language}\n${processedCode}\n\`\`\``;
    }

    // No code block tag, return as-is
    return ex;
  });
}

/**
 * Parse markdown-formatted lesson into structured JSON
 *
 * Expected format:
 * # Topic Name
 * ## Summary
 * ...
 * # Concept 1 Name
 * ## Explanation
 * ...
 * ## Check Your Understanding
 * ...
 */
function parseMarkdownLesson(markdown, document_id) {
  const lines = markdown.split('\n');

  // Extract topic (first # heading)
  let topic = 'Untitled Lesson';
  let topicLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      topic = line.substring(2).trim();
      topicLineIndex = i;
      break;
    }
  }

  console.log(`[parseMarkdownLesson] Topic: "${topic}"`);

  // Find Summary section (## Summary right after topic)
  let summary = '';
  let summaryEndIndex = topicLineIndex + 1;

  for (let i = topicLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '## Summary') {
      // Collect summary content until next # or ## heading
      const summaryLines = [];
      for (let j = i + 1; j < lines.length; j++) {
        const contentLine = lines[j].trim();
        if (contentLine.startsWith('#')) {
          summaryEndIndex = j;
          break;
        }
        summaryLines.push(lines[j]);
      }
      summary = summaryLines.join('\n').trim();
      break;
    }
    if (line.startsWith('#')) {
      summaryEndIndex = i;
      break;
    }
  }

  console.log(`[parseMarkdownLesson] Summary extracted: ${summary.length} chars`);

  // Find all concept headings (# Concept Name, but not the first topic heading)
  const conceptIndices = [];
  for (let i = summaryEndIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      conceptIndices.push(i);
    }
  }

  console.log(`[parseMarkdownLesson] Found ${conceptIndices.length} concepts`);

  if (conceptIndices.length === 0) {
    throw new Error('No concepts found in markdown lesson');
  }

  // Parse each concept
  const concepts = [];

  for (let i = 0; i < conceptIndices.length; i++) {
    const startIndex = conceptIndices[i];
    const endIndex = i < conceptIndices.length - 1 ? conceptIndices[i + 1] : lines.length;

    const conceptName = lines[startIndex].substring(2).trim();
    const conceptContent = lines.slice(startIndex + 1, endIndex);

    // Parse concept sections
    const concept = parseConceptSections(conceptName, conceptContent);
    concepts.push(concept);
  }

  // Build combined explanation from all concepts
  const explanation = concepts
    .map((c) => `**${c.name}**: ${c.explanation}`)
    .join('\n\n');

  // Collect all MCQs
  const allCheckins = concepts.flatMap(c => c.check_ins);

  return {
    topic,
    summary,
    explanation,
    analogies: [], // Not using analogies in new format
    examples: [], // Examples are part of concepts now
    concepts,
    check_ins: allCheckins
  };
}

/**
 * Parse a single concept's markdown sections
 */
function parseConceptSections(conceptName, contentLines) {
  const sections = {
    explanation: '',
    formulas: [],
    examples: [],
    important_notes: [],
    mcqs: []
  };

  let currentSection = null;
  let currentContent = [];

  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i].trim();

    // Detect section headers
    if (line === '## Explanation') {
      if (currentSection && currentContent.length > 0) {
        processSectionContent(currentSection, currentContent, sections);
      }
      currentSection = 'explanation';
      currentContent = [];
    } else if (line === '## Formulas') {
      if (currentSection && currentContent.length > 0) {
        processSectionContent(currentSection, currentContent, sections);
      }
      currentSection = 'formulas';
      currentContent = [];
    } else if (line === '## Examples') {
      if (currentSection && currentContent.length > 0) {
        processSectionContent(currentSection, currentContent, sections);
      }
      currentSection = 'examples';
      currentContent = [];
    } else if (line === '## Important Notes') {
      if (currentSection && currentContent.length > 0) {
        processSectionContent(currentSection, currentContent, sections);
      }
      currentSection = 'important_notes';
      currentContent = [];
    } else if (line === '## Check Your Understanding') {
      if (currentSection && currentContent.length > 0) {
        processSectionContent(currentSection, currentContent, sections);
      }
      currentSection = 'mcqs';
      currentContent = [];
    } else {
      // Add line to current section content
      currentContent.push(contentLines[i]);
    }
  }

  // Process last section
  if (currentSection && currentContent.length > 0) {
    processSectionContent(currentSection, currentContent, sections);
  }

  // Return flat structure matching old JSON format
  return {
    name: conceptName,
    explanation: sections.explanation,
    analogies: [], // Not using analogies in new format
    examples: sections.examples,
    formulas: sections.formulas,
    important_notes: sections.important_notes,
    check_ins: sections.mcqs
  };
}

/**
 * Process content for a specific section type
 */
function processSectionContent(sectionType, contentLines, sections) {
  const content = contentLines.join('\n').trim();

  if (sectionType === 'explanation') {
    sections.explanation = content;
  } else if (sectionType === 'formulas') {
    // Parse formulas flexibly - handle different formats
    const lines = content.split('\n').filter(line => line.trim());
    const formulas = [];

    let currentFormula = null;
    for (const line of lines) {
      const trimmed = line.trim();

      // Check if this is a formula line with **Formula**: marker
      if (trimmed.match(/^-?\s*\*\*Formula\*\*:/i)) {
        // Save previous formula if exists
        if (currentFormula) {
          formulas.push(currentFormula);
        }

        // Extract formula and variables from same line
        const match = trimmed.match(/\*\*Formula\*\*:\s*(.+?)(?:\s+\*\*Variables\*\*:\s*(.+))?$/);
        if (match) {
          currentFormula = {
            formula: match[1].trim(),
            variables: match[2] ? match[2].trim() : ''
          };
        }
      } else if (trimmed.match(/^-?\s*\*\*Variables\*\*:/i) && currentFormula) {
        // Variables on separate line
        const varMatch = trimmed.match(/\*\*Variables\*\*:\s*(.+)/);
        if (varMatch) {
          currentFormula.variables = varMatch[1].trim();
        }
      } else if (trimmed.startsWith('-') && !trimmed.match(/\*\*Formula\*\*:/i) && !trimmed.match(/\*\*Variables\*\*:/i)) {
        // Generic bullet point formula without explicit markers
        if (currentFormula) {
          formulas.push(currentFormula);
        }
        currentFormula = {
          formula: trimmed.substring(1).trim(),
          variables: ''
        };
      }
    }

    // Push last formula
    if (currentFormula) {
      formulas.push(currentFormula);
    }

    sections.formulas = formulas.length > 0 ? formulas : [];
  } else if (sectionType === 'examples') {
    // Split examples by **Example N**: markers, or keep as single block
    const exampleMatches = content.match(/\*\*Example \d+\*\*:[\s\S]+?(?=\*\*Example \d+\*\*:|$)/g);
    if (exampleMatches && exampleMatches.length > 0) {
      sections.examples = exampleMatches.map(ex => ex.trim());
    } else if (content.trim()) {
      // Single example or no markers
      sections.examples = [content];
    } else {
      sections.examples = [];
    }
  } else if (sectionType === 'important_notes') {
    // Parse bullet points, handling various formats
    const notes = content.split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(note => {
        let cleaned = note.trim().substring(1).trim();
        // Remove common markdown artifacts
        cleaned = cleaned.replace(/^\*\*(.+?)\*\*:\s*/, '$1: ');
        return cleaned;
      });
    sections.important_notes = notes.length > 0 ? notes : [];
  } else if (sectionType === 'mcqs') {
    // Parse MCQs
    sections.mcqs = parseMCQs(content);
  }
}

/**
 * Parse MCQ questions from markdown
 *
 * Expected format:
 * **Question 1**: What is the formula?
 * 1. Correct answer (CORRECT)
 * 2. Wrong answer
 * 3. Wrong answer
 * 4. Wrong answer
 *
 * **Explanations**:
 * - **Option 1**: Why correct
 * - **Option 2**: Why wrong
 * - **Option 3**: Why wrong
 * - **Option 4**: Why wrong
 */
function parseMCQs(content) {
  const mcqs = [];
  const questionBlocks = content.split(/\*\*Question \d+\*\*:/);

  for (let i = 1; i < questionBlocks.length; i++) {
    const block = questionBlocks[i];

    // Extract question text (everything before first numbered option)
    const questionMatch = block.match(/^(.+?)\n\d+\./s);
    if (!questionMatch) continue;

    const question = questionMatch[1].trim();

    // Extract options (numbered 1-4)
    const optionMatches = [...block.matchAll(/^(\d+)\.\s*(.+?)(?=\n\d+\.|\n\*\*Explanations\*\*:|\n$)/gms)];

    if (optionMatches.length !== 4) {
      console.warn(`[parseMCQs] Question has ${optionMatches.length} options, expected 4`);
      continue;
    }

    // Find which option is marked as CORRECT
    const options = optionMatches.map((match, idx) => {
      const text = match[2].trim();
      const isCorrect = text.includes('(CORRECT)');
      return {
        letter: String.fromCharCode(65 + idx), // A, B, C, D
        text: text.replace(/\s*\(CORRECT\)\s*/g, '').trim(),
        correct: isCorrect,
        explanation: '' // Will fill in next step
      };
    });

    // Extract explanations
    const explanationsMatch = block.match(/\*\*Explanations\*\*:\s*([\s\S]+)/);
    if (explanationsMatch) {
      const explanationsList = explanationsMatch[1].trim().split('\n').filter(line => line.trim().startsWith('-'));

      explanationsList.forEach((expLine, idx) => {
        if (idx < 4) {
          const expMatch = expLine.match(/\*\*Option \d+\*\*:\s*(.+)/);
          if (expMatch) {
            options[idx].explanation = expMatch[1].trim();
          }
        }
      });
    }

    // Shuffle options but remember correct answer
    const correctOption = options.find(opt => opt.correct);
    if (!correctOption) {
      console.warn('[parseMCQs] No correct option found, skipping question');
      continue;
    }

    // Shuffle the options
    const shuffled = [...options];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }

    // Re-assign letters after shuffle
    shuffled.forEach((opt, idx) => {
      opt.letter = String.fromCharCode(65 + idx);
    });

    mcqs.push({
      question,
      options: shuffled,
      expected_answer: correctOption.text,
      hint: ''
    });
  }

  return mcqs;
}

function normalizeLessonPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Gemini LLM provider returned an invalid lesson payload');
  }

  const analogies = requireStringArray(payload.analogies, 2, 'analogies').slice(0, 2);
  const workedSteps = requireStringArray(payload.example?.workedSteps, 3, 'example worked steps');
  const checkins = Array.isArray(payload.checkins) ? payload.checkins : [];

  if (checkins.length < 2) {
    throw new Error('Gemini LLM provider returned insufficient check-ins');
  }

  const normalizedCheckins = checkins.slice(0, 2).map((entry) => ({
    question: requireString(entry?.question, 'check-in question'),
    answer: requireString(entry?.answer, 'check-in answer')
  }));

  return {
    topic: requireString(payload.topic, 'topic'),
    summary: requireString(payload.summary, 'summary'),
    analogies,
    example: {
      setup: requireString(payload.example?.setup, 'example setup'),
      workedSteps
    },
    checkins: normalizedCheckins,
    sources: normalizeSources(payload.sources)
  };
}

function normalizeMCQPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
    throw new Error('Gemini LLM provider returned an invalid MCQ payload');
  }

  if (payload.items.length === 0) {
    throw new Error('Gemini LLM provider returned no MCQ items');
  }

  const items = payload.items.map((item, index) => {
    const question = requireString(item?.question, `MCQ question ${index + 1}`);
    const rationale = requireString(item?.rationale, `MCQ rationale ${index + 1}`);
    const choices = requireStringArray(item?.choices, 4, `MCQ choices ${index + 1}`);
    if (choices.length !== 4) {
      throw new Error('Gemini LLM provider must return exactly four choices');
    }
    const correctIndex = Number.parseInt(item?.correctIndex, 10);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
      throw new Error('Gemini LLM provider returned an invalid correctIndex');
    }

    return {
      question,
      choices,
      correctIndex,
      rationale,
      source: normalizeSources([item?.source])[0]
    };
  });

  return { items };
}

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

function extractResponseText(result) {
  if (!result) {
    return '';
  }

  const candidate = result.response;
  if (candidate?.text) {
    const value = candidate.text();
    if (typeof value === 'string') {
      return value;
    }
  }

  const parts = candidate?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((part) => part.text).join('').trim();
  }

  return '';
}

function parseJsonOutput(rawText) {
  if (!rawText) {
    throw new Error('Gemini LLM provider returned an empty response');
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
    // Log the actual response for debugging
    console.error('[gemini] Failed to parse JSON. Raw response (first 500 chars):', rawText.substring(0, 500));
    console.error('[gemini] Parse error:', error.message);
    throw new Error('Gemini LLM provider returned invalid JSON');
  }
}

async function callModel(systemPrompt, userPrompt, responseSchema = null, maxRetries = 5) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required when using the gemini LLM provider');
  }

  const modelName = process.env.GEMINI_GEN_MODEL || DEFAULT_MODEL;

  const GoogleGenerativeAI = await loadGoogleGenerativeAI();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt
  });

  const generationConfig = {
    responseMimeType: 'application/json',
    temperature: 0.4
  };

  // Add response schema if provided
  if (responseSchema) {
    generationConfig.responseSchema = responseSchema;
  }

  // Helper to check if error is retryable
  function isRetryableError(error) {
    const errorMsg = error.message || '';
    // Retry on 503 Service Unavailable, rate limits, or network errors
    return errorMsg.includes('503') ||
           errorMsg.includes('overloaded') ||
           errorMsg.includes('rate limit') ||
           errorMsg.includes('ECONNRESET') ||
           errorMsg.includes('ETIMEDOUT') ||
           errorMsg.includes('invalid JSON');
  }

  // Retry logic with exponential backoff
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[gemini] Attempt ${attempt + 1}/${maxRetries} to generate content...`);

      const response = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        generationConfig
      });

      const text = extractResponseText(response);
      const parsed = parseJsonOutput(text);

      console.log(`[gemini] ✅ Valid response received on attempt ${attempt + 1}`);
      return parsed;
    } catch (error) {
      lastError = error;
      const errorMsg = error.message || '';

      if (isRetryableError(error)) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff, max 30s
        console.warn(`[gemini] ⚠️  Attempt ${attempt + 1} failed: ${errorMsg}`);

        if (attempt < maxRetries - 1) {
          console.log(`[gemini] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`[gemini] ❌ All ${maxRetries} attempts exhausted`);
        }
      } else {
        // Non-retryable error, throw immediately
        console.error(`[gemini] ❌ Non-retryable error:`, errorMsg);
        throw error;
      }
    }
  }

  // All retries exhausted
  console.error(`[gemini] ❌ Failed after ${maxRetries} attempts`);
  throw lastError;
}

/**
 * Call model for markdown generation (no JSON schema)
 * Returns plain text/markdown response
 */
async function callMarkdownModel(systemPrompt, userPrompt, maxRetries = 5) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required when using the gemini LLM provider');
  }

  const modelName = process.env.GEMINI_GEN_MODEL || DEFAULT_MODEL;

  const GoogleGenerativeAI = await loadGoogleGenerativeAI();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt
  });

  const generationConfig = {
    temperature: 0.4
    // No responseMimeType - returns plain text by default
  };

  // Helper to check if error is retryable
  function isRetryableError(error) {
    const errorMsg = error.message || '';
    return errorMsg.includes('503') ||
           errorMsg.includes('overloaded') ||
           errorMsg.includes('rate limit') ||
           errorMsg.includes('ECONNRESET') ||
           errorMsg.includes('ETIMEDOUT');
  }

  // Retry logic with exponential backoff
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[gemini] Attempt ${attempt + 1}/${maxRetries} to generate markdown...`);

      const response = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        generationConfig
      });

      const markdown = extractResponseText(response);

      if (!markdown || markdown.trim().length === 0) {
        throw new Error('LLM returned empty response');
      }

      console.log(`[gemini] ✅ Valid markdown received on attempt ${attempt + 1}`);
      return markdown;
    } catch (error) {
      lastError = error;
      const errorMsg = error.message || '';

      if (isRetryableError(error)) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff, max 30s
        console.warn(`[gemini] ⚠️  Attempt ${attempt + 1} failed: ${errorMsg}`);

        if (attempt < maxRetries - 1) {
          console.log(`[gemini] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`[gemini] ❌ All ${maxRetries} attempts exhausted`);
        }
      } else {
        // Non-retryable error, throw immediately
        console.error(`[gemini] ❌ Non-retryable error:`, errorMsg);
        throw error;
      }
    }
  }

  // All retries exhausted
  console.error(`[gemini] ❌ Failed after ${maxRetries} attempts`);
  throw lastError;
}

function buildLessonPrompt({ topic, query, hits }) {
  const context = buildContext(hits);
  const payload = {
    topic: topic || query || 'study topic',
    query,
    context
  };

  return `Create a JSON lesson strictly matching this shape:\n{
  "topic": string,
  "summary": string (<= 180 words),
  "analogies": [string, string],
  "example": { "setup": string, "workedSteps": [string, string, string+] },
  "checkins": [ { "question": string, "answer": string }, { "question": string, "answer": string } ],
  "sources": [ { "document_id": string, "page_start": number, "page_end": number } ]
}
Ground every detail in the provided context. If a detail is missing, state that in the summary. Input data: ${JSON.stringify(
    payload
  )}`;
}

function buildMCQPrompt({ topic, difficulty, hits, n }) {
  const context = buildContext(hits);
  const payload = {
    topic: topic || 'the provided material',
    difficulty,
    n,
    context
  };

  return `Create a JSON object with an "items" array of ${n} multiple-choice questions. Each item must include:
- "question": string,
- "choices": [string, string, string, string],
- "correctIndex": number (0-3),
- "rationale": string,
- "source": { "document_id": string, "page_start": number, "page_end": number }
Use only the given context and match the requested difficulty. Input data: ${JSON.stringify(payload)}`;
}

function buildMarkdownLessonPrompt({
  title,
  full_text,
  chapter,
  include_check_ins,
  section_name,
  section_description
}) {
  const systemInstruction = `You are an expert educational content creator specializing in comprehensive, exam-focused learning. Your role is to:
1. Extract ALL testable content from course materials (formulas, definitions, procedures, examples)
2. Create detailed, hierarchical concept structures that preserve information depth
3. Generate focused explanations with practical examples
4. Create multiple-choice questions that test both understanding and application

Return ONLY plain markdown. NO JSON, NO special tags, just pure markdown formatting.`;

  // Build context string with section info if provided
  let contextString = `**Title:** ${title || 'Course Material'}`;
  if (chapter) {
    contextString += `\n**Chapter:** ${chapter}`;
  }
  if (section_name) {
    contextString += `\n**Section:** ${section_name}`;
    if (section_description) {
      contextString += `\n**Section Overview:** ${section_description}`;
    }
  }

  // Build topic instruction based on whether this is section-scoped
  let scopeInstruction = '';
  if (section_name) {
    scopeInstruction = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  CRITICAL SCOPE REQUIREMENT ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is a SECTION-SCOPED lesson generation.

**Section:** "${section_name}"
${section_description ? `**Description:** ${section_description}` : ''}

YOU MUST:
1. Use "${section_name}" as the topic title (# heading)
2. Generate concepts ONLY from content related to "${section_name}"
3. IGNORE content from other sections or the broader chapter
4. Focus on concepts specifically mentioned in this section's text

YOU MUST NOT:
- Generate concepts from the entire chapter/document
- Include concepts that belong to other sections
- Create generic concepts that apply to the whole document

If the section text is too short or unclear, generate 3-5 focused concepts
based strictly on what's present in this section's content.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }

  const userPrompt = `I'm studying from this material:

${contextString}${scopeInstruction}

**Full Content:**
${full_text}

---

Create a comprehensive, interactive learning experience in **pure markdown format**. NO JSON, NO special tags.

**OUTPUT FORMAT:**

# Topic Name

## Summary

What you'll learn:
1. First learning point
2. Second learning point
3. Third learning point

Why it matters: One sentence on real-world relevance

Learning outcome: What you'll be able to do after mastering this

# Concept 1 Name

## Explanation

2-3 sentence focused explanation with **key terms** in bold and *definitions* in italics. Use native LaTeX for math: $E = mc^2$ for inline or $$E = mc^2$$ for display equations.

## Formulas

- **Formula**: $E = mc^2$ **Variables**: $E$ is energy (joules), $m$ is mass (kg), $c$ is speed of light
- **Formula**: $F = ma$ **Variables**: $F$ is force (newtons), $m$ is mass (kg), $a$ is acceleration (m/s²)

## Examples

**IMPORTANT**: Examples MUST demonstrate how to apply the formulas above. Show step-by-step calculations using the formulas.

**Example 1:** Calculate energy for mass $m = 2$ kg using $E = mc^2$:

$$E = 2 \\times (3 \\times 10^8)^2 = 1.8 \\times 10^{17} \\text{ J}$$

**Example 2:** With code applying the formula:

\`\`\`python
def calculate_energy(mass):
    c = 3e8  # speed of light
    return mass * c**2  # Applying E = mc²

print(calculate_energy(2))  # 1.8e17
\`\`\`

## Important Notes

- **Critical:** Only applies in *relativistic* contexts
- **Common mistake:** Don't confuse rest mass with relativistic mass
- **Key insight:** Energy and mass are equivalent forms

## Check Your Understanding

**Question 1**: What does $E = mc^2$ represent?
1. Einstein's mass-energy equivalence formula (CORRECT)
2. Newton's second law of motion
3. The momentum formula
4. Kinetic energy equation

**Explanations**:
- **Option 1**: Correct! This is Einstein's famous mass-energy equivalence, showing that mass and energy are interchangeable.
- **Option 2**: This is $F = ma$, Newton's second law relating force, mass, and acceleration.
- **Option 3**: Momentum is $p = mv$, a different concept from energy.
- **Option 4**: Kinetic energy is $KE = \\frac{1}{2}mv^2$, which only applies at non-relativistic speeds.

**Question 2**: In $E = mc^2$, what is $c$?
1. Mass constant
2. Energy coefficient
3. Speed of light (CORRECT)
4. Charge constant

**Explanations**:
- **Option 1**: There's no "mass constant" in this equation.
- **Option 2**: While $c^2$ is multiplied, $c$ itself is the speed of light, not just a coefficient.
- **Option 3**: Correct! $c$ is the speed of light in vacuum, approximately $3 \\times 10^8$ m/s.
- **Option 4**: Charge is represented by $q$ or $e$, not $c$.

# Concept 2 Name

## Explanation
...

**CRITICAL GUIDELINES:**

**Content Coverage:**
- READ THE ENTIRE SECTION before deciding which concepts to include
- IDENTIFY ALL MAJOR TOPICS covered (if section has multiple topics, include ALL)
- DO NOT skip important topics that appear later in the text
- Generate 6-15 concepts based on content breadth:
  * 1-2 major topics → 6-8 concepts
  * 3-4 major topics → 9-12 concepts
  * 5+ major topics → 12-15 concepts

**Formatting:**
- Use **bold** for key terms
- Use *italic* for emphasis and definitions
- Use native LaTeX: $inline$ or $$display$$
- Use markdown code blocks: \`\`\`language
- Use standard markdown tables
- # for main topic, # for each concept, ## for sections within concepts

**MCQ Requirements:**
- 2-3 questions per concept
- 4 options each (mark correct one with "(CORRECT)")
- List correct answer FIRST, then 3 wrong answers
- Provide detailed explanations for ALL 4 options
- Test understanding, not memorization
- **CRITICAL**: Questions MUST be different from the Examples section. Use different numbers, scenarios, or contexts while testing the same concept. Examples show HOW, MCQs test IF they understood.

**Structure:**
- ## Summary right after topic
- Each concept as # heading
- Within each concept: ## Explanation, ## Formulas, ## Examples, ## Important Notes, ## Check Your Understanding
- Optional sections can be omitted if not relevant

Return ONLY the markdown. No JSON, no code fences around the whole thing, no explanatory text. Just start with # and the topic name.`;

  return { systemInstruction, userPrompt };
}


export default async function createGeminiLLMProvider() {
  return {
    name: 'gemini-llm',
    async generateLesson({ topic, query, hits = [], chunks = [] } = {}) {
      const lesson = await callModel(
        'You create tightly-scoped study lessons grounded in the provided sources. Always respond with valid JSON.',
        buildLessonPrompt({ topic, query, hits: hits.length ? hits : chunks })
      );

      return normalizeLessonPayload(lesson);
    },
    async generateMCQs({ topic, difficulty = 'med', n = 5, hits = [], chunks = [] } = {}) {
      const mcqs = await callModel(
        'You create grounded multiple-choice practice. Always respond with valid JSON and do not invent sources.',
        buildMCQPrompt({ topic, difficulty, n, hits: hits.length ? hits : chunks })
      );

      return normalizeMCQPayload(mcqs);
    },
    /**
     * MVP v1.0: Generate interactive lesson from full document context
     */
    async generateFullContextLesson({
      document_id,
      title,
      full_text,
      material_type,
      chapter,
      include_check_ins = true,
      section_name,
      section_description
    } = {}) {
      if (!full_text || full_text.trim().length === 0) {
        throw new Error('Full text is required for lesson generation');
      }

      const { systemInstruction, userPrompt } = buildMarkdownLessonPrompt({
        title,
        full_text,
        chapter,
        include_check_ins,
        section_name,
        section_description
      });

      try {
        console.log('[gemini] ==================== LLM PROMPT DETAILS ====================');
        console.log('[gemini] Section-scoped:', !!section_name);
        if (section_name) {
          console.log('[gemini] Section name:', section_name);
          console.log('[gemini] Section description:', section_description);
        }
        console.log('[gemini] Full text length:', full_text.length, 'characters');
        console.log('[gemini] Full text preview (first 800 chars):\n', full_text.substring(0, 800));
        console.log('[gemini] Full text preview (last 800 chars):\n', full_text.substring(Math.max(0, full_text.length - 800)));
        console.log('[gemini] User prompt length:', userPrompt.length, 'characters');
        console.log('[gemini] ===============================================================');

        console.log('[gemini] Calling model for markdown lesson generation (NO JSON)...');
        const markdown = await callMarkdownModel(systemInstruction, userPrompt);
        console.log('[gemini] Markdown lesson received:', markdown.length, 'characters');
        console.log('[gemini] Markdown preview (first 500 chars):\n', markdown.substring(0, 500));

        console.log('[gemini] Parsing markdown lesson...');
        const normalized = parseMarkdownLesson(markdown, document_id);
        console.log('[gemini] Parsing successful - extracted', normalized.concepts.length, 'concepts');
        return normalized;
      } catch (error) {
        console.error('[gemini] ERROR in generateFullContextLesson:', error);
        console.error('[gemini] Error stack:', error.stack);
        throw error;
      }
    },
    /**
     * General-purpose text generation for check-in evaluation, etc.
     * Returns raw text response, not parsed JSON
     */
    async generateText(prompt) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }

      const modelName = process.env.GEMINI_GEN_MODEL || DEFAULT_MODEL;

      const GoogleGenerativeAI = await loadGoogleGenerativeAI();
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: 'You are a helpful AI assistant.',
        generationConfig: {
          temperature: 0.4
        }
      });

      const response = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: prompt }] }
        ]
      });

      return extractResponseText(response);
    },
    /**
     * Raw completion with custom system instruction and temperature
     * Used for section extraction and other specialized tasks
     * Returns parsed JSON
     */
    async generateRawCompletion({
      systemInstruction,
      userPrompt,
      temperature = 0.4
    } = {}) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }

      const modelName = process.env.GEMINI_GEN_MODEL || DEFAULT_MODEL;

      const GoogleGenerativeAI = await loadGoogleGenerativeAI();
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction || 'You are a helpful AI assistant.',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature
        }
      });

      const response = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: userPrompt }] }
        ]
      });

      const rawText = extractResponseText(response);
      return rawText; // Return raw text, caller will parse JSON
    }
  };
}

export function __resetGeminiLLMState() {
  sdkImportPromise = null;
}
