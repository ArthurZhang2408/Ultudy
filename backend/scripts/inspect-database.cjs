const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/study_app';

async function inspectDatabase() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('=== DATABASE INSPECTION ===\n');
    console.log('Connected to:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'), '\n');

    // 1. List all tables
    console.log('📋 TABLES IN DATABASE:');
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (tablesResult.rows.length === 0) {
      console.log('  ❌ No tables found!\n');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`  ✅ ${row.table_name}`);
      });
      console.log('');
    }

    // 2. For each table, show columns
    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;

      console.log(`\n📊 TABLE: ${tableName}`);
      console.log('─'.repeat(60));

      const columnsResult = await pool.query(`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      columnsResult.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} ${nullable}${defaultVal}`);
      });

      // Show row count
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      console.log(`  → ${countResult.rows[0].count} rows`);
    }

    // 3. Check extensions
    console.log('\n\n🔌 INSTALLED EXTENSIONS:');
    const extResult = await pool.query(`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname NOT IN ('plpgsql')
      ORDER BY extname
    `);

    if (extResult.rows.length === 0) {
      console.log('  No extensions installed');
    } else {
      extResult.rows.forEach(row => {
        console.log(`  ✅ ${row.extname} (v${row.extversion})`);
      });
    }

    // 4. Check migration tracking table
    console.log('\n\n📝 MIGRATION HISTORY:');
    try {
      const migrationsResult = await pool.query(`
        SELECT name, run_on
        FROM pgmigrations
        ORDER BY run_on
      `);

      if (migrationsResult.rows.length === 0) {
        console.log('  No migrations recorded');
      } else {
        migrationsResult.rows.forEach(row => {
          console.log(`  ✅ ${row.name} (${new Date(row.run_on).toISOString()})`);
        });
      }
    } catch (e) {
      console.log('  ❌ pgmigrations table does not exist');
    }

    console.log('\n\n=== INSPECTION COMPLETE ===\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

inspectDatabase();
