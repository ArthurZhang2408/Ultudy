const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/study_app';

async function setupSchema() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🚀 Setting up complete database schema...\n');
    console.log('Connected to:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'), '\n');

    const sqlPath = path.join(__dirname, 'setup-complete-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📝 Running schema setup...');
    await pool.query(sql);

    console.log('✅ Schema created successfully!\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...');
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`\n✅ Created ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    console.log('\n🎉 Database setup complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupSchema();
