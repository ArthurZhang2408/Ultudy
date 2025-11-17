const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function setupProduction() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🚀 SETTING UP PRODUCTION DATABASE\n');
    console.log('Connected to:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'), '\n');

    // Read the schema SQL file
    const sqlPath = path.join(__dirname, 'setup-production-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📝 Executing schema setup...\n');
    await pool.query(sql);

    console.log('✅ Schema created successfully!\n');

    // Verify all tables were created
    console.log('🔍 Verifying tables...\n');
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`✅ Created ${tablesResult.rows.length} tables:`);
    const expectedTables = [
      'cards', 'chunks', 'concepts', 'courses', 'documents',
      'jobs', 'lessons', 'mastery', 'pgmigrations',
      'problem_types', 'quiz_runs', 'sections', 'study_sessions'
    ];

    expectedTables.forEach(expected => {
      const found = tablesResult.rows.some(r => r.table_name === expected);
      console.log(`  ${found ? '✅' : '❌'} ${expected}`);
    });

    console.log('\n🎉 PRODUCTION DATABASE SETUP COMPLETE!\n');
    console.log('Next steps:');
    console.log('1. Update Vercel NEXT_PUBLIC_BACKEND_URL to Railway URL');
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

setupProduction();
