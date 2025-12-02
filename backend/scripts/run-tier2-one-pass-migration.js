#!/usr/bin/env node

/**
 * Run tier2 one-pass extraction migration
 * Adds chapter_summary column and tier2_sections table
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('WARNING: DATABASE_URL environment variable is not set');
    console.log('Skipping migration - development mode');
    process.exit(0);
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    console.log('=== Tier 2 Summary Extraction Migration ===');
    console.log('Connecting to database...');
    await client.connect();
    console.log('✓ Connected to database');

    // Check if chapter_summary column already exists
    const { rows: summaryCheck } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'chapter_markdown'
        AND column_name = 'chapter_summary';
    `);

    if (summaryCheck.length > 0) {
      console.log('✓ Migration already applied, skipping');
      await client.end();
      process.exit(0);
      return;
    }

    console.log('Running migration...');

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'src', 'db', 'migrations', '005_tier2_one_pass_extraction.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');

    // Run migration
    await client.query(migrationSql);

    console.log('✓ Added chapter_summary column to chapter_markdown');
    console.log('✓ Migration completed successfully');

    await client.end();
    process.exit(0);

  } catch (error) {
    console.error('Migration failed:', error.message);
    console.error('Error details:', error);

    try {
      await client.end();
    } catch (e) {
      // Ignore errors when closing connection
    }

    // Exit with error code for migrations (unlike archived columns which exits 0)
    process.exit(1);
  }
}

main();
