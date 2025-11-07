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

function buildFullContextLessonPrompt({
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

Always respond with valid JSON only. Prioritize completeness and exam readiness over brevity.`;

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
1. Set "topic" field to EXACTLY: "${section_name}"
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

Create a comprehensive, interactive learning experience that prepares students for exams. Follow these principles:

**PEDAGOGY:**
- Information completeness: Capture ALL testable content (formulas, definitions, procedures) ${section_name ? `FROM THIS SECTION ONLY` : ''}
- Hierarchical structure: Main concepts with sub-concepts for nested topics
- Progressive complexity: Build from fundamentals to advanced topics
- Active learning: Test understanding at multiple levels

**EXTRACTION PRIORITY:**
Extract and organize:
1. Definitions and terminology
2. Formulas and equations (with variable explanations)
3. Procedures and algorithms
4. Examples and worked problems
5. Comparisons and contrasts
6. Edge cases and limitations

**STRUCTURE:**

1. **High-Level Summary** (3-5 numbered bullets):
   - What this chapter covers
   - Why it matters / real-world relevance
   - What you'll be able to do after learning this

2. **Concepts** (6-10 key concepts that cover the most important testable material):

   **For Main Concepts** (broad topics that contain multiple sub-topics):
   - name: Main concept name
   - explanation: 4-6 sentences covering the core idea
   - key_details: Object containing:
     * formulas: Array of {formula: "equation", variables: "what each variable means"}
     * examples: Array of concrete examples or worked problems
     * important_notes: Array of critical points, edge cases, or common misconceptions
   - sub_concepts: Array of related sub-topics (2-4 sub-concepts if applicable)
   - mcqs: 2-3 integration questions testing the overall concept

   **For Sub-Concepts** (specific topics under a main concept):
   - name: Sub-concept name
   - explanation: 3-4 sentences focused on this specific aspect
   - key_details: Object with relevant formulas/examples/notes
   - mcqs: 1-2 targeted questions

   **For Standalone Concepts** (single focused topics):
   - name: Concept name
   - explanation: 3-5 sentences
   - key_details: Formulas/examples/notes as applicable
   - mcqs: 2 questions testing understanding

**MCQ REQUIREMENTS:**
- 4 options (A, B, C, D) per question
- ONE correct answer
- Each option needs an explanation:
  * Correct: Why it's right + key insight
  * Incorrect: Why it's wrong + what misconception this addresses
- Mix question types: definitional, conceptual, application, comparison
- Include calculation questions when relevant

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
      "name": "Main Concept Name",
      "is_main_concept": true,
      "explanation": "4-6 sentence comprehensive explanation with key terminology defined.",
      "key_details": {
        "formulas": [
          {"formula": "E = mc²", "variables": "E=energy, m=mass, c=speed of light"}
        ],
        "examples": [
          "Concrete example 1 with numbers/specifics",
          "Concrete example 2 showing different application"
        ],
        "important_notes": [
          "Critical limitation or edge case",
          "Common misconception to avoid"
        ]
      },
      "sub_concepts": [
        {
          "name": "Sub-Concept Name",
          "explanation": "3-4 sentences focused on this specific aspect.",
          "key_details": {
            "formulas": [],
            "examples": ["Example specific to sub-concept"],
            "important_notes": []
          },
          "mcqs": [
            {
              "question": "Question testing this sub-concept",
              "options": [
                {"letter": "A", "text": "Option text", "correct": false, "explanation": "Why wrong"},
                {"letter": "B", "text": "Option text", "correct": true, "explanation": "Why correct + insight"},
                {"letter": "C", "text": "Option text", "correct": false, "explanation": "Why wrong"},
                {"letter": "D", "text": "Option text", "correct": false, "explanation": "Why wrong"}
              ]
            }
          ]
        }
      ],
      "mcqs": [
        {
          "question": "Integration question testing overall concept",
          "options": [
            {"letter": "A", "text": "Option text", "correct": false, "explanation": "Why wrong"},
            {"letter": "B", "text": "Option text", "correct": true, "explanation": "Why correct"},
            {"letter": "C", "text": "Option text", "correct": false, "explanation": "Why wrong"},
            {"letter": "D", "text": "Option text", "correct": false, "explanation": "Why wrong"}
          ]
        }
      ]
    },
    {
      "name": "Standalone Concept",
      "is_main_concept": false,
      "explanation": "3-5 sentences.",
      "key_details": {
        "formulas": [],
        "examples": [],
        "important_notes": []
      },
      "mcqs": [
        {
          "question": "Question testing understanding",
          "options": [
            {"letter": "A", "text": "Option text", "correct": false, "explanation": "Why wrong"},
            {"letter": "B", "text": "Option text", "correct": true, "explanation": "Why correct"},
            {"letter": "C", "text": "Option text", "correct": false, "explanation": "Why wrong"},
            {"letter": "D", "text": "Option text", "correct": false, "explanation": "Why wrong"}
          ]
        }
      ]
    }
  ]
}

CRITICAL REMINDERS:
- Extract ALL testable content - don't summarize away important details
- Include ALL formulas with complete variable explanations
- Provide concrete examples with specifics (numbers, scenarios)
- Focus on 6-10 core concepts that capture the most testable material
- Use sub_concepts when a topic naturally breaks into multiple parts
- Every MCQ option needs a detailed explanation
- Base everything on the provided content
- Test understanding, not memorization
- IMPORTANT: Return ONLY valid JSON, no markdown code blocks, no explanatory text before or after
- Your entire response must be a single valid JSON object starting with { and ending with }`;

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

  // Helper function to process MCQs
  function processMCQs(mcqs, contextLabel) {
    return mcqs.map((mcq, mcqIdx) => {
      const question = requireString(mcq?.question, `${contextLabel} MCQ ${mcqIdx + 1} question`);
      const options = Array.isArray(mcq?.options) ? mcq.options : [];

      if (options.length !== 4) {
        throw new Error(`${contextLabel} MCQ ${mcqIdx + 1} must have exactly 4 options`);
      }

      // Validate each option has required fields
      const normalizedOptions = options.map((opt, optIdx) => {
        return {
          letter: requireString(opt?.letter, `${contextLabel} MCQ ${mcqIdx + 1} option ${optIdx + 1} letter`),
          text: requireString(opt?.text, `${contextLabel} MCQ ${mcqIdx + 1} option ${optIdx + 1} text`),
          correct: opt?.correct === true,
          explanation: requireString(opt?.explanation, `${contextLabel} MCQ ${mcqIdx + 1} option ${optIdx + 1} explanation`)
        };
      });

      // Ensure exactly one correct answer
      const correctCount = normalizedOptions.filter(opt => opt.correct).length;
      if (correctCount !== 1) {
        throw new Error(`${contextLabel} MCQ ${mcqIdx + 1} must have exactly 1 correct answer, found ${correctCount}`);
      }

      const correctOption = normalizedOptions.find(opt => opt.correct);

      return {
        question,
        options: normalizedOptions,
        expected_answer: correctOption.text,
        hint: '' // MCQs don't need hints since options have explanations
      };
    });
  }

  // Helper function to extract key_details
  function extractKeyDetails(concept) {
    const keyDetails = concept?.key_details || {};
    return {
      formulas: Array.isArray(keyDetails.formulas) ? keyDetails.formulas : [],
      examples: Array.isArray(keyDetails.examples) ? keyDetails.examples : [],
      important_notes: Array.isArray(keyDetails.important_notes) ? keyDetails.important_notes : []
    };
  }

  // Process concepts - flatten hierarchical structure
  const allCheckins = [];
  const normalizedConcepts = [];

  concepts.forEach((concept, idx) => {
    const name = requireString(concept?.name, `concept ${idx + 1} name`);
    const conceptExplanation = requireString(concept?.explanation, `concept ${idx + 1} explanation`);

    // Handle analogy (single string now, not array)
    const analogy = typeof concept.analogy === 'string' && concept.analogy.trim()
      ? concept.analogy.trim()
      : '';
    const analogies = analogy ? [analogy] : [];

    // Extract key_details
    const keyDetails = extractKeyDetails(concept);

    // Process MCQs from main concept
    const mcqs = Array.isArray(concept.mcqs) ? concept.mcqs : [];
    const checkIns = processMCQs(mcqs, `concept ${idx + 1}`);

    // Add main concept's check-ins to flat array
    checkIns.forEach(checkIn => {
      allCheckins.push({
        concept: name,
        question: checkIn.question,
        options: checkIn.options,
        expected_answer: checkIn.expected_answer,
        hint: checkIn.hint
      });
    });

    // Add main concept
    normalizedConcepts.push({
      name,
      explanation: conceptExplanation,
      analogies,
      examples: keyDetails.examples,
      formulas: keyDetails.formulas,
      important_notes: keyDetails.important_notes,
      is_main_concept: concept.is_main_concept === true,
      check_ins: checkIns
    });

    // Process sub_concepts if they exist
    const subConcepts = Array.isArray(concept.sub_concepts) ? concept.sub_concepts : [];
    subConcepts.forEach((subConcept, subIdx) => {
      const subName = requireString(subConcept?.name, `concept ${idx + 1} sub-concept ${subIdx + 1} name`);
      const subExplanation = requireString(subConcept?.explanation, `concept ${idx + 1} sub-concept ${subIdx + 1} explanation`);

      const subKeyDetails = extractKeyDetails(subConcept);

      // Process sub-concept MCQs
      const subMcqs = Array.isArray(subConcept.mcqs) ? subConcept.mcqs : [];
      const subCheckIns = processMCQs(subMcqs, `concept ${idx + 1} sub-concept ${subIdx + 1}`);

      // Add sub-concept's check-ins to flat array
      subCheckIns.forEach(checkIn => {
        allCheckins.push({
          concept: subName,
          question: checkIn.question,
          options: checkIn.options,
          expected_answer: checkIn.expected_answer,
          hint: checkIn.hint
        });
      });

      // Add sub-concept as a regular concept (flattened)
      normalizedConcepts.push({
        name: subName,
        explanation: subExplanation,
        analogies: [], // Sub-concepts don't have analogies in new structure
        examples: subKeyDetails.examples,
        formulas: subKeyDetails.formulas,
        important_notes: subKeyDetails.important_notes,
        is_main_concept: false,
        parent_concept: name, // Track which main concept this belongs to
        check_ins: subCheckIns
      });
    });
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
      include_check_ins = true,
      section_name,
      section_description
    } = {}) {
      if (!full_text || full_text.trim().length === 0) {
        throw new Error('Full text is required for lesson generation');
      }

      const { systemInstruction, userPrompt } = buildFullContextLessonPrompt({
        title,
        full_text,
        chapter,
        include_check_ins,
        section_name,
        section_description
      });

      try {
        console.log('[gemini] Calling model for full context lesson...');
        const lesson = await callModel(systemInstruction, userPrompt);
        console.log('[gemini] Raw lesson response:', JSON.stringify(lesson, null, 2));

        console.log('[gemini] Normalizing lesson payload...');
        const normalized = normalizeFullContextLessonPayload(lesson, document_id);
        console.log('[gemini] Normalization successful');
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
