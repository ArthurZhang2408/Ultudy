#!/usr/bin/env node

/**
 * Add chapters and upload_batches tables for multi-document processing.
 * This bypasses the migration system to work on production databases.
 */

import pg from 'pg';

const { Client } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('WARNING: DATABASE_URL environment variable is not set');
    console.log('Skipping migration - server will use backwards-compatible mode');
    process.exit(0);
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✓ Connected to database');

    // Check if upload_batches table already exists
    const { rows: batchesRows } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'upload_batches';
    `);

    if (batchesRows.length > 0) {
      console.log('✓ upload_batches and chapters tables already exist, skipping migration');
      await client.end();
      process.exit(0);
      return;
    }

    console.log('Creating upload_batches table...');

    // Create upload_batches table
    await client.query(`
      CREATE TABLE upload_batches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id text NOT NULL,
        course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
        material_type varchar(50) NOT NULL,
        title varchar(500),
        processing_status varchar(50) NOT NULL DEFAULT 'pending',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    console.log('✓ Created upload_batches table');

    // Create indexes for upload_batches
    await client.query(`
      CREATE INDEX idx_upload_batches_owner_course ON upload_batches (owner_id, course_id);
      CREATE INDEX idx_upload_batches_owner_material ON upload_batches (owner_id, material_type);
    `);

    console.log('✓ Created indexes for upload_batches');

    // Enable RLS for upload_batches
    await client.query(`ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;`);

    // Create RLS policies for upload_batches
    await client.query(`
      CREATE POLICY upload_batches_by_owner ON upload_batches
        USING (owner_id = current_setting('app.user_id', true));
    `);

    await client.query(`
      CREATE POLICY upload_batches_ins_by_owner ON upload_batches
        FOR INSERT
        WITH CHECK (owner_id = current_setting('app.user_id', true));
    `);

    await client.query(`
      CREATE POLICY upload_batches_upd_by_owner ON upload_batches
        FOR UPDATE
        USING (owner_id = current_setting('app.user_id', true));
    `);

    await client.query(`
      CREATE POLICY upload_batches_del_by_owner ON upload_batches
        FOR DELETE
        USING (owner_id = current_setting('app.user_id', true));
    `);

    console.log('✓ Created RLS policies for upload_batches');

    console.log('Creating chapters table...');

    // Create chapters table
    await client.query(`
      CREATE TABLE chapters (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id text NOT NULL,
        upload_batch_id uuid NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,
        course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
        chapter_number integer NOT NULL,
        title varchar(500) NOT NULL,
        description text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    console.log('✓ Created chapters table');

    // Create indexes for chapters
    await client.query(`
      CREATE INDEX idx_chapters_owner_batch ON chapters (owner_id, upload_batch_id);
      CREATE INDEX idx_chapters_owner_course ON chapters (owner_id, course_id);
      CREATE INDEX idx_chapters_batch_number ON chapters (upload_batch_id, chapter_number);
    `);

    console.log('✓ Created indexes for chapters');

    // Enable RLS for chapters
    await client.query(`ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;`);

    // Create RLS policies for chapters
    await client.query(`
      CREATE POLICY chapters_by_owner ON chapters
        USING (owner_id = current_setting('app.user_id', true));
    `);

    await client.query(`
      CREATE POLICY chapters_ins_by_owner ON chapters
        FOR INSERT
        WITH CHECK (owner_id = current_setting('app.user_id', true));
    `);

    await client.query(`
      CREATE POLICY chapters_upd_by_owner ON chapters
        FOR UPDATE
        USING (owner_id = current_setting('app.user_id', true));
    `);

    await client.query(`
      CREATE POLICY chapters_del_by_owner ON chapters
        FOR DELETE
        USING (owner_id = current_setting('app.user_id', true));
    `);

    console.log('✓ Created RLS policies for chapters');

    console.log('Adding upload_batch_id to documents table...');

    // Add upload_batch_id to documents table
    await client.query(`
      ALTER TABLE documents
        ADD COLUMN upload_batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL;
    `);

    await client.query(`
      CREATE INDEX idx_documents_owner_batch ON documents (owner_id, upload_batch_id);
    `);

    console.log('✓ Added upload_batch_id to documents');

    console.log('Adding chapter_id to sections table...');

    // Add chapter_id to sections table
    await client.query(`
      ALTER TABLE sections
        ADD COLUMN chapter_id uuid REFERENCES chapters(id) ON DELETE CASCADE;
    `);

    await client.query(`
      CREATE INDEX idx_sections_owner_chapter ON sections (owner_id, chapter_id);
      CREATE INDEX idx_sections_chapter_number ON sections (chapter_id, section_number);
    `);

    console.log('✓ Added chapter_id to sections');

    console.log('✓ Successfully created upload_batches and chapters tables');

    await client.end();
    process.exit(0);

  } catch (error) {
    console.error('Migration failed:', error.message);
    console.error('Error details:', error);
    console.log('Server will start in backwards-compatible mode');

    try {
      await client.end();
    } catch (e) {
      // Ignore errors when closing connection
    }

    // Exit successfully so server can start even if migration fails
    process.exit(0);
  }
}

main();
