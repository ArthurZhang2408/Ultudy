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
  const systemInstruction = `You are an expert educational content creator. Your role is to:
1. Read and understand full course materials (textbooks, lecture notes, etc.)
2. Break down complex topics into clear, digestible lessons
3. Create interactive check-in questions to verify understanding
4. Identify key concepts that students need to master

Always respond with valid JSON only.`;

  const userPrompt = `I'm studying from this material:

**Title:** ${title || 'Course Material'}
${chapter ? `**Chapter:** ${chapter}` : ''}

**Full Content:**
${full_text}

---

Please create a comprehensive, interactive lesson from this content. Follow these guidelines:

1. **Identify Concepts**: Extract 3-5 key concepts that a student needs to understand
2. **Structure**: Provide a clear summary, thorough explanation, helpful analogies, and worked examples
3. **Check-ins**: ${include_check_ins ? 'Create 2-3 check-in questions per concept to verify understanding' : 'Skip check-ins'}

Return a JSON object with this exact structure:
{
  "topic": "A clear, concise title for this lesson",
  "summary": "An engaging overview (200-300 words) of what will be covered",
  "explanation": "A detailed narrative (350-500 words) teaching the material step-by-step",
  "concepts": [
    {
      "name": "Concept name",
      "explanation": "Clear explanation of this concept (150-250 words)",
      "analogies": ["Analogy 1", "Analogy 2"],
      "examples": [
        {
          "setup": "Description of the example problem or scenario",
          "steps": ["Step 1", "Step 2", "Step 3..."]
        }
      ]
    }
  ],
  "checkins": [
    {
      "concept": "Which concept this checks",
      "question": "The check-in question",
      "hint": "A helpful hint without giving away the answer",
      "expected_answer": "What a correct answer should include"
    }
  ]
}

Important:
- Base everything ONLY on the provided content
- Make explanations clear and beginner-friendly
- Check-in questions should test understanding, not just memorization
- Provide hints that guide thinking without revealing answers`;

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

  const explanation = requireString(payload.explanation, 'explanation');

  const conceptCheckinMap = new Map();
  const checkins = Array.isArray(payload.checkins) ? payload.checkins : [];
  const normalizedCheckins = checkins.map((checkin, idx) => {
    const conceptName = requireString(checkin?.concept, `checkin ${idx + 1} concept`);
    const normalized = {
      concept: conceptName,
      question: requireString(checkin?.question, `checkin ${idx + 1} question`),
      hint: sanitizeText(checkin?.hint || ''),
      expected_answer: requireString(checkin?.expected_answer, `checkin ${idx + 1} expected_answer`)
    };

    const key = conceptName.trim().toLowerCase();
    if (!conceptCheckinMap.has(key)) {
      conceptCheckinMap.set(key, []);
    }
    conceptCheckinMap.get(key).push({
      question: normalized.question,
      expected_answer: normalized.expected_answer,
      hint: normalized.hint
    });

    return normalized;
  });

  const normalizedConcepts = concepts.map((concept, idx) => {
    const name = requireString(concept?.name, `concept ${idx + 1} name`);
    const analogies = Array.isArray(concept.analogies)
      ? concept.analogies.filter(a => typeof a === 'string' && a.trim()).slice(0, 3)
      : [];

    const examples = Array.isArray(concept.examples) ? concept.examples : [];
    const normalizedExamples = examples.map(ex => ({
      setup: requireString(ex?.setup, `concept ${idx + 1} example setup`),
      steps: requireStringArray(ex?.steps, 1, `concept ${idx + 1} example steps`)
    }));

    const checkInsFromConcept = Array.isArray(concept.check_ins)
      ? concept.check_ins
          .map((entry, checkIdx) => {
            try {
              return {
                question: requireString(entry?.question, `concept ${idx + 1} check_in ${checkIdx + 1} question`),
                expected_answer: requireString(entry?.expected_answer, `concept ${idx + 1} check_in ${checkIdx + 1} expected_answer`),
                hint: sanitizeText(entry?.hint || '')
              };
            } catch (error) {
              return null;
            }
          })
          .filter(Boolean)
      : [];

    const conceptKey = name.trim().toLowerCase();
    const mappedCheckIns = conceptCheckinMap.get(conceptKey);
    if (mappedCheckIns && mappedCheckIns.length) {
      checkInsFromConcept.push(...mappedCheckIns);
      conceptCheckinMap.delete(conceptKey);
    }

    return {
      name,
      explanation: requireString(concept?.explanation, `concept ${idx + 1} explanation`),
      analogies,
      examples: normalizedExamples,
      check_ins: checkInsFromConcept
    };
  });

  if (conceptCheckinMap.size > 0) {
    if (normalizedConcepts.length > 0) {
      const fallbackConcept = normalizedConcepts[0];
      for (const extra of conceptCheckinMap.values()) {
        fallbackConcept.check_ins.push(...extra);
      }
    } else {
      const extras = Array.from(conceptCheckinMap.values()).flat();
      if (extras.length) {
        normalizedConcepts.push({
          name: 'Lesson Check-ins',
          explanation,
          analogies: [],
          examples: [],
          check_ins: extras
        });
      }
    }
  }

  return {
    topic: requireString(payload.topic, 'topic'),
    summary: requireString(payload.summary, 'summary'),
    explanation,
    concepts: normalizedConcepts,
    checkins: normalizedCheckins,
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
    }
  };
}

export function __resetGeminiLLMState() {
  sdkImportPromise = null;
}
