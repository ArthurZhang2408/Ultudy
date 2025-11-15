/**
 * Lesson Generation Job Processor
 *
 * Handles lesson generation in the background
 */

import { extractSectionText } from '../../study/section.service.js';

// Helper to attach check-ins to concepts
function attachCheckinsToConcepts(concepts, checkins) {
  if (!Array.isArray(checkins) || checkins.length === 0) {
    return concepts;
  }

  return concepts.map((concept, idx) => {
    const conceptCheckins = checkins.filter(ci => ci.concept_index === idx);
    return {
      ...concept,
      check_ins: conceptCheckins
    };
  });
}

export async function processLessonJob(job, { tenantHelpers, jobTracker, studyService }) {
  const { jobId, ownerId, document_id, section_id, chapter, include_check_ins = true } = job.data;

  console.log(`[LessonProcessor] Starting job ${jobId}`);
  console.log(`[LessonProcessor] document_id: ${document_id}, section_id: ${section_id}`);

  try {
    // Mark job as processing
    await jobTracker.startJob(ownerId, jobId);
    await jobTracker.updateProgress(ownerId, jobId, 10);

    const lesson = await tenantHelpers.withTenant(ownerId, async (client) => {
      // Step 1: Check if lesson already exists
      let existingLessons;
      if (section_id) {
        const { rows } = await client.query(
          `SELECT id, summary, explanation, examples, analogies, concepts, section_id, created_at
           FROM lessons
           WHERE section_id = $1 AND owner_id = $2
           LIMIT 1`,
          [section_id, ownerId]
        );
        existingLessons = rows;
      } else {
        const { rows } = await client.query(
          `SELECT id, summary, explanation, examples, analogies, concepts, created_at
           FROM lessons
           WHERE document_id = $1 AND owner_id = $2 AND section_id IS NULL
           LIMIT 1`,
          [document_id, ownerId]
        );
        existingLessons = rows;
      }

      if (existingLessons.length > 0) {
        console.log(`[LessonProcessor] Returning cached lesson for ${section_id ? `section ${section_id}` : `document ${document_id}`}`);

        await jobTracker.completeJob(ownerId, jobId, {
          lesson_id: existingLessons[0].id,
          cached: true
        });

        return {
          id: existingLessons[0].id,
          summary: existingLessons[0].summary,
          explanation: existingLessons[0].explanation,
          examples: existingLessons[0].examples,
          analogies: existingLessons[0].analogies,
          concepts: existingLessons[0].concepts
        };
      }

      // Update progress: 20% - Checked cache
      await jobTracker.updateProgress(ownerId, jobId, 20);

      // Step 2: Load document and optionally section data
      const { rows } = await client.query(
        `SELECT id, title, full_text, material_type, chapter as doc_chapter, course_id, pages
         FROM documents
         WHERE id = $1 AND owner_id = $2`,
        [document_id, ownerId]
      );

      if (rows.length === 0) {
        throw new Error('Document not found');
      }

      const document = rows[0];

      // Update progress: 30% - Loaded document
      await jobTracker.updateProgress(ownerId, jobId, 30);

      // Step 2b: If section_id provided, load section data and extract section text
      let sectionData = null;
      let textToProcess = null;

      if (section_id) {
        // Load the specific section
        const { rows: sectionRows } = await client.query(
          `SELECT id, section_number, name, description, page_start, page_end, markdown_text
           FROM sections
           WHERE id = $1 AND owner_id = $2`,
          [section_id, ownerId]
        );

        if (sectionRows.length === 0) {
          throw new Error('Section not found');
        }

        sectionData = sectionRows[0];

        // Use markdown_text from section
        if (sectionData.markdown_text) {
          textToProcess = sectionData.markdown_text;
          console.log(`[LessonProcessor] Using section markdown: ${textToProcess.length} chars`);
        } else {
          // Fallback: try to extract from full_text if available
          if (document.full_text) {
            console.warn(`[LessonProcessor] Section has no markdown_text, falling back to full_text extraction`);
            const { rows: allSectionRows } = await client.query(
              `SELECT section_number, name, page_start, page_end
               FROM sections
               WHERE document_id = $1 AND owner_id = $2
               ORDER BY section_number ASC`,
              [document_id, ownerId]
            );
            textToProcess = extractSectionText(document.full_text, sectionData, allSectionRows, document.pages);
            console.log(`[LessonProcessor] Extracted ${textToProcess.length} chars using fallback extraction`);
          } else {
            throw new Error('Section has no markdown_text and document has no full_text');
          }
        }
      } else {
        // Document-level generation requires full_text
        if (!document.full_text) {
          throw new Error('Document does not have full text extracted. Please generate lessons at the section level.');
        }
        textToProcess = document.full_text;
      }

      // Update progress: 40% - Prepared text
      await jobTracker.updateProgress(ownerId, jobId, 40);

      // Step 3: Generate lesson from document or section text
      const logTarget = section_id ? `section ${section_id} (${sectionData.name})` : `document ${document_id}`;
      console.log(`[LessonProcessor] Generating new lesson for ${logTarget}`);

      // Update progress: 50% - Starting generation
      await jobTracker.updateProgress(ownerId, jobId, 50);

      const generatedLesson = await studyService.buildFullContextLesson(document, {
        chapter: chapter || document.doc_chapter,
        include_check_ins,
        section_name: sectionData?.name,
        section_description: sectionData?.description,
        full_text_override: section_id ? textToProcess : undefined
      });

      // Update progress: 80% - Generation complete
      await jobTracker.updateProgress(ownerId, jobId, 80);

      const conceptsForStorage = attachCheckinsToConcepts(
        generatedLesson.concepts || [],
        generatedLesson.checkins || []
      );

      // Step 4: Persist lesson to database (with optional section_id)
      const { rows: insertedLesson } = await client.query(
        `INSERT INTO lessons (owner_id, document_id, course_id, chapter, section_id, summary, explanation, examples, analogies, concepts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, created_at`,
        [
          ownerId,
          document_id,
          document.course_id,
          chapter || document.doc_chapter,
          section_id || null,
          generatedLesson.summary || '',
          generatedLesson.explanation || '',
          JSON.stringify(generatedLesson.examples || []),
          JSON.stringify(generatedLesson.analogies || []),
          JSON.stringify(conceptsForStorage)
        ]
      );

      const lessonId = insertedLesson[0].id;

      console.log(`[LessonProcessor] ✅ Lesson ${lessonId} created for ${logTarget}`);

      // Update progress: 90% - Lesson saved
      await jobTracker.updateProgress(ownerId, jobId, 90);

      // Step 5: Store concepts in concepts table
      for (let i = 0; i < conceptsForStorage.length; i++) {
        const concept = conceptsForStorage[i];

        await client.query(
          `INSERT INTO concepts (owner_id, lesson_id, document_id, section_id, course_id, chapter, concept, concept_number, mastery_level)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            ownerId,
            lessonId,
            document_id,
            section_id || null,
            document.course_id,
            chapter || document.doc_chapter,
            concept.name,
            i + 1,
            'not_learned'
          ]
        );
      }

      // Mark section as having concepts generated
      if (section_id) {
        await client.query(
          `UPDATE sections SET concepts_generated = true WHERE id = $1 AND owner_id = $2`,
          [section_id, ownerId]
        );
      }

      // Update progress: 100% - Concepts saved
      await jobTracker.updateProgress(ownerId, jobId, 100);

      console.log(`[LessonProcessor] ✅ Job ${jobId} complete`);

      return {
        id: lessonId,
        document_id,
        section_id: section_id || null,
        chapter: chapter || document.doc_chapter,
        summary: generatedLesson.summary,
        explanation: generatedLesson.explanation,
        examples: generatedLesson.examples,
        analogies: generatedLesson.analogies,
        concepts: conceptsForStorage,
        created_at: insertedLesson[0].created_at
      };
    });

    // Mark job as completed
    await jobTracker.completeJob(ownerId, jobId, {
      lesson_id: lesson.id,
      concept_count: lesson.concepts?.length || 0
    });

    return lesson;
  } catch (error) {
    console.error(`[LessonProcessor] ❌ Job ${jobId} failed:`, error);

    // Mark job as failed
    await jobTracker.failJob(ownerId, jobId, error);

    throw error;
  }
}
