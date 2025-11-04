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

  // POST /study-sessions/start - Start a new study session
  router.post('/study-sessions/start', async (req, res) => {
    const ownerId = req.userId;
    const { session_type, chapter, document_id, course_id } = req.body;

    if (!session_type) {
      return res.status(400).json({ error: 'session_type is required' });
    }

    try {
      let sessionId;

      await tenantHelpers.withTenant(ownerId, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO study_sessions
           (owner_id, session_type, chapter, document_id, course_id, started_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           RETURNING id, started_at`,
          [ownerId, session_type, chapter || null, document_id || null, course_id || null]
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
      res.status(500).json({
        error: 'Failed to start study session',
        detail: error.message
      });
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

    try {
      await tenantHelpers.withTenant(ownerId, async (client) => {
        // Update session stats
        await client.query(
          `UPDATE study_sessions
           SET total_check_ins = total_check_ins + 1,
               correct_check_ins = correct_check_ins + ${correct ? 1 : 0}
           WHERE id = $1 AND owner_id = $2`,
          [sessionId, ownerId]
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
      await tenantHelpers.withTenant(ownerId, async (client) => {
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
          return res.status(404).json({ error: 'Session not found or already completed' });
        }

        const session = rows[0];
        console.log(
          `[study-sessions] Completed session ${sessionId}: ${Math.round(session.duration_minutes)} minutes, ` +
          `${session.correct_check_ins}/${session.total_check_ins} correct`
        );

        res.json({
          success: true,
          duration_minutes: Math.round(session.duration_minutes),
          total_check_ins: session.total_check_ins,
          correct_check_ins: session.correct_check_ins
        });
      });
    } catch (error) {
      console.error('Failed to complete study session', error);
      res.status(500).json({
        error: 'Failed to complete study session',
        detail: error.message
      });
    }
  });

  // GET /progress/overview - Get user's overall progress dashboard
  router.get('/progress/overview', async (req, res) => {
    const ownerId = req.userId;
    const { course_id } = req.query;

    try {
      await tenantHelpers.withTenant(ownerId, async (client) => {
        // Build base query conditions
        const conditions = ['owner_id = $1'];
        const params = [ownerId];

        if (course_id) {
          conditions.push('course_id = $2');
          params.push(course_id);
        }

        const whereClause = conditions.join(' AND ');

        // 1. Fetch all concepts with mastery data
        const conceptsResult = await client.query(
          `SELECT
            id,
            name,
            chapter,
            course_id,
            mastery_state,
            total_attempts,
            correct_attempts,
            consecutive_correct,
            last_reviewed_at,
            created_at
           FROM concepts
           WHERE ${whereClause}
           ORDER BY chapter, name`,
          params
        );

        const concepts = conceptsResult.rows;

        // 2. Group concepts by chapter and calculate mastery percentage
        const byChapter = {};
        let totalConcepts = 0;
        let masteredConcepts = 0;
        let understoodConcepts = 0;

        concepts.forEach(concept => {
          const chapter = concept.chapter || 'Uncategorized';

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

          byChapter[chapter].concepts.push({
            id: concept.id,
            name: concept.name,
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

          // Count by mastery state
          if (concept.mastery_state === 'mastered') {
            byChapter[chapter].mastered++;
            masteredConcepts++;
          } else if (concept.mastery_state === 'understood') {
            byChapter[chapter].understood++;
            understoodConcepts++;
          } else if (concept.mastery_state === 'needs_review') {
            byChapter[chapter].needs_review++;
          } else if (concept.mastery_state === 'not_learned' || concept.mastery_state === 'introduced') {
            byChapter[chapter].not_learned++;
          }
        });

        // Calculate percentage for each chapter
        Object.keys(byChapter).forEach(chapter => {
          const chapterData = byChapter[chapter];
          // Mastery percentage: (mastered + 0.5 * understood) / total
          chapterData.percentage = chapterData.total > 0
            ? Math.round(((chapterData.mastered + 0.5 * chapterData.understood) / chapterData.total) * 100)
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
            (concept.total_attempts >= 2 && (concept.correct_attempts / concept.total_attempts) < 0.5)
          )
          .map(concept => ({
            id: concept.id,
            name: concept.name,
            chapter: concept.chapter,
            mastery_state: concept.mastery_state,
            accuracy: concept.total_attempts > 0
              ? Math.round((concept.correct_attempts / concept.total_attempts) * 100)
              : 0,
            total_attempts: concept.total_attempts
          }))
          .sort((a, b) => a.accuracy - b.accuracy)
          .slice(0, 10); // Top 10 weak areas

        // 4. Fetch recent study sessions (limit to 10 for display)
        const sessionsResult = await client.query(
          `SELECT
            id,
            session_type,
            chapter,
            course_id,
            total_check_ins,
            correct_check_ins,
            duration_minutes,
            started_at,
            completed_at
           FROM study_sessions
           WHERE ${whereClause}
           ORDER BY started_at DESC
           LIMIT 10`,
          params
        );

        const studySessions = sessionsResult.rows.map(session => ({
          id: session.id,
          session_type: session.session_type,
          chapter: session.chapter,
          course_id: session.course_id,
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
        const statsResult = await client.query(
          `SELECT
            COUNT(*) as total_sessions,
            COALESCE(SUM(total_check_ins), 0) as total_check_ins,
            COALESCE(SUM(correct_check_ins), 0) as total_correct,
            COALESCE(SUM(duration_minutes), 0) as total_minutes
           FROM study_sessions
           WHERE ${whereClause}`,
          params
        );

        const stats = statsResult.rows[0];
        const totalSessions = parseInt(stats.total_sessions, 10);
        const totalCheckIns = parseInt(stats.total_check_ins, 10);
        const totalCorrectCheckIns = parseInt(stats.total_correct, 10);
        const totalMinutes = Math.round(parseFloat(stats.total_minutes));

        res.json({
          content_mastery: {
            by_chapter: byChapter,
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
