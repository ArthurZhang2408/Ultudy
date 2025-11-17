import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

async function inspectSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Inspecting database schema...\n');

    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(`Found ${tablesResult.rows.length} tables:\n`);

    for (const { table_name } of tablesResult.rows) {
      console.log(`\n📋 Table: ${table_name}`);

      // Get columns for this table
      const columnsResult = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table_name]);

      console.log('   Columns:');
      for (const col of columnsResult.rows) {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      }

      // Get existing indexes
      const indexesResult = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1
        ORDER BY indexname
      `, [table_name]);

      if (indexesResult.rows.length > 0) {
        console.log('   Existing indexes:');
        for (const idx of indexesResult.rows) {
          console.log(`   - ${idx.indexname}`);
        }
      }
    }

    console.log('\n✅ Schema inspection complete!\n');
  } catch (error) {
    console.error('Error inspecting schema:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

inspectSchema();
