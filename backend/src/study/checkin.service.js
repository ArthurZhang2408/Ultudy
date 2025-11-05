/**
 * Check-In Service
 *
 * Evaluates student answers to check-in questions and tracks concept mastery.
 */

import { getLLMProvider } from '../providers/llm/index.js';

/**
 * Evaluates a student's answer to a check-in question
 *
 * @param {Object} params
 * @param {string} params.question - The check-in question
 * @param {string} params.userAnswer - Student's answer
 * @param {string} params.expectedAnswer - Expected/model answer
 * @param {string} params.concept - Concept being tested
 * @param {string} params.context - Additional context from lesson
 * @returns {Promise<{correct: boolean, feedback: string, score: number}>}
 */
export async function evaluateAnswer({
  question,
  userAnswer,
  expectedAnswer,
  concept,
  context = ''
}) {
  const llmProvider = await getLLMProvider();

  const evaluationPrompt = `You are an expert educational evaluator. Your job is to assess whether a student's answer demonstrates understanding of a concept.

**Concept Being Tested:** ${concept}

**Question:** ${question}

**Expected Answer:** ${expectedAnswer}

**Student's Answer:** ${userAnswer}

${context ? `**Additional Context:**\n${context}\n` : ''}

**Your Task:**
1. Determine if the student's answer demonstrates understanding of the concept
2. Provide constructive feedback:
   - If CORRECT: Affirm their understanding and highlight key points they mentioned
   - If PARTIALLY CORRECT: Acknowledge what they got right, then explain what's missing
   - If INCORRECT: Gently explain the misconception and guide them toward the right understanding

**Output Format (JSON):**
{
  "correct": true/false,
  "score": 0-100,
  "feedback": "Your constructive feedback here",
  "keyPoints": ["key point 1", "key point 2"],
  "misconceptions": ["misconception 1"] // only if incorrect
}

**Guidelines:**
- Be encouraging and constructive
- Accept answers that demonstrate understanding even if wording differs from expected answer
- Focus on conceptual understanding, not exact wording
- For math/technical answers, accept equivalent formulations
- Provide feedback that helps the student learn

Evaluate the answer now:`;

  try {
    const response = await llmProvider.generateText(evaluationPrompt);

    // Try to parse JSON response
    let evaluation;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      evaluation = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse evaluation JSON:', parseError);
      // Fallback: use heuristics based on response text
      const lowerResponse = response.toLowerCase();
      const isCorrect = lowerResponse.includes('correct') &&
                       !lowerResponse.includes('incorrect') &&
                       !lowerResponse.includes('not correct');

      evaluation = {
        correct: isCorrect,
        score: isCorrect ? 80 : 40,
        feedback: response,
        keyPoints: [],
        misconceptions: []
      };
    }

    return {
      correct: Boolean(evaluation.correct),
      score: typeof evaluation.score === 'number' ? evaluation.score : (evaluation.correct ? 80 : 40),
      feedback: evaluation.feedback || 'Answer evaluated.',
      keyPoints: Array.isArray(evaluation.keyPoints) ? evaluation.keyPoints : [],
      misconceptions: Array.isArray(evaluation.misconceptions) ? evaluation.misconceptions : []
    };
  } catch (error) {
    console.error('Failed to evaluate answer:', error);
    throw new Error(`Answer evaluation failed: ${error.message}`);
  }
}

/**
 * Updates concept mastery based on check-in performance
 *
 * Mastery states:
 * - not_learned: Never attempted or only 1 attempt
 * - introduced: 1-2 attempts, <50% correct
 * - understood: 2+ attempts, 50-80% correct OR 1 consecutive correct
 * - needs_review: Was understood/mastered but recent incorrect answer
 * - mastered: 2+ consecutive correct OR 75%+ accuracy with 3+ attempts
 *
 * @param {Object} client - Database client
 * @param {Object} params
 * @param {string} params.conceptId - Concept ID (or null to create)
 * @param {string} params.conceptName - Name of the concept
 * @param {string} params.ownerId - User ID
 * @param {string} params.courseId - Course ID
 * @param {string} params.chapter - Chapter
 * @param {string} params.documentId - Source document ID
 * @param {boolean} params.wasCorrect - Whether the answer was correct
 * @returns {Promise<{oldState: string, newState: string, conceptId: string}>}
 */
export async function updateConceptMastery(client, {
  conceptId,
  conceptName,
  ownerId,
  courseId,
  chapter,
  documentId,
  wasCorrect
}) {
  // Check if concept exists
  let concept;

  if (conceptId) {
    const { rows } = await client.query(
      'SELECT * FROM concepts WHERE id = $1 AND owner_id = $2',
      [conceptId, ownerId]
    );
    concept = rows[0];
  } else {
    // Try to find existing concept by name
    const { rows } = await client.query(
      'SELECT * FROM concepts WHERE owner_id = $1 AND name = $2 AND chapter = $3',
      [ownerId, conceptName, chapter]
    );
    concept = rows[0];
  }

  const oldState = concept?.mastery_state || 'not_learned';
  const totalAttempts = (concept?.total_attempts || 0) + 1;
  const correctAttempts = (concept?.correct_attempts || 0) + (wasCorrect ? 1 : 0);
  const consecutiveCorrect = wasCorrect ? (concept?.consecutive_correct || 0) + 1 : 0;
  const accuracyPercent = totalAttempts > 0 ? (correctAttempts / totalAttempts) * 100 : 0;

  // Determine new mastery state
  let newState;

  if (consecutiveCorrect >= 2 || (accuracyPercent >= 75 && totalAttempts >= 3)) {
    newState = 'mastered';
  } else if (accuracyPercent >= 50 && totalAttempts >= 2) {
    newState = 'understood';
  } else if (consecutiveCorrect >= 1) {
    newState = 'understood';
  } else if (!wasCorrect && (oldState === 'understood' || oldState === 'mastered')) {
    newState = 'needs_review';
  } else if (totalAttempts >= 2 && accuracyPercent < 50) {
    newState = 'introduced';
  } else if (totalAttempts === 1) {
    newState = 'introduced';
  } else {
    newState = 'not_learned';
  }

  // Insert or update concept
  if (concept) {
    await client.query(
      `UPDATE concepts
       SET mastery_state = $1,
           total_attempts = $2,
           correct_attempts = $3,
           consecutive_correct = $4,
           last_reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $5`,
      [newState, totalAttempts, correctAttempts, consecutiveCorrect, concept.id]
    );
    conceptId = concept.id;
  } else {
    const { rows } = await client.query(
      `INSERT INTO concepts
       (owner_id, name, chapter, course_id, document_id, mastery_state,
        total_attempts, correct_attempts, consecutive_correct, last_reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING id`,
      [ownerId, conceptName, chapter, courseId, documentId, newState,
       totalAttempts, correctAttempts, consecutiveCorrect]
    );
    conceptId = rows[0].id;
  }

  return {
    oldState,
    newState,
    conceptId,
    totalAttempts,
    correctAttempts,
    consecutiveCorrect,
    accuracyPercent: Math.round(accuracyPercent)
  };
}
