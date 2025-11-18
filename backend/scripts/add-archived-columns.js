#!/usr/bin/env node

/**
 * Directly add archived columns to courses table if they don't exist.
 * This bypasses the migration system to work on production databases
 * that were set up without migrations.
 */

import pg from 'pg';

const { Client } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check if archived column already exists
    const { rows } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'courses'
        AND column_name = 'archived';
    `);

    if (rows.length > 0) {
      console.log('Archived columns already exist, skipping migration');
      await client.end();
      return;
    }

    console.log('Adding archived columns to courses table...');

    // Add archived and archived_at columns
    await client.query(`
      ALTER TABLE courses
        ADD COLUMN archived boolean NOT NULL DEFAULT false,
        ADD COLUMN archived_at timestamp;
    `);

    console.log('Added archived column (boolean, default false)');
    console.log('Added archived_at column (timestamp, nullable)');

    // Create index for filtering
    await client.query(`
      CREATE INDEX idx_courses_owner_archived_created
        ON courses (owner_id, archived, created_at);
    `);

    console.log('Created index on (owner_id, archived, created_at)');

    console.log('✓ Successfully added archived columns to courses table');

    await client.end();

  } catch (error) {
    console.error('Failed to add archived columns:', error.message);
    await client.end();
    process.exit(1);
  }
}

main();
