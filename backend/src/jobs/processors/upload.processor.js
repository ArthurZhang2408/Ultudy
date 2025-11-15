/**
 * Upload Job Processor
 *
 * Handles PDF upload and extraction in the background
 */

import { extractStructuredSections } from '../../ingestion/llm_extractor.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function processUploadJob(job, { tenantHelpers, jobTracker, storageDir }) {
  const { jobId, ownerId, pdfPath, originalFilename, documentId, courseId, chapter, materialType, title } = job.data;

  console.log(`[UploadProcessor] Starting job ${jobId} for document ${documentId}`);
  console.log(`[UploadProcessor] Metadata: course=${courseId}, chapter=${chapter}, type=${materialType}`);

  try {
    // Mark job as processing
    await jobTracker.startJob(ownerId, jobId);

    // Update progress: 10% - PDF saved
    await jobTracker.updateProgress(ownerId, jobId, 10);

    console.log(`[UploadProcessor] Extracting structured sections from ${pdfPath}`);

    // Update progress: 20% - Starting extraction
    await jobTracker.updateProgress(ownerId, jobId, 20);

    // Extract structured sections with LLM vision
    const extraction = await extractStructuredSections(pdfPath);

    console.log(`[UploadProcessor] Extracted ${extraction.sections.length} sections`);
    console.log(`[UploadProcessor] Title: "${extraction.title}"`);

    // Update progress: 70% - Extraction complete
    await jobTracker.updateProgress(ownerId, jobId, 70);

    // Use provided title or fall back to extracted title
    const documentTitle = title || extraction.title;

    // Store in database
    await tenantHelpers.withTenant(ownerId, async (client) => {
      // Insert document with metadata
      await client.query(
        `INSERT INTO documents (id, title, pages, owner_id, course_id, chapter, material_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [documentId, documentTitle, extraction.sections.length, ownerId, courseId, chapter, materialType]
      );

      console.log(`[UploadProcessor] Document created: ${documentId} with course_id=${courseId}, chapter=${chapter}`);

      // Update progress: 80% - Document created
      await jobTracker.updateProgress(ownerId, jobId, 80);

      // Insert sections with LLM-generated markdown
      for (let i = 0; i < extraction.sections.length; i++) {
        const section = extraction.sections[i];

        const { rows } = await client.query(
          `INSERT INTO sections
           (owner_id, document_id, section_number, name, description,
            markdown_text, concepts_generated)
           VALUES ($1, $2, $3, $4, $5, $6, false)
           RETURNING id`,
          [
            ownerId,
            documentId,
            i + 1,
            section.name,
            section.description,
            section.markdown
          ]
        );

        console.log(`[UploadProcessor] Section ${i + 1} "${section.name}": ${section.markdown.length} chars, id=${rows[0].id}`);

        // Update progress incrementally
        const sectionProgress = 80 + Math.floor((i + 1) / extraction.sections.length * 20);
        await jobTracker.updateProgress(ownerId, jobId, sectionProgress);
      }
    });

    console.log(`[UploadProcessor] ✅ Job ${jobId} complete`);

    // Mark job as completed
    await jobTracker.completeJob(ownerId, jobId, {
      document_id: documentId,
      title: documentTitle,
      section_count: extraction.sections.length,
      course_id: courseId,
      chapter: chapter,
      material_type: materialType,
      sections: extraction.sections.map((s, i) => ({
        section_number: i + 1,
        name: s.name,
        description: s.description,
        markdown_length: s.markdown.length
      }))
    });

    return {
      document_id: documentId,
      title: documentTitle,
      section_count: extraction.sections.length,
      course_id: courseId,
      chapter: chapter
    };
  } catch (error) {
    console.error(`[UploadProcessor] ❌ Job ${jobId} failed:`, error);

    // Mark job as failed
    await jobTracker.failJob(ownerId, jobId, error);

    throw error;
  }
}
