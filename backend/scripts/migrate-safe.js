#!/usr/bin/env node

/**
 * Safe migration script that handles production databases that were set up
 * without migrations. It marks existing migrations as complete, then runs
 * any new migrations.
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

    // Check if pgmigrations table exists
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'pgmigrations'
      );
    `);

    const migrationsTableExists = rows[0].exists;

    if (!migrationsTableExists) {
      console.log('No pgmigrations table found. Initializing migration tracking...');

      // Create the pgmigrations table
      await client.query(`
        CREATE TABLE pgmigrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          run_on TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      console.log('Created pgmigrations table');

      // Get all migration files
      const migrationsDir = join(__dirname, '..', 'db', 'migrations');
      const files = await readdir(migrationsDir);
      const migrationFiles = files
        .filter(f => f.endsWith('.cjs'))
        .filter(f => !f.includes('add_archived_to_courses')) // Don't mark the new migration
        .sort();

      // Mark existing migrations as complete
      for (const file of migrationFiles) {
        const name = file.replace('.cjs', '');
        await client.query(
          'INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW()) ON CONFLICT (name) DO NOTHING',
          [name]
        );
        console.log(`Marked migration as complete: ${name}`);
      }

      console.log(`Initialized migration tracking with ${migrationFiles.length} existing migrations`);
    } else {
      console.log('Migration tracking already initialized');
    }

    await client.end();
    console.log('Migration initialization complete. Now running migrations...');

    // Now run node-pg-migrate normally
    const { spawn } = await import('child_process');
    const migrate = spawn('npx', ['node-pg-migrate', '-m', 'db/migrations', 'up'], {
      stdio: 'inherit',
      env: process.env,
    });

    migrate.on('close', (code) => {
      process.exit(code);
    });

  } catch (error) {
    console.error('Migration initialization failed:', error);
    await client.end();
    process.exit(1);
  }
}

main();
