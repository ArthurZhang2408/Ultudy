import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

// Load environment variables
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('[Migrations] Connecting to database...');

    // Test connection
    await pool.query('SELECT NOW()');
    console.log('[Migrations] Connected successfully\n');

    // Run migration file
    const migrationFile = join(__dirname, '001_add_performance_indexes.sql');
    const sql = readFileSync(migrationFile, 'utf8');

    console.log('[Migrations] Running 001_add_performance_indexes.sql...');
    await pool.query(sql);

    console.log('[Migrations] ✓ Indexes created successfully\n');

    // Run ANALYZE to update statistics
    console.log('[Migrations] Running ANALYZE to update query planner statistics...');
    await pool.query('ANALYZE');
    console.log('[Migrations] ✓ ANALYZE completed\n');

    console.log('[Migrations] All migrations completed successfully! 🎉');
  } catch (error) {
    console.error('[Migrations] Error running migrations:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
