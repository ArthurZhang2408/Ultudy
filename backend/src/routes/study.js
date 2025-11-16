import express from 'express';
import createSearchService from '../search/service.js';
import createStudyService from '../study/service.js';
import { evaluateAnswer, updateConceptMastery } from '../study/checkin.service.js';
import { createTenantHelpers } from '../db/tenant.js';
import { extractSections, extractSectionText } from '../study/section.service.js';

const DEFAULT_LESSON_K = 6;
const DEFAULT_MCQ_COUNT = 5;
const MAX_CHUNK_LIMIT = 12;
const ALLOWED_DIFFICULTIES = new Set(['easy', 'med', 'hard']);
const VALID_SESSION_TYPES = new Set(['lesson', 'practice', 'review', 'flashcards']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEAK_AREA_ACCURACY_THRESHOLD = 0.5;
const WEAK_AREA_MIN_ATTEMPTS = 2;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function normalizeLimit(value, fallback, cap = MAX_CHUNK_LIMIT) {
  if (Number.isFinite(value) && value > 0) {
    return Math.min(Math.floor(value), cap);
  }
  return fallback;
}

function ensureSearchText(topic, query) {
  if (typeof query === 'string' && query.trim()) {
    return query.trim();
  }

  if (typeof topic === 'string' && topic.trim()) {
    return topic.trim();
  }

  return null;
}

function mapChunksWithTopic(chunks, topic) {
  if (!topic) {
    return chunks;
  }
  return chunks.map((chunk) => ({ ...chunk, topic }));
}

function parseJsonColumn(value, fallback = []) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'object') {
    return value;
  }

  return fallback;
}

function normalizeCheckInEntry(entry) {
  const question = typeof entry?.question === 'string' ? entry.question.trim() : '';
  const expectedAnswer = typeof entry?.expected_answer === 'string' ? entry.expected_answer.trim() : '';

  if (!question || !expectedAnswer) {
    return null;
  }

  const hint = typeof entry?.hint === 'string' ? entry.hint.trim() : '';

  // Preserve options array for MCQ-based check-ins
  const result = {
    question,
    expected_answer: expectedAnswer,
    hint
  };

  // If this is an MCQ (has options array), include it
  if (Array.isArray(entry?.options)) {
    result.options = entry.options;
  }

  return result;
}

function attachCheckinsToConcepts(conceptsInput = [], checkins = []) {
  const normalizedConcepts = Array.isArray(conceptsInput)
    ? conceptsInput.map((concept) => {
        const baseCheckIns = Array.isArray(concept?.check_ins)
          ? concept.check_ins.map((entry) => normalizeCheckInEntry(entry)).filter(Boolean)
          : [];

        return {
          ...concept,
          check_ins: baseCheckIns
        };
      })
    : [];

  if (!Array.isArray(checkins) || checkins.length === 0) {
    return normalizedConcepts;
  }

  const conceptLookup = new Map();
  normalizedConcepts.forEach((concept) => {
    if (typeof concept?.name === 'string' && concept.name.trim()) {
      conceptLookup.set(concept.name.trim().toLowerCase(), concept);
    }
  });

  const additionalConcepts = new Map();

  checkins.forEach((checkin) => {
    const normalized = normalizeCheckInEntry(checkin);
    if (!normalized) {
      return;
    }

    const rawConceptName = typeof checkin?.concept === 'string' ? checkin.concept.trim() : '';

    if (rawConceptName) {
      const key = rawConceptName.toLowerCase();
      if (conceptLookup.has(key)) {
        const target = conceptLookup.get(key);
        const hasDuplicate = target.check_ins.some((existing) =>
          existing.question === normalized.question && existing.expected_answer === normalized.expected_answer
        );
        if (!hasDuplicate) {
          target.check_ins.push(normalized);
        }
        return;
      }

      if (additionalConcepts.has(key)) {
        additionalConcepts.get(key).check_ins.push(normalized);
        return;
      }

      additionalConcepts.set(key, {
        name: rawConceptName,
        explanation: '',
        analogies: [],
        examples: [],
        check_ins: [normalized]
      });
      return;
    }

    if (normalizedConcepts.length > 0) {
      normalizedConcepts[0].check_ins.push(normalized);
      return;
    }

    if (!additionalConcepts.has('general')) {
      additionalConcepts.set('general', {
        name: 'General Check-ins',
        explanation: '',
        analogies: [],
        examples: [],
        check_ins: []
      });
    }

    additionalConcepts.get('general').check_ins.push(normalized);
  });

  return normalizedConcepts.concat(Array.from(additionalConcepts.values()));
}

function buildLessonResponse(row, fallbackCheckins = []) {
  if (!row) {
    return null;
  }

  const analogies = parseJsonColumn(row.analogies, []);
  const examples = parseJsonColumn(row.examples, []);
  const conceptsInput = parseJsonColumn(row.concepts, []);
  const concepts = attachCheckinsToConcepts(conceptsInput, fallbackCheckins);

  const checkins = [];
  concepts.forEach((concept) => {
    const conceptName = typeof concept?.name === 'string' && concept.name.trim() ? concept.name : 'Concept';
    const conceptCheckIns = Array.isArray(concept?.check_ins) ? concept.check_ins : [];

    conceptCheckIns.forEach((entry) => {
      const normalized = normalizeCheckInEntry(entry);
      if (normalized) {
        checkins.push({
          concept: conceptName,
          question: normalized.question,
          expected_answer: normalized.expected_answer,
          hint: normalized.hint
        });
      }
    });
  });

  return {
    ...row,
    analogies,
    examples,
    concepts,
    checkins,
    check_ins: checkins
  };
}

export default function createStudyRouter(options = {}) {
  const router = express.Router();
  const searchService = options.searchService ||
    createSearchService({
      pool: options.pool,
      embeddingsProviderFactory: options.embeddingsProviderFactory
    });
  const studyService = options.studyService ||
    createStudyService({
      llmProviderFactory: options.llmProviderFactory
    });
  const tenantHelpers = options.tenantHelpers ||
    (options.pool ? createTenantHelpers(options.pool) : null);

  if (!tenantHelpers) {
    throw new Error('Tenant helpers are required for study routes');
  }

  // Legacy RAG-based lesson endpoint (keep for backward compatibility)
  router.post('/study/lesson', async (req, res) => {
    const { topic, query, k } = req.body || {};
    const searchText = ensureSearchText(topic, query);

    if (!searchText) {
      res.status(400).json({ error: 'Either topic or query must be provided.' });
      return;
    }

    const limit = normalizeLimit(k, DEFAULT_LESSON_K);
    const ownerId = req.userId;

    try {
      const chunks = await tenantHelpers.withTenant(ownerId, (client) =>
        searchService.searchChunks(searchText, limit, ownerId, client)
      );
      const lesson = await studyService.buildLesson(chunks, { topic, query: searchText });
      res.json(lesson);
    } catch (error) {
      console.error('Failed to build lesson', error);
      res.status(500).json({ error: 'Failed to build lesson' });
    }
  });

  // GET /lessons - Fetch existing lesson by section_id
  router.get('/lessons', async (req, res) => {
    const { section_id } = req.query;
    const ownerId = req.userId;

    if (!section_id) {
      return res.status(400).json({ error: 'section_id is required' });
    }

    try {
      await tenantHelpers.withTenant(ownerId, async (client) => {
        const result = await client.query(
          `SELECT * FROM lessons
           WHERE owner_id = $1 AND section_id = $2
           LIMIT 1`,
          [ownerId, section_id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Lesson not found' });
        }

        const lesson = buildLessonResponse(result.rows[0], []);
        res.json({ lesson });
      });
    } catch (error) {
      console.error('[GET /lessons] Error:', error);
      res.status(500).json({ error: 'Failed to fetch lesson' });
    }
  });

  // MVP v1.0: Full-context lesson generation from document (ASYNC)
  // IMPORTANT: Generates lesson ONCE and persists it. No re-generation!
  // Now supports section-scoped generation for multi-layer structure
  // Returns immediately with a job ID, processing happens in background
  router.post('/lessons/generate', async (req, res) => {
    const { document_id, section_id, chapter, include_check_ins = true, priority = 'normal' } = req.body || {};
    const ownerId = req.userId;

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🎓 LESSON GENERATION REQUEST (ASYNC)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('document_id:', document_id);
    console.log('section_id:', section_id);
    console.log('chapter:', chapter);
    console.log('SCOPED:', section_id ? '✅ SECTION-SCOPED' : '❌ DOCUMENT-SCOPED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required' });
    }

    try {
      // Rate limiting check
      if (options.checkRateLimit) {
        const rateLimitResult = await options.checkRateLimit(ownerId, 'lesson');
        if (!rateLimitResult.allowed) {
          return res.status(429).json({
            error: 'Too many lesson generation requests',
            limit: rateLimitResult.limit,
            retryAfter: rateLimitResult.retryAfter
          });
        }
        // Only set headers if rate limiting is actually enabled
        if (rateLimitResult.limit !== undefined) {
          res.setHeader('X-RateLimit-Limit', rateLimitResult.limit);
          res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
        }
      }
      // Step 1: Check if lesson already exists (quick check before queuing)
      const existingLesson = await tenantHelpers.withTenant(ownerId, async (client) => {
        let query, params;
        if (section_id) {
          query = `SELECT id FROM lessons WHERE section_id = $1 AND owner_id = $2 LIMIT 1`;
          params = [section_id, ownerId];
        } else {
          query = `SELECT id FROM lessons WHERE document_id = $1 AND owner_id = $2 AND section_id IS NULL LIMIT 1`;
          params = [document_id, ownerId];
        }

        const { rows } = await client.query(query, params);
        return rows.length > 0 ? rows[0].id : null;
      });

      if (existingLesson) {
        console.log(`[lessons/generate] Lesson already exists, fetching full data`);

        // Fetch full lesson data for backwards compatibility with tests
        const fullLesson = await tenantHelpers.withTenant(ownerId, async (client) => {
          const { rows } = await client.query(
            `SELECT * FROM lessons WHERE id = $1 AND owner_id = $2`,
            [existingLesson, ownerId]
          );
          return rows.length > 0 ? buildLessonResponse(rows[0], []) : null;
        });

        if (fullLesson) {
          return res.json(fullLesson);
        }
      }

      // Step 2: Create job and queue for background processing
      const jobId = await options.jobTracker.createJob(ownerId, 'generate_lesson', {
        document_id,
        section_id: section_id || null,
        chapter,
        include_check_ins
      });

      // Queue the job (in CI/test mode, this will process synchronously via mock queue)
      // Priority: 1 = high, 2 = normal (default), 3 = low
      const priorityValue = priority === 'high' ? 1 : priority === 'low' ? 3 : 2;

      await options.lessonQueue.add({
        jobId,
        ownerId,
        document_id,
        section_id,
        chapter,
        include_check_ins
      }, {
        priority: priorityValue
      });

      console.log(`[lessons/generate] ✅ Job ${jobId} queued (priority: ${priority})`);

      // In test/CI mode, job was processed synchronously - fetch and return the lesson
      const isTestMode = process.env.CI === 'true' || process.env.DISABLE_QUEUES === 'true';
      if (isTestMode) {
        const generatedLesson = await tenantHelpers.withTenant(ownerId, async (client) => {
          let query, params;
          if (section_id) {
            query = `SELECT * FROM lessons WHERE section_id = $1 AND owner_id = $2 LIMIT 1`;
            params = [section_id, ownerId];
          } else {
            query = `SELECT * FROM lessons WHERE document_id = $1 AND owner_id = $2 AND section_id IS NULL LIMIT 1`;
            params = [document_id, ownerId];
          }

          const { rows } = await client.query(query, params);
          if (rows.length > 0) {
            console.log(`[lessons/generate] Raw DB row concepts (first):`, JSON.stringify(rows[0].concepts?.slice(0, 1)));
            if (rows[0].concepts && rows[0].concepts.length > 0) {
              console.log(`[lessons/generate] Raw DB first concept has check_ins:`, Array.isArray(rows[0].concepts[0].check_ins));
              if (Array.isArray(rows[0].concepts[0].check_ins)) {
                console.log(`[lessons/generate] Raw DB check_ins count:`, rows[0].concepts[0].check_ins.length);
              }
            }
          }
          return rows.length > 0 ? buildLessonResponse(rows[0], []) : null;
        });

        if (generatedLesson) {
          console.log(`[lessons/generate] Returning generated lesson (test mode)`);
          console.log(`[lessons/generate] Generated lesson has ${generatedLesson.concepts?.length || 0} concepts`);
          if (generatedLesson.concepts && generatedLesson.concepts.length > 0) {
            console.log(`[lessons/generate] First concept check_ins:`, JSON.stringify(generatedLesson.concepts[0].check_ins));
          }
          console.log(`[lessons/generate] Flat check_ins array length:`, generatedLesson.check_ins?.length || 0);
          return res.json(generatedLesson);
        }
      }

      // Production mode: Return immediately with job ID
      return res.json({
        job_id: jobId,
        status: 'queued',
        message: 'Lesson generation queued'
      });
    } catch (error) {
      console.error('Failed to queue lesson generation', error);
      res.status(500).json({
        error: 'Failed to queue lesson generation',
        details: error.message
      });
    }
  });

  router.post('/practice/mcq', async (req, res) => {
    const { topic, n, difficulty } = req.body || {};

    if (difficulty && !ALLOWED_DIFFICULTIES.has(difficulty)) {
      res.status(400).json({ error: 'Invalid difficulty. Use easy, med, or hard.' });
      return;
    }

    const safeTopic = typeof topic === 'string' && topic.trim() ? topic.trim() : null;
    const searchText = safeTopic || 'study practice';
    const ownerId = req.userId;
    const questionCount = normalizeLimit(n, DEFAULT_MCQ_COUNT, 20);
    const chunkLimit = normalizeLimit(Math.max(questionCount, DEFAULT_LESSON_K), DEFAULT_LESSON_K);

    try {
      const chunks = await tenantHelpers.withTenant(ownerId, (client) =>
        searchService.searchChunks(searchText, chunkLimit, ownerId, client)
      );
      const annotatedChunks = mapChunksWithTopic(chunks, safeTopic || 'practice focus');
      const result = await studyService.makeMCQs(annotatedChunks, questionCount, difficulty || 'med');
      res.json(result);
    } catch (error) {
      console.error('Failed to generate MCQs', error);
      res.status(500).json({ error: 'Failed to generate MCQs' });
    }
  });

  // DEPRECATED ENDPOINT: Legacy section extraction for old documents
  // This endpoint is only for documents created with old Python-based extraction (having full_text).
  // Modern documents uploaded via /upload/pdf-structured already have sections created during upload.
  // This endpoint will be removed once all legacy documents are migrated.
  router.post('/sections/generate', async (req, res) => {
    console.warn('[DEPRECATED] POST /sections/generate is deprecated. Modern uploads create sections automatically.');

    const { document_id, chapter, force_llm = false } = req.body || {};
    const ownerId = req.userId;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required' });
    }

    try {
      const sections = await tenantHelpers.withTenant(ownerId, async (client) => {
        // Step 1: Check if sections already exist for this document
        const { rows: existingSections } = await client.query(
          `SELECT id, section_number, name, description, page_start, page_end, concepts_generated, created_at
           FROM sections
           WHERE document_id = $1 AND owner_id = $2
           ORDER BY section_number ASC`,
          [document_id, ownerId]
        );

        if (existingSections.length > 0) {
          console.log(`[sections/generate] Returning ${existingSections.length} cached sections for document ${document_id}`);
          return existingSections;
        }

        // Step 2: Load full document text
        const { rows } = await client.query(
          `SELECT id, title, full_text, material_type, chapter as doc_chapter, course_id
           FROM documents
           WHERE id = $1 AND owner_id = $2`,
          [document_id, ownerId]
        );

        if (rows.length === 0) {
          throw new Error('Document not found');
        }

        const document = rows[0];

        // Note: /sections/generate is for OLD python-based extraction
        // NEW vision-based extraction creates sections directly during upload
        if (!document.full_text) {
          throw new Error('This endpoint is only for documents with full_text (old Python extraction). Documents uploaded with vision-based extraction already have sections.');
        }

        // Step 3: Extract sections using service (TOC or LLM)
        console.log(`[sections/generate] Extracting sections for document ${document_id}`);
        const extractedSections = await extractSections({
          full_text: document.full_text,
          title: document.title,
          material_type: document.material_type
        }, { forceLLM: force_llm });

        console.log(`[sections/generate] Extracted sections:`, extractedSections.map(s => ({
          section_number: s.section_number,
          name: s.name,
          page_start: s.page_start,
          page_end: s.page_end
        })));

        // Step 4: Persist sections to database
        const insertedSections = [];
        for (const section of extractedSections) {
          const { rows: inserted } = await client.query(
            `INSERT INTO sections (owner_id, document_id, course_id, chapter, section_number, name, description, page_start, page_end, markdown_text, concepts_generated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
             RETURNING id, section_number, name, description, page_start, page_end, concepts_generated, created_at`,
            [
              ownerId,
              document_id,
              document.course_id,
              chapter || document.doc_chapter,
              section.section_number,
              section.name,
              section.description,
              section.page_start,
              section.page_end,
              section.markdown_text || null
            ]
          );
          insertedSections.push(inserted[0]);
        }

        console.log(`[sections/generate] Created ${insertedSections.length} sections`);
        return insertedSections;
      });

      // Add deprecation headers
      res.set('Deprecation', 'true');
      res.set('Sunset', 'Wed, 31 Dec 2025 23:59:59 GMT');
      res.json({ sections });
    } catch (error) {
      console.error('[sections/generate] Error:', error);
      const errorMessage = error.message || 'Failed to generate sections';
      const statusCode = error.message?.includes('not found') ? 404 : 500;
      res.status(statusCode).json({ error: errorMessage });
    }
  });

  // Get sections for a document
  router.get('/sections', async (req, res) => {
    const { document_id } = req.query;
    const ownerId = req.userId;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required' });
    }

    try {
      const sections = await tenantHelpers.withTenant(ownerId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, section_number, name, description, page_start, page_end, concepts_generated, created_at
           FROM sections
           WHERE document_id = $1 AND owner_id = $2
           ORDER BY section_number ASC`,
          [document_id, ownerId]
        );
        return rows;
      });

      res.json({ sections });
    } catch (error) {
      console.error('[sections/get] Error:', error);
      res.status(500).json({ error: 'Failed to retrieve sections' });
    }
  });

  // Delete a cached lesson (useful for regenerating with new format)
  router.delete('/lessons/:lesson_id', async (req, res) => {
    const { lesson_id } = req.params;
    const ownerId = req.userId;

    if (!lesson_id) {
      return res.status(400).json({ error: 'lesson_id is required' });
    }

    try {
      await tenantHelpers.withTenant(ownerId, async (client) => {
        const result = await client.query(
          `DELETE FROM lessons WHERE id = $1 AND owner_id = $2`,
          [lesson_id, ownerId]
        );

        if (result.rowCount === 0) {
          throw new Error('Lesson not found or you do not have permission to delete it');
        }
      });

      res.json({ success: true, message: 'Lesson deleted successfully' });
    } catch (error) {
      console.error('Failed to delete lesson', error);
      res.status(500).json({ error: error.message || 'Failed to delete lesson' });
    }
  });

  // MVP v1.0: Check-in submission and mastery tracking
  router.post('/check-ins/submit', async (req, res) => {
    const {
      concept_id,
      concept_name,
      course_id,
      chapter,
      document_id,
      question,
      user_answer,
      expected_answer,
      context,
      evaluation_mode,
      mcq
    } = req.body || {};

    const ownerId = req.userId;

    // Validate required fields
    if (!concept_name) {
      return res.status(400).json({ error: 'concept_name is required' });
    }

    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    if (!user_answer || typeof user_answer !== 'string' || !user_answer.trim()) {
      return res.status(400).json({ error: 'user_answer is required and must be non-empty' });
    }

    if (!expected_answer) {
      return res.status(400).json({ error: 'expected_answer is required' });
    }

    try {
      const normalizedContext = context || '';
      const mode = typeof evaluation_mode === 'string' ? evaluation_mode.toLowerCase() : 'llm';

      let evaluation;

      if (mode === 'mcq') {
        const mcqInfo = typeof mcq === 'object' && mcq !== null ? mcq : {};
        const selectedLetter = typeof mcqInfo.selected_letter === 'string'
          ? mcqInfo.selected_letter.trim().toUpperCase()
          : user_answer.trim().toUpperCase();
        const correctLetter = typeof mcqInfo.correct_letter === 'string'
          ? mcqInfo.correct_letter.trim().toUpperCase()
          : '';
        const selectedText = typeof mcqInfo.selected_text === 'string'
          ? mcqInfo.selected_text.trim()
          : user_answer.trim();
        const correctText = typeof mcqInfo.correct_text === 'string'
          ? mcqInfo.correct_text.trim()
          : expected_answer;
        const isCorrect = selectedLetter && correctLetter
          ? selectedLetter === correctLetter
          : selectedText.toLowerCase() === correctText.toLowerCase();

        const correctExplanation = typeof mcqInfo.correct_explanation === 'string'
          ? mcqInfo.correct_explanation.trim()
          : '';
        const selectedExplanation = typeof mcqInfo.selected_explanation === 'string'
          ? mcqInfo.selected_explanation.trim()
          : '';

        evaluation = {
          correct: isCorrect,
          score: isCorrect ? 100 : 0,
          feedback: isCorrect
            ? (selectedExplanation || 'Great job! You chose the correct answer.')
            : (correctExplanation || 'Not quite. Review the explanation and try again.'),
          keyPoints: isCorrect && correctExplanation ? [correctExplanation] : [],
          misconceptions: isCorrect
            ? []
            : (selectedExplanation ? [selectedExplanation] : [])
        };
      } else {
        // Evaluate the answer using LLM
        evaluation = await evaluateAnswer({
          question,
          userAnswer: user_answer.trim(),
          expectedAnswer: expected_answer,
          concept: concept_name,
          context: normalizedContext
        });
      }

      // Update concept mastery in database
      const masteryUpdate = await tenantHelpers.withTenant(ownerId, (client) =>
        updateConceptMastery(client, {
          conceptId: concept_id || null,
          conceptName: concept_name,
          ownerId,
          courseId: course_id || null,
          chapter: chapter || 'General',
          documentId: document_id || null,
          wasCorrect: evaluation.correct
        })
      );

      // Return evaluation + mastery update
      res.json({
        correct: evaluation.correct,
        score: evaluation.score,
        feedback: evaluation.feedback,
        key_points: evaluation.keyPoints,
        misconceptions: evaluation.misconceptions,
        mastery_update: {
          concept_id: masteryUpdate.conceptId,
          concept: concept_name,
          old_state: masteryUpdate.oldState,
          new_state: masteryUpdate.newState,
          total_attempts: masteryUpdate.totalAttempts,
          correct_attempts: masteryUpdate.correctAttempts,
          consecutive_correct: masteryUpdate.consecutiveCorrect,
          accuracy_percent: masteryUpdate.accuracyPercent
        }
      });
    } catch (error) {
      console.error('Failed to submit check-in', error);

      // Provide more detailed error messages
      let errorMessage = 'Failed to evaluate check-in answer';
      let errorDetails = null;

      if (error.message) {
        if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
          errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
          errorDetails = 'The AI service is temporarily unavailable due to high usage.';
        } else if (error.message.includes('API key')) {
          errorMessage = 'API configuration error';
          errorDetails = 'Please contact support.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }

      res.status(500).json({
        error: errorMessage,
        details: errorDetails,
        type: error.status === 429 ? 'rate_limit' : 'evaluation_error'
      });
    }
  });

  // POST /study-sessions/start - Start a new study session
  router.post('/study-sessions/start', async (req, res) => {
    const ownerId = req.userId;
    const { session_type, chapter, document_id, course_id } = req.body;

    if (!session_type || typeof session_type !== 'string') {
      return res.status(400).json({ error: 'session_type is required' });
    }

    const normalizedType = session_type.toLowerCase();
    if (!VALID_SESSION_TYPES.has(normalizedType)) {
      return res.status(400).json({ error: 'Invalid session_type' });
    }

    if (chapter && typeof chapter !== 'string') {
      return res.status(400).json({ error: 'chapter must be a string if provided' });
    }

    const trimmedChapter = typeof chapter === 'string' ? chapter.trim() : null;
    if (trimmedChapter && trimmedChapter.length > 120) {
      return res.status(400).json({ error: 'chapter must be 120 characters or fewer' });
    }

    if (document_id && !isValidUUID(document_id)) {
      return res.status(400).json({ error: 'Invalid document_id format' });
    }

    if (course_id && !isValidUUID(course_id)) {
      return res.status(400).json({ error: 'Invalid course_id format' });
    }

    try {
      let sessionId;

      await tenantHelpers.withTenant(ownerId, async (client) => {
        if (document_id) {
          const documentCheck = await client.query(
            'SELECT 1 FROM documents WHERE id = $1 AND owner_id = $2',
            [document_id, ownerId]
          );

          if (documentCheck.rowCount === 0) {
            throw new HttpError(400, 'Document not found');
          }
        }

        if (course_id) {
          const courseCheck = await client.query(
            'SELECT 1 FROM courses WHERE id = $1 AND owner_id = $2',
            [course_id, ownerId]
          );

          if (courseCheck.rowCount === 0) {
            throw new HttpError(400, 'Course not found');
          }
        }

        const { rows } = await client.query(
          `INSERT INTO study_sessions
           (owner_id, session_type, chapter, document_id, course_id, started_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           RETURNING id, started_at`,
          [ownerId, normalizedType, trimmedChapter || null, document_id || null, course_id || null]
        );

        sessionId = rows[0].id;
        console.log(`[study-sessions] Started session ${sessionId} for user ${ownerId}`);
      });

      res.json({
        session_id: sessionId,
        message: 'Study session started'
      });
    } catch (error) {
      console.error('Failed to start study session', error);
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
      } else {
        res.status(500).json({
          error: 'Failed to start study session',
          detail: error.message
        });
      }
    }
  });

  // POST /study-sessions/:id/track-checkin - Track a check-in in the current session
  router.post('/study-sessions/:id/track-checkin', async (req, res) => {
    const ownerId = req.userId;
    const { id: sessionId } = req.params;
    const { correct, concept_id } = req.body;

    if (typeof correct !== 'boolean') {
      return res.status(400).json({ error: 'correct (boolean) is required' });
    }

    if (concept_id && !isValidUUID(concept_id)) {
      return res.status(400).json({ error: 'Invalid concept_id format' });
    }

    try {
      await tenantHelpers.withTenant(ownerId, async (client) => {
        // Update session stats
        await client.query(
          `UPDATE study_sessions
           SET total_check_ins = total_check_ins + 1,
               correct_check_ins = correct_check_ins + $3
           WHERE id = $1 AND owner_id = $2`,
          [sessionId, ownerId, correct ? 1 : 0]
        );

        // Optionally track which concepts were covered
        if (concept_id) {
          await client.query(
            `UPDATE study_sessions
             SET concepts_covered = array_append(
               COALESCE(concepts_covered, ARRAY[]::uuid[]),
               $1::uuid
             )
             WHERE id = $2 AND owner_id = $3
             AND NOT ($1::uuid = ANY(COALESCE(concepts_covered, ARRAY[]::uuid[])))`,
            [concept_id, sessionId, ownerId]
          );
        }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to track check-in', error);
      res.status(500).json({
        error: 'Failed to track check-in',
        detail: error.message
      });
    }
  });

  // POST /study-sessions/:id/complete - Complete a study session
  router.post('/study-sessions/:id/complete', async (req, res) => {
    const ownerId = req.userId;
    const { id: sessionId } = req.params;

    try {
      const result = await tenantHelpers.withTenant(ownerId, async (client) => {
        // Calculate duration and mark as completed
        const { rows } = await client.query(
          `UPDATE study_sessions
           SET completed_at = NOW(),
               duration_minutes = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60
           WHERE id = $1 AND owner_id = $2 AND completed_at IS NULL
           RETURNING duration_minutes, total_check_ins, correct_check_ins`,
          [sessionId, ownerId]
        );

        if (rows.length === 0) {
          const existing = await client.query(
            'SELECT completed_at FROM study_sessions WHERE id = $1 AND owner_id = $2',
            [sessionId, ownerId]
          );

          if (existing.rowCount > 0 && existing.rows[0].completed_at) {
            throw new HttpError(409, 'Session already completed');
          }

          throw new HttpError(404, 'Session not found');
        }

        const session = rows[0];
        console.log(
          `[study-sessions] Completed session ${sessionId}: ${Math.round(session.duration_minutes)} minutes, ` +
          `${session.correct_check_ins}/${session.total_check_ins} correct`
        );

        return {
          success: true,
          duration_minutes: Math.round(session.duration_minutes),
          total_check_ins: session.total_check_ins,
          correct_check_ins: session.correct_check_ins
        };
      });

      res.json(result);
    } catch (error) {
      console.error('Failed to complete study session', error);
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
      } else {
        res.status(500).json({
          error: 'Failed to complete study session',
          detail: error.message
        });
      }
    }
  });

  // GET /progress/overview - Get user's overall progress dashboard
  router.get('/progress/overview', async (req, res) => {
    const ownerId = req.userId;
    const { course_id, document_id } = req.query;

    try {
      await tenantHelpers.withTenant(ownerId, async (client) => {
        const buildFilters = (alias = '') => {
          const prefix = alias ? `${alias}.` : '';
          const params = [ownerId];
          const conditions = [`${prefix}owner_id = $1`];

          if (course_id) {
            params.push(course_id);
            conditions.push(`${prefix}course_id = $${params.length}`);
          }

          if (document_id) {
            params.push(document_id);
            conditions.push(`${prefix}document_id = $${params.length}`);
          }

          return {
            whereClause: conditions.join(' AND '),
            params
          };
        };

        // 1. Fetch all concepts with mastery data
        const conceptFilters = buildFilters('cpt');
        const conceptsResult = await client.query(
          `SELECT
            cpt.id,
            cpt.name,
            cpt.chapter,
            cpt.course_id,
            cpt.section_id,
            cpt.concept_number,
            cpt.mastery_state,
            cpt.total_attempts,
            cpt.correct_attempts,
            cpt.consecutive_correct,
            cpt.last_reviewed_at,
            cpt.created_at,
            COALESCE(crs.name, 'Unassigned Course') AS course_name
           FROM concepts cpt
           LEFT JOIN courses crs ON cpt.course_id = crs.id
           WHERE ${conceptFilters.whereClause}
           ORDER BY cpt.course_id NULLS LAST, cpt.chapter, cpt.section_id NULLS LAST, cpt.concept_number NULLS LAST, cpt.name`,
          conceptFilters.params
        );

        const concepts = conceptsResult.rows;

        // 2. Group concepts by chapter and calculate mastery percentage
        const byChapter = {};
        const byCourse = {};
        let totalConcepts = 0;
        let masteredConcepts = 0;
        let understoodConcepts = 0;

        concepts.forEach(concept => {
          const chapter = concept.chapter || 'Uncategorized';
          const courseKey = concept.course_id || 'uncategorized';
          const courseName = concept.course_name || 'Unassigned Course';

          if (!byChapter[chapter]) {
            byChapter[chapter] = {
              concepts: [],
              total: 0,
              mastered: 0,
              understood: 0,
              needs_review: 0,
              not_learned: 0
            };
          }

          if (!byCourse[courseKey]) {
            byCourse[courseKey] = {
              course_id: concept.course_id || null,
              course_name: courseName,
              total: 0,
              mastered: 0,
              understood: 0,
              needs_review: 0,
              not_learned: 0,
              chapters: {}
            };
          }

          const courseEntry = byCourse[courseKey];

          if (!courseEntry.chapters[chapter]) {
            courseEntry.chapters[chapter] = {
              concepts: [],
              total: 0,
              mastered: 0,
              understood: 0,
              needs_review: 0,
              not_learned: 0,
              percentage: 0
            };
          }

          const chapterEntry = courseEntry.chapters[chapter];

          byChapter[chapter].concepts.push({
            id: concept.id,
            name: concept.name,
            section_id: concept.section_id,
            concept_number: concept.concept_number,
            mastery_state: concept.mastery_state,
            total_attempts: concept.total_attempts,
            correct_attempts: concept.correct_attempts,
            accuracy: concept.total_attempts > 0
              ? Math.round((concept.correct_attempts / concept.total_attempts) * 100)
              : 0,
            last_reviewed_at: concept.last_reviewed_at
          });

          byChapter[chapter].total++;
          totalConcepts++;
          courseEntry.total++;
          chapterEntry.total++;

          // Count by mastery state
          if (concept.mastery_state === 'mastered') {
            byChapter[chapter].mastered++;
            masteredConcepts++;
            courseEntry.mastered++;
            chapterEntry.mastered++;
          } else if (concept.mastery_state === 'understood') {
            byChapter[chapter].understood++;
            understoodConcepts++;
            courseEntry.understood++;
            chapterEntry.understood++;
          } else if (concept.mastery_state === 'needs_review') {
            byChapter[chapter].needs_review++;
            courseEntry.needs_review++;
            chapterEntry.needs_review++;
          } else if (concept.mastery_state === 'not_learned' || concept.mastery_state === 'introduced') {
            byChapter[chapter].not_learned++;
            courseEntry.not_learned++;
            chapterEntry.not_learned++;
          }

          chapterEntry.concepts.push({
            id: concept.id,
            name: concept.name,
            section_id: concept.section_id,
            concept_number: concept.concept_number,
            mastery_state: concept.mastery_state,
            total_attempts: concept.total_attempts,
            correct_attempts: concept.correct_attempts,
            accuracy: concept.total_attempts > 0
              ? Math.round((concept.correct_attempts / concept.total_attempts) * 100)
              : 0,
            last_reviewed_at: concept.last_reviewed_at
          });
        });

        // Calculate percentage for each chapter
        Object.keys(byChapter).forEach(chapter => {
          const chapterData = byChapter[chapter];
          // Mastery percentage: (mastered + 0.5 * understood) / total
          chapterData.percentage = chapterData.total > 0
            ? Math.round(((chapterData.mastered + 0.5 * chapterData.understood) / chapterData.total) * 100)
            : 0;
        });

        Object.values(byCourse).forEach((courseData) => {
          Object.keys(courseData.chapters).forEach((chapterName) => {
            const chapterData = courseData.chapters[chapterName];
            chapterData.percentage = chapterData.total > 0
              ? Math.round(((chapterData.mastered + 0.5 * chapterData.understood) / chapterData.total) * 100)
              : 0;
          });

          courseData.overall = courseData.total > 0
            ? Math.round(((courseData.mastered + 0.5 * courseData.understood) / courseData.total) * 100)
            : 0;
        });

        // Calculate overall mastery percentage
        const overallPercentage = totalConcepts > 0
          ? Math.round(((masteredConcepts + 0.5 * understoodConcepts) / totalConcepts) * 100)
          : 0;

        // 3. Identify weak areas (needs_review or low accuracy)
        const weakAreas = concepts
          .filter(concept =>
            concept.mastery_state === 'needs_review' ||
            (concept.total_attempts >= WEAK_AREA_MIN_ATTEMPTS && (concept.correct_attempts / concept.total_attempts) < WEAK_AREA_ACCURACY_THRESHOLD)
          )
          .map(concept => ({
            id: concept.id,
            name: concept.name,
            chapter: concept.chapter,
            mastery_state: concept.mastery_state,
            accuracy: concept.total_attempts > 0
              ? Math.round((concept.correct_attempts / concept.total_attempts) * 100)
              : 0,
            total_attempts: concept.total_attempts,
            course_id: concept.course_id || null,
            course_name: concept.course_name || 'Unassigned Course'
          }))
          .sort((a, b) => a.accuracy - b.accuracy)
          .slice(0, 10); // Top 10 weak areas

        // 4. Fetch recent study sessions (limit to 10 for display)
        const sessionFilters = buildFilters('ss');
        const sessionsResult = await client.query(
          `SELECT
            ss.id,
            ss.session_type,
            ss.chapter,
            ss.course_id,
            ss.total_check_ins,
            ss.correct_check_ins,
            ss.duration_minutes,
            ss.started_at,
            ss.completed_at,
            COALESCE(crs.name, 'Unassigned Course') AS course_name
           FROM study_sessions ss
           LEFT JOIN courses crs ON ss.course_id = crs.id
           WHERE ${sessionFilters.whereClause}
           ORDER BY ss.started_at DESC
           LIMIT 10`,
          sessionFilters.params
        );

        const studySessions = sessionsResult.rows.map(session => ({
          id: session.id,
          session_type: session.session_type,
          chapter: session.chapter,
          course_id: session.course_id,
          course_name: session.course_name,
          total_check_ins: session.total_check_ins,
          correct_check_ins: session.correct_check_ins,
          accuracy: session.total_check_ins > 0
            ? Math.round((session.correct_check_ins / session.total_check_ins) * 100)
            : 0,
          duration_minutes: session.duration_minutes,
          started_at: session.started_at,
          completed_at: session.completed_at
        }));

        // 5. Calculate study stats from ALL sessions (not just the 10 most recent)
        const statsFilters = buildFilters('ss');
        const statsResult = await client.query(
          `SELECT
            COUNT(*) as total_sessions,
            COALESCE(SUM(total_check_ins), 0) as total_check_ins,
            COALESCE(SUM(correct_check_ins), 0) as total_correct,
            COALESCE(SUM(duration_minutes), 0) as total_minutes
           FROM study_sessions ss
           WHERE ${statsFilters.whereClause}`,
          statsFilters.params
        );

        const stats = statsResult.rows[0];
        const totalSessions = parseInt(stats.total_sessions, 10);
        const totalCheckIns = parseInt(stats.total_check_ins, 10);
        const totalCorrectCheckIns = parseInt(stats.total_correct, 10);
        const totalMinutes = Math.round(parseFloat(stats.total_minutes));

        res.json({
          content_mastery: {
            by_chapter: byChapter,
            by_course: byCourse,
            overall: overallPercentage,
            total_concepts: totalConcepts,
            mastered_concepts: masteredConcepts,
            understood_concepts: understoodConcepts
          },
          weak_areas: weakAreas,
          study_sessions: studySessions,
          stats: {
            total_sessions: totalSessions,
            total_check_ins: totalCheckIns,
            total_correct: totalCorrectCheckIns,
            overall_accuracy: totalCheckIns > 0
              ? Math.round((totalCorrectCheckIns / totalCheckIns) * 100)
              : 0,
            total_study_time_minutes: totalMinutes
          }
        });
      });
    } catch (error) {
      console.error('Failed to fetch progress overview', error);
      res.status(500).json({
        error: 'Failed to fetch progress overview',
        detail: error.message
      });
    }
  });

  return router;
}
