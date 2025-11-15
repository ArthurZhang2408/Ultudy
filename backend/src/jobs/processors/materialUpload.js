/**
 * Material Upload Job Processor
 *
 * Handles async PDF upload and processing with Gemini Vision extraction
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { extractStructuredSections } from '../../ingestion/llm_extractor.js';
import { updateJobProgress, completeJob, failJob } from '../helpers.js';

const DEFAULT_STORAGE_DIR = path.resolve(process.cwd(), 'storage');

/**
 * Process material upload job
 *
 * @param {Object} job - Bull job object
 * @param {Object} job.data - Job data
 * @param {string} job.data.jobId - Database job ID
 * @param {string} job.data.ownerId - User ID
 * @param {Buffer} job.data.fileBuffer - PDF file buffer
 * @param {string} job.data.fileName - Original filename
 * @param {string} job.data.storageDir - Storage directory path
 */
export async function processMaterialUpload(job, { pool, tenantHelpers }) {
  const { jobId, ownerId, fileBuffer, fileName, storageDir = DEFAULT_STORAGE_DIR } = job.data;

  console.log(`[Job ${jobId}] Starting material upload: ${fileName}`);

  try {
    // Update job status to processing
    await updateJobProgress(pool, {
      jobId,
      status: 'processing',
      progress: 10,
      progressMessage: 'Saving PDF to storage...',
      startedAt: new Date()
    });

    // Save PDF to storage
    const documentId = randomUUID();
    const ownerDir = path.join(storageDir, ownerId);
    const pdfPath = path.join(ownerDir, `${documentId}.pdf`);

    await fs.mkdir(ownerDir, { recursive: true });
    await fs.writeFile(pdfPath, Buffer.from(fileBuffer));

    console.log(`[Job ${jobId}] PDF saved: ${pdfPath}`);

    // Update progress
    await updateJobProgress(pool, {
      jobId,
      progress: 30,
      progressMessage: 'Extracting content with AI...'
    });

    // Extract structured sections with LLM vision
    const extraction = await extractStructuredSections(pdfPath);

    console.log(`[Job ${jobId}] Extracted ${extraction.sections.length} sections`);

    // Update progress
    await updateJobProgress(pool, {
      jobId,
      progress: 70,
      progressMessage: `Saving ${extraction.sections.length} sections to database...`
    });

    // Store in database with tenant isolation
    await tenantHelpers.withTenant(ownerId, async (client) => {
      // Insert document
      await client.query(
        `INSERT INTO documents (id, title, pages, owner_id)
         VALUES ($1, $2, $3, $4)`,
        [documentId, extraction.title, extraction.sections.length, ownerId]
      );

      console.log(`[Job ${jobId}] Document created: ${documentId}`);

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

        console.log(`[Job ${jobId}] Section ${i + 1} "${section.name}": ${section.markdown.length} chars, id=${rows[0].id}`);
      }
    });

    // Prepare result
    const result = {
      document_id: documentId,
      title: extraction.title,
      section_count: extraction.sections.length,
      sections: extraction.sections.map((s, i) => ({
        section_number: i + 1,
        name: s.name,
        description: s.description,
        markdown_length: s.markdown.length
      }))
    };

    // Mark job as completed
    await completeJob(pool, { jobId, resultData: result });

    console.log(`[Job ${jobId}] ✅ Material upload completed`);

    return result;
  } catch (error) {
    console.error(`[Job ${jobId}] ❌ Error:`, error);

    // Mark job as failed
    await failJob(pool, {
      jobId,
      errorMessage: error.message || 'Failed to process material upload',
      errorStack: error.stack
    });

    throw error;
  }
}
