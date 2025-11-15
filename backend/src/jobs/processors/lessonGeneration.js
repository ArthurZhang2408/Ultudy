/**
 * Lesson Generation Job Processor
 *
 * Handles async lesson generation with LLM
 */

import { updateJobProgress, completeJob, failJob } from '../helpers.js';

/**
 * Helper to extract section text from full document text
 */
function extractSectionText(fullText, sectionData, allSections, totalPages) {
  if (!fullText || !sectionData.page_start || !sectionData.page_end) {
    return '';
  }

  const lines = fullText.split('\n');
  const sectionLines = [];
  let inSection = false;

  for (const line of lines) {
    const pageMatch = line.match(/^Page (\d+)/);
    if (pageMatch) {
      const pageNum = parseInt(pageMatch[1], 10);
      if (pageNum >= sectionData.page_start && pageNum <= sectionData.page_end) {
        inSection = true;
      } else if (pageNum > sectionData.page_end) {
        break;
      }
    } else if (inSection) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join('\n');
}

/**
 * Attach check-ins to concepts
 */
function attachCheckinsToConcepts(concepts, checkins) {
  if (!Array.isArray(checkins) || checkins.length === 0) {
    return concepts;
  }

  return concepts.map((concept, index) => {
    const checkin = checkins[index];
    if (checkin) {
      return {
        ...concept,
        checkin
      };
    }
    return concept;
  });
}

/**
 * Build lesson response
 */
function buildLessonResponse(lessonRow, checkins = []) {
  const concepts = Array.isArray(lessonRow.concepts) ? lessonRow.concepts : [];

  return {
    id: lessonRow.id,
    summary: lessonRow.summary,
    explanation: lessonRow.explanation,
    examples: typeof lessonRow.examples === 'string'
      ? JSON.parse(lessonRow.examples)
      : lessonRow.examples || [],
    analogies: typeof lessonRow.analogies === 'string'
      ? JSON.parse(lessonRow.analogies)
      : lessonRow.analogies || [],
    concepts: attachCheckinsToConcepts(concepts, checkins),
    section_id: lessonRow.section_id,
    created_at: lessonRow.created_at
  };
}

/**
 * Process lesson generation job
 *
 * @param {Object} job - Bull job object
 * @param {Object} job.data - Job data
 * @param {string} job.data.jobId - Database job ID
 * @param {string} job.data.ownerId - User ID
 * @param {string} job.data.documentId - Document ID
 * @param {string} job.data.sectionId - Section ID (optional)
 * @param {string} job.data.chapter - Chapter name (optional)
 * @param {boolean} job.data.includeCheckIns - Include check-ins (default: true)
 */
export async function processLessonGeneration(job, { pool, tenantHelpers, studyService }) {
  const {
    jobId,
    ownerId,
    documentId,
    sectionId,
    chapter,
    includeCheckIns = true
  } = job.data;

  console.log(`[Job ${jobId}] Starting lesson generation for ${sectionId ? `section ${sectionId}` : `document ${documentId}`}`);

  try {
    // Update job status to processing
    await updateJobProgress(pool, {
      jobId,
      status: 'processing',
      progress: 10,
      progressMessage: 'Checking for existing lesson...',
      startedAt: new Date()
    });

    const lesson = await tenantHelpers.withTenant(ownerId, async (client) => {
      // Step 1: Check if lesson already exists
      let existingLessons;
      if (sectionId) {
        const { rows } = await client.query(
          `SELECT id, summary, explanation, examples, analogies, concepts, section_id, created_at
           FROM lessons
           WHERE section_id = $1 AND owner_id = $2
           LIMIT 1`,
          [sectionId, ownerId]
        );
        existingLessons = rows;
      } else {
        const { rows } = await client.query(
          `SELECT id, summary, explanation, examples, analogies, concepts, created_at
           FROM lessons
           WHERE document_id = $1 AND owner_id = $2 AND section_id IS NULL
           LIMIT 1`,
          [documentId, ownerId]
        );
        existingLessons = rows;
      }

      if (existingLessons.length > 0) {
        console.log(`[Job ${jobId}] Returning cached lesson`);
        return buildLessonResponse(existingLessons[0]);
      }

      // Update progress
      await updateJobProgress(pool, {
        jobId,
        progress: 20,
        progressMessage: 'Loading document data...'
      });

      // Step 2: Load document and optionally section data
      const { rows } = await client.query(
        `SELECT id, title, full_text, material_type, chapter as doc_chapter, course_id, pages
         FROM documents
         WHERE id = $1 AND owner_id = $2`,
        [documentId, ownerId]
      );

      if (rows.length === 0) {
        throw new Error('Document not found');
      }

      const document = rows[0];

      // Step 2b: Load section data if provided
      let sectionData = null;
      let textToProcess = null;

      if (sectionId) {
        const { rows: sectionRows } = await client.query(
          `SELECT id, section_number, name, description, page_start, page_end, markdown_text
           FROM sections
           WHERE id = $1 AND owner_id = $2`,
          [sectionId, ownerId]
        );

        if (sectionRows.length === 0) {
          throw new Error('Section not found');
        }

        sectionData = sectionRows[0];

        if (sectionData.markdown_text) {
          textToProcess = sectionData.markdown_text;
          console.log(`[Job ${jobId}] Using section markdown: ${textToProcess.length} chars`);
        } else if (document.full_text) {
          console.warn(`[Job ${jobId}] Section has no markdown_text, falling back to full_text extraction`);
          const { rows: allSectionRows } = await client.query(
            `SELECT section_number, name, page_start, page_end
             FROM sections
             WHERE document_id = $1 AND owner_id = $2
             ORDER BY section_number ASC`,
            [documentId, ownerId]
          );
          textToProcess = extractSectionText(document.full_text, sectionData, allSectionRows, document.pages);
          console.log(`[Job ${jobId}] Extracted ${textToProcess.length} chars using fallback extraction`);
        } else {
          throw new Error('Section has no markdown_text and document has no full_text');
        }
      } else {
        if (!document.full_text) {
          throw new Error('Document does not have full text extracted. Please generate lessons at the section level.');
        }
        textToProcess = document.full_text;
      }

      // Update progress
      await updateJobProgress(pool, {
        jobId,
        progress: 40,
        progressMessage: 'Generating lesson with AI...'
      });

      // Step 3: Generate lesson
      const logTarget = sectionId ? `section ${sectionId} (${sectionData.name})` : `document ${documentId}`;
      console.log(`[Job ${jobId}] Generating new lesson for ${logTarget}`);

      const generatedLesson = await studyService.buildFullContextLesson(document, {
        chapter: chapter || document.doc_chapter,
        include_check_ins: includeCheckIns,
        section_name: sectionData?.name,
        section_description: sectionData?.description,
        full_text_override: sectionId ? textToProcess : undefined
      });

      const conceptsForStorage = attachCheckinsToConcepts(
        generatedLesson.concepts || [],
        generatedLesson.checkins || []
      );

      // Update progress
      await updateJobProgress(pool, {
        jobId,
        progress: 80,
        progressMessage: 'Saving lesson to database...'
      });

      // Step 4: Persist lesson to database
      const { rows: insertedLesson } = await client.query(
        `INSERT INTO lessons (owner_id, document_id, course_id, chapter, section_id, summary, explanation, examples, analogies, concepts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, summary, explanation, examples, analogies, concepts, section_id, created_at`,
        [
          ownerId,
          documentId,
          document.course_id,
          chapter || document.doc_chapter,
          sectionId || null,
          generatedLesson.summary || null,
          generatedLesson.explanation,
          JSON.stringify(generatedLesson.examples || []),
          JSON.stringify(generatedLesson.analogies || []),
          JSON.stringify(conceptsForStorage)
        ]
      );

      // Step 5: Extract and persist concepts
      if (Array.isArray(conceptsForStorage) && conceptsForStorage.length > 0) {
        for (let i = 0; i < conceptsForStorage.length; i++) {
          const conceptData = conceptsForStorage[i];
          const existingConcept = await client.query(
            `SELECT id FROM concepts
             WHERE owner_id = $1 AND name = $2 AND document_id = $3 AND
                   (section_id = $4 OR (section_id IS NULL AND $4 IS NULL))`,
            [ownerId, conceptData.name || conceptData, documentId, sectionId || null]
          );

          if (existingConcept.rows.length > 0) {
            await client.query(
              `UPDATE concepts
               SET concept_number = $1, chapter = $2, course_id = $3
               WHERE id = $4`,
              [
                i + 1,
                chapter || document.doc_chapter,
                document.course_id,
                existingConcept.rows[0].id
              ]
            );
          } else {
            await client.query(
              `INSERT INTO concepts (owner_id, name, chapter, course_id, document_id, section_id, concept_number, mastery_state)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_learned')`,
              [
                ownerId,
                conceptData.name || conceptData,
                chapter || document.doc_chapter,
                document.course_id,
                documentId,
                sectionId || null,
                i + 1
              ]
            );
          }
        }
      }

      // Step 6: Mark section as having concepts generated
      if (sectionId) {
        await client.query(
          `UPDATE sections
           SET concepts_generated = true, updated_at = now()
           WHERE id = $1 AND owner_id = $2`,
          [sectionId, ownerId]
        );
        console.log(`[Job ${jobId}] Marked section ${sectionId} as concepts_generated`);
      }

      const formattedLesson = buildLessonResponse(insertedLesson[0], generatedLesson.checkins || []);
      if (generatedLesson.topic && !formattedLesson.topic) {
        formattedLesson.topic = generatedLesson.topic;
      }

      return formattedLesson;
    });

    // Mark job as completed
    await completeJob(pool, { jobId, resultData: lesson });

    console.log(`[Job ${jobId}] ✅ Lesson generation completed`);

    return lesson;
  } catch (error) {
    console.error(`[Job ${jobId}] ❌ Error:`, error);

    // Mark job as failed with detailed error message
    let errorMessage = 'Failed to generate lesson';

    if (error.message) {
      if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
        errorMessage = 'Rate limit exceeded. Please wait a few minutes and try again.';
      } else if (error.message.includes('API key')) {
        errorMessage = 'API configuration error. Please contact support.';
      } else {
        errorMessage = error.message;
      }
    }

    await failJob(pool, {
      jobId,
      errorMessage,
      errorStack: error.stack
    });

    throw error;
  }
}
