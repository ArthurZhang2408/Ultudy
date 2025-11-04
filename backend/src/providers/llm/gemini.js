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

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error('Gemini LLM provider returned invalid JSON');
  }
}

async function callModel(systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required when using the gemini LLM provider');
  }

  const modelName = process.env.GEMINI_GEN_MODEL || DEFAULT_MODEL;

  const GoogleGenerativeAI = await loadGoogleGenerativeAI();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4
    }
  });

  const response = await model.generateContent({
    contents: [
      { role: 'user', parts: [{ text: userPrompt }] }
    ]
  });

  const text = extractResponseText(response);
  return parseJsonOutput(text);
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

function buildFullContextLessonPrompt({ title, full_text, chapter, include_check_ins }) {
  const systemInstruction = `You are an expert educational content creator specializing in bite-sized, interactive learning. Your role is to:
1. Read and understand full course materials
2. Break down complex topics into digestible, focused concepts
3. Create engaging, clear explanations (2-3 sentences max per concept)
4. Generate multiple-choice questions with detailed explanations

Always respond with valid JSON only. Keep explanations concise and avoid walls of text.`;

  const userPrompt = `I'm studying from this material:

**Title:** ${title || 'Course Material'}
${chapter ? `**Chapter:** ${chapter}` : ''}

**Full Content:**
${full_text}

---

Create an interactive, concept-by-concept learning experience. Follow these principles:

**PEDAGOGY:**
- Progressive disclosure: One concept at a time
- Concise explanations: 2-3 sentences max
- Immediate application: MCQs right after each concept
- Active learning: No passive reading

**STRUCTURE:**

1. **High-Level Summary** (3-5 numbered bullets):
   - What this chapter covers
   - Why it matters / real-world relevance
   - What you'll be able to do after learning this

2. **Concepts** (3-8 key concepts):
   For each concept, provide:
   - Short, focused explanation (2-3 sentences)
   - ONE simple analogy or real-world example
   - 3-4 MCQ questions testing understanding

**MCQ REQUIREMENTS:**
- 4 options (A, B, C, D) per question
- ONE correct answer
- Each option needs an explanation:
  * Correct: Why it's right + key insight
  * Incorrect: Why it's wrong + common misconception addressed
- Questions should test conceptual understanding, not memorization

Return JSON in this EXACT structure:
{
  "topic": "Clear title for this lesson",
  "summary": {
    "what": ["Bullet 1", "Bullet 2", "Bullet 3"],
    "why": "One sentence on why this matters",
    "outcome": "What you'll learn to do"
  },
  "concepts": [
    {
      "name": "Concept Name",
      "explanation": "2-3 sentence explanation. Be clear and concise.",
      "analogy": "One simple, relatable analogy",
      "mcqs": [
        {
          "question": "Clear question testing understanding",
          "options": [
            {
              "letter": "A",
              "text": "Option text",
              "correct": false,
              "explanation": "Why this is wrong + what misconception this represents"
            },
            {
              "letter": "B",
              "text": "Option text",
              "correct": true,
              "explanation": "Why this is correct + key insight"
            },
            {
              "letter": "C",
              "text": "Option text",
              "correct": false,
              "explanation": "Why this is wrong"
            },
            {
              "letter": "D",
              "text": "Option text",
              "correct": false,
              "explanation": "Why this is wrong"
            }
          ]
        }
      ]
    }
  ]
}

CRITICAL REMINDERS:
- Keep explanations SHORT (2-3 sentences)
- Every option needs an explanation
- Base everything on the provided content
- Test understanding, not memorization`;

  return { systemInstruction, userPrompt };
}

function normalizeFullContextLessonPayload(payload, document_id) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Gemini LLM provider returned an invalid lesson payload');
  }

  const concepts = Array.isArray(payload.concepts) ? payload.concepts : [];
  if (concepts.length === 0) {
    throw new Error('Gemini LLM provider returned no concepts');
  }

  // Parse new summary structure: {what: [], why: string, outcome: string}
  let summaryText = '';
  if (payload.summary && typeof payload.summary === 'object') {
    const summaryParts = [];

    if (Array.isArray(payload.summary.what) && payload.summary.what.length > 0) {
      summaryParts.push('What you\'ll learn:');
      payload.summary.what.forEach((item, idx) => {
        summaryParts.push(`${idx + 1}. ${item}`);
      });
    }

    if (typeof payload.summary.why === 'string' && payload.summary.why.trim()) {
      summaryParts.push('');
      summaryParts.push(`Why it matters: ${payload.summary.why.trim()}`);
    }

    if (typeof payload.summary.outcome === 'string' && payload.summary.outcome.trim()) {
      summaryParts.push('');
      summaryParts.push(`Learning outcome: ${payload.summary.outcome.trim()}`);
    }

    summaryText = summaryParts.join('\n');
  } else if (typeof payload.summary === 'string') {
    // Backward compatibility with old string summary
    summaryText = payload.summary;
  }

  // Build a combined explanation from all concept explanations
  const explanation = concepts
    .map((c, idx) => {
      const name = c?.name || `Concept ${idx + 1}`;
      const exp = c?.explanation || '';
      return `**${name}**: ${exp}`;
    })
    .join('\n\n');

  // Process concepts with MCQs
  const allCheckins = [];
  const normalizedConcepts = concepts.map((concept, idx) => {
    const name = requireString(concept?.name, `concept ${idx + 1} name`);
    const conceptExplanation = requireString(concept?.explanation, `concept ${idx + 1} explanation`);

    // Handle analogy (single string now, not array)
    const analogy = typeof concept.analogy === 'string' && concept.analogy.trim()
      ? concept.analogy.trim()
      : '';
    const analogies = analogy ? [analogy] : [];

    // Process MCQs from this concept
    const mcqs = Array.isArray(concept.mcqs) ? concept.mcqs : [];
    const checkIns = mcqs.map((mcq, mcqIdx) => {
      const question = requireString(mcq?.question, `concept ${idx + 1} MCQ ${mcqIdx + 1} question`);
      const options = Array.isArray(mcq?.options) ? mcq.options : [];

      if (options.length !== 4) {
        throw new Error(`concept ${idx + 1} MCQ ${mcqIdx + 1} must have exactly 4 options`);
      }

      // Validate each option has required fields
      const normalizedOptions = options.map((opt, optIdx) => {
        return {
          letter: requireString(opt?.letter, `concept ${idx + 1} MCQ ${mcqIdx + 1} option ${optIdx + 1} letter`),
          text: requireString(opt?.text, `concept ${idx + 1} MCQ ${mcqIdx + 1} option ${optIdx + 1} text`),
          correct: opt?.correct === true,
          explanation: requireString(opt?.explanation, `concept ${idx + 1} MCQ ${mcqIdx + 1} option ${optIdx + 1} explanation`)
        };
      });

      // Ensure exactly one correct answer
      const correctCount = normalizedOptions.filter(opt => opt.correct).length;
      if (correctCount !== 1) {
        throw new Error(`concept ${idx + 1} MCQ ${mcqIdx + 1} must have exactly 1 correct answer, found ${correctCount}`);
      }

      const correctOption = normalizedOptions.find(opt => opt.correct);

      return {
        question,
        options: normalizedOptions,
        expected_answer: correctOption.text,
        hint: '' // MCQs don't need hints since options have explanations
      };
    });

    // Add to flat checkins array for backward compatibility
    checkIns.forEach(checkIn => {
      allCheckins.push({
        concept: name,
        question: checkIn.question,
        options: checkIn.options,
        expected_answer: checkIn.expected_answer,
        hint: checkIn.hint
      });
    });

    return {
      name,
      explanation: conceptExplanation,
      analogies,
      examples: [], // No separate examples in new format
      check_ins: checkIns
    };
  });

  return {
    topic: requireString(payload.topic, 'topic'),
    summary: summaryText,
    explanation,
    concepts: normalizedConcepts,
    checkins: allCheckins,
    document_id
  };
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
      include_check_ins = true
    } = {}) {
      if (!full_text || full_text.trim().length === 0) {
        throw new Error('Full text is required for lesson generation');
      }

      const { systemInstruction, userPrompt } = buildFullContextLessonPrompt({
        title,
        full_text,
        chapter,
        include_check_ins
      });

      const lesson = await callModel(systemInstruction, userPrompt);
      return normalizeFullContextLessonPayload(lesson, document_id);
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
    }
  };
}

export function __resetGeminiLLMState() {
  sdkImportPromise = null;
}
