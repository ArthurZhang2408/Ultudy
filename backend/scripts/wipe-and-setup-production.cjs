const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function wipeAndSetup() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🗑️  WIPING PRODUCTION DATABASE\n');
    console.log('Connected to:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'), '\n');

    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    if (tablesResult.rows.length > 0) {
      console.log(`Found ${tablesResult.rows.length} existing tables:`);
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });

      console.log('\n⚠️  DROPPING ALL TABLES...\n');

      // Drop all tables in correct order (reverse of creation)
      const dropSQL = `
        DROP TABLE IF EXISTS cards CASCADE;
        DROP TABLE IF EXISTS quiz_runs CASCADE;
        DROP TABLE IF EXISTS mastery CASCADE;
        DROP TABLE IF EXISTS study_sessions CASCADE;
        DROP TABLE IF EXISTS problem_types CASCADE;
        DROP TABLE IF EXISTS concepts CASCADE;
        DROP TABLE IF EXISTS lessons CASCADE;
        DROP TABLE IF EXISTS sections CASCADE;
        DROP TABLE IF EXISTS chunks CASCADE;
        DROP TABLE IF EXISTS documents CASCADE;
        DROP TABLE IF EXISTS courses CASCADE;
        DROP TABLE IF EXISTS jobs CASCADE;
        DROP TABLE IF EXISTS pgmigrations CASCADE;
      `;

      await pool.query(dropSQL);
      console.log('✅ All tables dropped\n');
    } else {
      console.log('No existing tables found\n');
    }

    // Now create fresh schema
    console.log('🚀 CREATING FRESH SCHEMA\n');

    const sqlPath = path.join(__dirname, 'setup-production-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📝 Executing schema setup...\n');
    await pool.query(sql);

    console.log('✅ Schema created successfully!\n');

    // Verify all tables were created
    console.log('🔍 Verifying tables...\n');
    const newTablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`✅ Created ${newTablesResult.rows.length} tables:`);
    const expectedTables = [
      'cards', 'chunks', 'concepts', 'courses', 'documents',
      'jobs', 'lessons', 'mastery', 'pgmigrations',
      'problem_types', 'quiz_runs', 'sections', 'study_sessions'
    ];

    expectedTables.forEach(expected => {
      const found = newTablesResult.rows.some(r => r.table_name === expected);
      console.log(`  ${found ? '✅' : '❌'} ${expected}`);
    });

    console.log('\n🎉 PRODUCTION DATABASE SETUP COMPLETE!\n');
    console.log('Database is now ready for deployment.');
    console.log('\nNext steps:');
    console.log('1. Update Vercel NEXT_PUBLIC_BACKEND_URL to: https://ultudy-production.up.railway.app');
    console.log('2. Redeploy Vercel frontend');
    console.log('3. Test the production deployment\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

wipeAndSetup();
