/**
 * Clear Cached Lessons Script
 *
 * This script clears all cached lessons from the database to force clean regeneration.
 * Useful after pipeline changes or when cached lessons are corrupted.
 *
 * Usage:
 *   node scripts/clear-cached-lessons.js [--all] [--section-only]
 *
 * Options:
 *   --all           Clear ALL lessons (document-level and section-level)
 *   --section-only  Clear only section-scoped lessons (default)
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function clearLessons() {
  const args = process.argv.slice(2);
  const clearAll = args.includes('--all');
  const sectionOnly = args.includes('--section-only') || !clearAll;

  console.log('🗑️  Clearing Cached Lessons');
  console.log('━'.repeat(60));

  try {
    // Set tenant context (this might not be needed for DELETE but good practice)
    // We'll delete across all tenants since we're clearing cache

    let query;
    let description;

    if (clearAll) {
      query = 'DELETE FROM lessons';
      description = 'ALL lessons (document-level and section-level)';
    } else if (sectionOnly) {
      query = 'DELETE FROM lessons WHERE section_id IS NOT NULL';
      description = 'section-scoped lessons only';
    }

    console.log(`Target: ${description}`);
    console.log(`Query: ${query}`);
    console.log('');
    console.log('⚠️  This will permanently delete cached lessons!');
    console.log('Press Ctrl+C to cancel, or wait 3 seconds to proceed...');

    await new Promise(resolve => setTimeout(resolve, 3000));

    const result = await pool.query(query);

    console.log('');
    console.log('✅ Success!');
    console.log(`Deleted ${result.rowCount} lessons`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Navigate to a course and section');
    console.log('3. Generate lessons - they will be fresh');

  } catch (error) {
    console.error('❌ Error clearing lessons:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

clearLessons();
