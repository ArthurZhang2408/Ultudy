const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/study_app';

async function checkForData() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 CHECKING FOR EXISTING DATA...\n');

    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`Found ${tablesResult.rows.length} tables\n`);

    let totalRows = 0;
    const tablesWithData = [];

    for (const row of tablesResult.rows) {
      const tableName = row.table_name;

      try {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
        const count = parseInt(countResult.rows[0].count);
        totalRows += count;

        if (count > 0) {
          tablesWithData.push({ table: tableName, rows: count });
          console.log(`✅ ${tableName}: ${count} rows`);
        } else {
          console.log(`⚪ ${tableName}: 0 rows`);
        }
      } catch (err) {
        console.log(`❌ ${tableName}: Error reading (${err.message})`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`TOTAL DATA: ${totalRows} rows across ${tablesWithData.length} tables`);
    console.log('='.repeat(60));

    if (totalRows > 0) {
      console.log('\n⚠️  WARNING: DATABASE CONTAINS DATA!');
      console.log('Tables with data:');
      tablesWithData.forEach(t => {
        console.log(`  - ${t.table}: ${t.rows} rows`);
      });
      console.log('\n❌ DO NOT RUN setup-complete-schema.sql - it will destroy this data!');
    } else {
      console.log('\n✅ Database is empty - safe to run setup-complete-schema.sql');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkForData();
