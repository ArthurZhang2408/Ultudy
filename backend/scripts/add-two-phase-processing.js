/**
 * Migration: Add Two-Phase Chapter Processing Support
 *
 * Run this migration to add support for two-phase chapter processing:
 * Phase 1: Extract raw markdown from PDFs
 * Phase 2: Generate sections on-demand
 *
 * Usage: node scripts/add-two-phase-processing.js
 */

import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    console.log('📊 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database');

    // Check if columns already exist
    const checkQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'chapters'
        AND column_name IN ('raw_markdown', 'sections_generated', 'source_count');
    `;

    const existing = await client.query(checkQuery);

    if (existing.rows.length > 0) {
      console.log('⚠️  Migration already applied:');
      existing.rows.forEach(row => {
        console.log(`   - Column '${row.column_name}' already exists`);
      });
      console.log('✅ No changes needed');
      return;
    }

    console.log('🔄 Running migration...');

    // Add raw_markdown column
    await client.query(`
      ALTER TABLE chapters
      ADD COLUMN raw_markdown TEXT;
    `);
    console.log('✅ Added raw_markdown column');

    await client.query(`
      COMMENT ON COLUMN chapters.raw_markdown IS 'Raw markdown content before sectioning (Phase 1 output)';
    `);

    // Add sections_generated column
    await client.query(`
      ALTER TABLE chapters
      ADD COLUMN sections_generated BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('✅ Added sections_generated column');

    await client.query(`
      COMMENT ON COLUMN chapters.sections_generated IS 'True if sections have been generated from raw_markdown (Phase 2 complete)';
    `);

    // Add source_count column
    await client.query(`
      ALTER TABLE chapters
      ADD COLUMN source_count INTEGER NOT NULL DEFAULT 1;
    `);
    console.log('✅ Added source_count column');

    await client.query(`
      COMMENT ON COLUMN chapters.source_count IS 'Number of PDF files that contributed content to this chapter';
    `);

    // Create index
    await client.query(`
      CREATE INDEX chapters_sections_generated_idx
      ON chapters (owner_id, sections_generated);
    `);
    console.log('✅ Created index on (owner_id, sections_generated)');

    console.log('\n✅ Migration completed successfully!');
    console.log('\nNew capabilities:');
    console.log('  - Chapters can store raw markdown before sectioning');
    console.log('  - Track which chapters need section generation');
    console.log('  - Track how many source files contributed to each chapter');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
