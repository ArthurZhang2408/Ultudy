const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/study_app';

async function runFixScript() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('Connecting to database...');
    const sqlPath = path.join(__dirname, 'fix-missing-tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Running schema fixes...');
    await pool.query(sql);

    console.log('✅ All missing tables created successfully!');
    console.log('\nVerifying tables exist:');

    const tables = ['courses', 'sections', 'lessons', 'concepts', 'jobs'];
    for (const table of tables) {
      const result = await pool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      console.log(`  ${table}: ${result.rows[0].exists ? '✅' : '❌'}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runFixScript();
