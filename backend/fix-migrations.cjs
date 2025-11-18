const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixMigrations() {
  try {
    console.log('Connecting to database...');

    // Check current migrations
    const result = await pool.query('SELECT name FROM pgmigrations ORDER BY run_on');
    console.log('Current migrations:', result.rows);

    // Delete duplicate 20240712120000 entries
    console.log('\nCleaning up duplicate migration records...');
    await pool.query("DELETE FROM pgmigrations WHERE name LIKE '20240712120000%'");

    // Mark only the .cjs version as completed
    console.log('Marking 20240712120000_init.cjs as completed...');
    await pool.query("INSERT INTO pgmigrations (name, run_on) VALUES ('20240712120000_init.cjs', NOW())");

    // Verify
    const finalResult = await pool.query('SELECT name FROM pgmigrations ORDER BY run_on');
    console.log('\nFinal migrations:', finalResult.rows);

    console.log('\n✅ Migration table fixed! Now run: npx node-pg-migrate -m db/migrations up');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixMigrations();
