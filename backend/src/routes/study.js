import express from 'express';
import createSearchService from '../search/service.js';
import createStudyService from '../study/service.js';
import { evaluateAnswer, updateConceptMastery } from '../study/checkin.service.js';
import { createTenantHelpers } from '../db/tenant.js';

const DEFAULT_LESSON_K = 6;
const DEFAULT_MCQ_COUNT = 5;
const MAX_CHUNK_LIMIT = 12;
const ALLOWED_DIFFICULTIES = new Set(['easy', 'med', 'hard']);

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

  return {
    question,
    expected_answer: expectedAnswer,
    hint
  };
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

  // MVP v1.0: Full-context lesson generation from document
  // IMPORTANT: Generates lesson ONCE and persists it. No re-generation!
  router.post('/lessons/generate', async (req, res) => {
    const { document_id, chapter, include_check_ins = true } = req.body || {};
    const ownerId = req.userId;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required' });
    }

    try {
      const lesson = await tenantHelpers.withTenant(ownerId, async (client) => {
        // Step 1: Check if lesson already exists for this document
        const { rows: existingLessons } = await client.query(
          `SELECT id, summary, explanation, examples, analogies, concepts, created_at
           FROM lessons
           WHERE document_id = $1 AND owner_id = $2
           LIMIT 1`,
          [document_id, ownerId]
        );

        if (existingLessons.length > 0) {
          console.log(`[lessons/generate] Returning cached lesson for document ${document_id}`);
          return buildLessonResponse(existingLessons[0]);
        }

        // Step 2: Load full document text
        const { rows } = await client.query(
          `SELECT id, title, full_text, material_type, chapter as doc_chapter, course_id
           FROM documents
           WHERE id = $1 AND owner_id = $2`,
          [document_id, ownerId]
        );

        if (rows.length === 0) {
          return null;
        }

        const document = rows[0];

        if (!document.full_text) {
          throw new Error('Document does not have full text extracted');
        }

        // Step 3: Generate lesson from full document text
        console.log(`[lessons/generate] Generating new lesson for document ${document_id}`);
        const generatedLesson = await studyService.buildFullContextLesson(document, {
          chapter: chapter || document.doc_chapter,
          include_check_ins
        });

        const conceptsForStorage = attachCheckinsToConcepts(
          generatedLesson.concepts || [],
          generatedLesson.checkins || []
        );

        // Step 4: Persist lesson to database
        const { rows: insertedLesson } = await client.query(
          `INSERT INTO lessons (owner_id, document_id, course_id, chapter, summary, explanation, examples, analogies, concepts)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, summary, explanation, examples, analogies, concepts, created_at`,
          [
            ownerId,
            document_id,
            document.course_id,
            chapter || document.doc_chapter,
            generatedLesson.summary || null,
            generatedLesson.explanation,
            JSON.stringify(generatedLesson.examples || []),
            JSON.stringify(generatedLesson.analogies || []),
            JSON.stringify(conceptsForStorage)
          ]
        );

        // Step 5: Extract and persist concepts to concepts table
        if (Array.isArray(conceptsForStorage) && conceptsForStorage.length > 0) {
          for (const conceptData of conceptsForStorage) {
            // Create concept record with not_learned state
            await client.query(
              `INSERT INTO concepts (owner_id, name, chapter, course_id, document_id, mastery_state)
               VALUES ($1, $2, $3, $4, $5, 'not_learned')
               ON CONFLICT DO NOTHING`,
              [
                ownerId,
                conceptData.name || conceptData,
                chapter || document.doc_chapter,
                document.course_id,
                document_id
              ]
            );
          }
        }

        const formattedLesson = buildLessonResponse(insertedLesson[0], generatedLesson.checkins || []);
        if (generatedLesson.topic && !formattedLesson.topic) {
          formattedLesson.topic = generatedLesson.topic;
        }

        return formattedLesson;
      });

      if (!lesson) {
        return res.status(404).json({
          error: 'Document not found or you do not have permission to access it'
        });
      }

      res.json(lesson);
    } catch (error) {
      console.error('Failed to generate lesson from document', error);

      // Provide more detailed error messages
      let errorMessage = 'Failed to generate lesson from document';
      let errorDetails = null;

      if (error.message) {
        if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
          errorMessage = 'Rate limit exceeded. Please wait a few minutes and try again.';
          errorDetails = 'The AI service is temporarily rate limited. This usually resets within 1-2 minutes.';
        } else if (error.message.includes('API key')) {
          errorMessage = 'API configuration error';
          errorDetails = 'Please contact support.';
        } else if (error.message.includes('full text')) {
          errorMessage = 'Document text not available';
          errorDetails = 'This document may not have been fully processed yet.';
        } else {
          errorMessage = error.message;
        }
      }

      res.status(500).json({
        error: errorMessage,
        details: errorDetails,
        type: error.status === 429 ? 'rate_limit' : 'generation_error'
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
      context
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
      // Evaluate the answer using LLM
      const evaluation = await evaluateAnswer({
        question,
        userAnswer: user_answer.trim(),
        expectedAnswer: expected_answer,
        concept: concept_name,
        context: context || ''
      });

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

  return router;
}
