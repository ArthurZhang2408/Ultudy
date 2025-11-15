/**
 * Check-in Evaluation Job Processor
 *
 * Handles async check-in evaluation with LLM or MCQ
 */

import { updateJobProgress, completeJob, failJob } from '../helpers.js';

/**
 * Update concept mastery based on check-in result
 */
async function updateConceptMastery(client, {
  conceptId,
  conceptName,
  ownerId,
  courseId,
  chapter,
  documentId,
  wasCorrect
}) {
  // Find or create concept
  let concept;
  if (conceptId) {
    const { rows } = await client.query(
      `SELECT id, mastery_state, attempts_count, correct_count
       FROM concepts
       WHERE id = $1 AND owner_id = $2`,
      [conceptId, ownerId]
    );
    concept = rows[0];
  } else {
    const { rows } = await client.query(
      `SELECT id, mastery_state, attempts_count, correct_count
       FROM concepts
       WHERE owner_id = $1 AND name = $2 AND
             (course_id = $3 OR (course_id IS NULL AND $3 IS NULL)) AND
             (chapter = $4 OR (chapter IS NULL AND $4 IS NULL))
       LIMIT 1`,
      [ownerId, conceptName, courseId || null, chapter || null]
    );

    if (rows.length > 0) {
      concept = rows[0];
    } else {
      const { rows: newConcept } = await client.query(
        `INSERT INTO concepts (owner_id, name, course_id, chapter, document_id, mastery_state, attempts_count, correct_count)
         VALUES ($1, $2, $3, $4, $5, 'not_learned', 0, 0)
         RETURNING id, mastery_state, attempts_count, correct_count`,
        [ownerId, conceptName, courseId || null, chapter || null, documentId || null]
      );
      concept = newConcept[0];
    }
  }

  const oldState = concept.mastery_state;
  const totalAttempts = (concept.attempts_count || 0) + 1;
  const correctAttempts = (concept.correct_count || 0) + (wasCorrect ? 1 : 0);
  const accuracyPercent = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

  // Simple mastery progression logic
  let newState = oldState;
  if (wasCorrect) {
    if (oldState === 'not_learned' && correctAttempts >= 1) {
      newState = 'learning';
    } else if (oldState === 'learning' && correctAttempts >= 2) {
      newState = 'familiar';
    } else if (oldState === 'familiar' && correctAttempts >= 3) {
      newState = 'mastered';
    }
  }

  await client.query(
    `UPDATE concepts
     SET mastery_state = $1,
         attempts_count = $2,
         correct_count = $3,
         last_attempt_at = NOW(),
         updated_at = NOW()
     WHERE id = $4`,
    [newState, totalAttempts, correctAttempts, concept.id]
  );

  return {
    conceptId: concept.id,
    oldState,
    newState,
    totalAttempts,
    correctAttempts,
    consecutiveCorrect: wasCorrect ? correctAttempts : 0,
    accuracyPercent
  };
}

/**
 * Process check-in evaluation job
 *
 * @param {Object} job - Bull job object
 * @param {Object} job.data - Job data
 * @param {string} job.data.jobId - Database job ID
 * @param {string} job.data.ownerId - User ID
 * @param {string} job.data.conceptId - Concept ID (optional)
 * @param {string} job.data.conceptName - Concept name
 * @param {string} job.data.courseId - Course ID (optional)
 * @param {string} job.data.chapter - Chapter name (optional)
 * @param {string} job.data.documentId - Document ID (optional)
 * @param {string} job.data.question - Check-in question
 * @param {string} job.data.userAnswer - User's answer
 * @param {string} job.data.expectedAnswer - Expected answer
 * @param {string} job.data.context - Context (optional)
 * @param {string} job.data.evaluationMode - 'llm' or 'mcq'
 * @param {Object} job.data.mcq - MCQ details (optional)
 */
export async function processCheckInEvaluation(job, { pool, tenantHelpers, evaluateAnswer }) {
  const {
    jobId,
    ownerId,
    conceptId,
    conceptName,
    courseId,
    chapter,
    documentId,
    question,
    userAnswer,
    expectedAnswer,
    context = '',
    evaluationMode = 'llm',
    mcq
  } = job.data;

  console.log(`[Job ${jobId}] Starting check-in evaluation for concept: ${conceptName}`);

  try {
    // Update job status to processing
    await updateJobProgress(pool, {
      jobId,
      status: 'processing',
      progress: 30,
      progressMessage: 'Evaluating answer...',
      startedAt: new Date()
    });

    let evaluation;

    if (evaluationMode === 'mcq') {
      // MCQ evaluation
      const mcqInfo = typeof mcq === 'object' && mcq !== null ? mcq : {};
      const selectedLetter = typeof mcqInfo.selected_letter === 'string'
        ? mcqInfo.selected_letter.trim().toUpperCase()
        : userAnswer.trim().toUpperCase();
      const correctLetter = typeof mcqInfo.correct_letter === 'string'
        ? mcqInfo.correct_letter.trim().toUpperCase()
        : '';
      const selectedText = typeof mcqInfo.selected_text === 'string'
        ? mcqInfo.selected_text.trim()
        : userAnswer.trim();
      const correctText = typeof mcqInfo.correct_text === 'string'
        ? mcqInfo.correct_text.trim()
        : expectedAnswer;
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

      console.log(`[Job ${jobId}] MCQ evaluation: ${isCorrect ? 'correct' : 'incorrect'}`);
    } else {
      // LLM evaluation
      console.log(`[Job ${jobId}] Using LLM to evaluate answer`);
      evaluation = await evaluateAnswer({
        question,
        userAnswer: userAnswer.trim(),
        expectedAnswer,
        concept: conceptName,
        context
      });
      console.log(`[Job ${jobId}] LLM evaluation: ${evaluation.correct ? 'correct' : 'incorrect'}, score: ${evaluation.score}`);
    }

    // Update progress
    await updateJobProgress(pool, {
      jobId,
      progress: 70,
      progressMessage: 'Updating concept mastery...'
    });

    // Update concept mastery in database
    const masteryUpdate = await tenantHelpers.withTenant(ownerId, (client) =>
      updateConceptMastery(client, {
        conceptId: conceptId || null,
        conceptName,
        ownerId,
        courseId: courseId || null,
        chapter: chapter || 'General',
        documentId: documentId || null,
        wasCorrect: evaluation.correct
      })
    );

    // Prepare result
    const result = {
      correct: evaluation.correct,
      score: evaluation.score,
      feedback: evaluation.feedback,
      key_points: evaluation.keyPoints,
      misconceptions: evaluation.misconceptions,
      mastery_update: {
        concept_id: masteryUpdate.conceptId,
        concept: conceptName,
        old_state: masteryUpdate.oldState,
        new_state: masteryUpdate.newState,
        total_attempts: masteryUpdate.totalAttempts,
        correct_attempts: masteryUpdate.correctAttempts,
        consecutive_correct: masteryUpdate.consecutiveCorrect,
        accuracy_percent: masteryUpdate.accuracyPercent
      }
    };

    // Mark job as completed
    await completeJob(pool, { jobId, resultData: result });

    console.log(`[Job ${jobId}] ✅ Check-in evaluation completed`);

    return result;
  } catch (error) {
    console.error(`[Job ${jobId}] ❌ Error:`, error);

    // Mark job as failed
    await failJob(pool, {
      jobId,
      errorMessage: error.message || 'Failed to evaluate check-in',
      errorStack: error.stack
    });

    throw error;
  }
}
