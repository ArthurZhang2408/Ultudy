const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/study_app';

async function dumpSchema() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('📊 DUMPING DATABASE SCHEMA...\n');
    console.log('Connected to:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'), '\n');
    console.log('='.repeat(80));

    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`\nFound ${tablesResult.rows.length} tables\n`);

    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;

      console.log('\n' + '='.repeat(80));
      console.log(`TABLE: ${tableName}`);
      console.log('='.repeat(80));

      // Get CREATE TABLE statement
      const columnsResult = await pool.query(`
        SELECT
          c.column_name,
          c.data_type,
          c.udt_name,
          c.character_maximum_length,
          c.is_nullable,
          c.column_default,
          pgd.description
        FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_statio_all_tables st ON c.table_name = st.relname
        LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
        WHERE c.table_name = $1
        ORDER BY c.ordinal_position
      `, [tableName]);

      console.log(`\nCREATE TABLE ${tableName} (`);

      columnsResult.rows.forEach((col, idx) => {
        let line = `  ${col.column_name} `;

        // Data type
        if (col.udt_name === 'uuid') {
          line += 'UUID';
        } else if (col.data_type === 'USER-DEFINED') {
          line += col.udt_name;
        } else if (col.data_type === 'character varying') {
          line += col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'TEXT';
        } else if (col.data_type === 'timestamp without time zone') {
          line += 'TIMESTAMP';
        } else if (col.data_type === 'timestamp with time zone') {
          line += 'TIMESTAMPTZ';
        } else {
          line += col.data_type.toUpperCase();
        }

        // Nullable
        if (col.is_nullable === 'NO') {
          line += ' NOT NULL';
        }

        // Default
        if (col.column_default) {
          line += ` DEFAULT ${col.column_default}`;
        }

        // Comma
        if (idx < columnsResult.rows.length - 1) {
          line += ',';
        }

        console.log(line);
      });

      // Get primary key
      const pkResult = await pool.query(`
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary
      `, [tableName]);

      if (pkResult.rows.length > 0) {
        const pkCols = pkResult.rows.map(r => r.attname).join(', ');
        console.log(`  PRIMARY KEY (${pkCols})`);
      }

      console.log(');');

      // Get foreign keys
      const fkResult = await pool.query(`
        SELECT
          conname AS constraint_name,
          conrelid::regclass AS table_name,
          a.attname AS column_name,
          confrelid::regclass AS foreign_table_name,
          af.attname AS foreign_column_name,
          confdeltype AS on_delete_action,
          confupdtype AS on_update_action
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
        WHERE c.contype = 'f' AND conrelid = $1::regclass
      `, [tableName]);

      if (fkResult.rows.length > 0) {
        console.log('\n-- Foreign Keys:');
        fkResult.rows.forEach(fk => {
          const onDelete = fk.on_delete_action === 'c' ? 'CASCADE' :
                          fk.on_delete_action === 'n' ? 'SET NULL' :
                          fk.on_delete_action === 'd' ? 'SET DEFAULT' :
                          fk.on_delete_action === 'r' ? 'RESTRICT' : 'NO ACTION';

          console.log(`ALTER TABLE ${tableName} ADD CONSTRAINT ${fk.constraint_name}`);
          console.log(`  FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.foreign_table_name}(${fk.foreign_column_name})`);
          console.log(`  ON DELETE ${onDelete};`);
        });
      }

      // Get indexes
      const indexResult = await pool.query(`
        SELECT
          i.relname AS index_name,
          a.attname AS column_name,
          am.amname AS index_type,
          ix.indisunique AS is_unique
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON i.relam = am.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = $1 AND NOT ix.indisprimary
        ORDER BY i.relname, a.attnum
      `, [tableName]);

      if (indexResult.rows.length > 0) {
        console.log('\n-- Indexes:');
        const indexes = {};
        indexResult.rows.forEach(idx => {
          if (!indexes[idx.index_name]) {
            indexes[idx.index_name] = {
              columns: [],
              unique: idx.is_unique,
              type: idx.index_type
            };
          }
          indexes[idx.index_name].columns.push(idx.column_name);
        });

        Object.keys(indexes).forEach(idxName => {
          const idx = indexes[idxName];
          const unique = idx.unique ? 'UNIQUE ' : '';
          console.log(`CREATE ${unique}INDEX ${idxName} ON ${tableName}(${idx.columns.join(', ')});`);
        });
      }

      // Row count
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      console.log(`\n-- Current data: ${countResult.rows[0].count} rows`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('SCHEMA DUMP COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

dumpSchema();
