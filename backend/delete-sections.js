/**
 * Delete all sections to allow fresh regeneration with improved extraction logic
 *
 * Usage: node delete-sections.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function deleteSections() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/study_app'
  });

  try {
    console.log('🔍 Checking existing sections...');

    // Count sections
    const countResult = await pool.query('SELECT COUNT(*) as count FROM sections');
    const sectionCount = parseInt(countResult.rows[0].count, 10);

    console.log(`📊 Found ${sectionCount} sections in database`);

    if (sectionCount === 0) {
      console.log('✅ No sections to delete');
      return;
    }

    // Also count lessons linked to sections
    const lessonResult = await pool.query(
      'SELECT COUNT(*) as count FROM lessons WHERE section_id IS NOT NULL'
    );
    const lessonCount = parseInt(lessonResult.rows[0].count, 10);

    console.log(`📚 Found ${lessonCount} lessons linked to sections`);

    // Delete lessons first (due to foreign key constraint)
    if (lessonCount > 0) {
      console.log('🗑️  Deleting section-linked lessons...');
      await pool.query('DELETE FROM lessons WHERE section_id IS NOT NULL');
      console.log(`✅ Deleted ${lessonCount} lessons`);
    }

    // Delete all sections
    console.log('🗑️  Deleting all sections...');
    await pool.query('DELETE FROM sections');
    console.log(`✅ Deleted ${sectionCount} sections`);

    console.log('\n✨ All sections cleared! You can now regenerate with improved extraction.');
    console.log('💡 Next step: Upload your document and call POST /api/sections/generate');

  } catch (error) {
    console.error('❌ Error deleting sections:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

deleteSections();
