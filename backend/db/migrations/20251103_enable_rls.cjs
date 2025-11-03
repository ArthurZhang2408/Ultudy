exports.up = async (pgm) => {
  pgm.addColumn('chunks', {
    owner_id: {
      type: 'uuid'
    }
  });

  pgm.sql(`
    UPDATE chunks
    SET owner_id = d.owner_id
    FROM documents d
    WHERE d.id = chunks.document_id
  `);

  pgm.alterColumn('chunks', 'owner_id', {
    notNull: true
  });

  pgm.createIndex('chunks', ['owner_id']);

  pgm.sql('ALTER TABLE documents ENABLE ROW LEVEL SECURITY;');
  pgm.sql('ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;');

  pgm.sql(`
    CREATE POLICY docs_by_owner ON documents
      USING (owner_id::text = current_setting('app.user_id', true));
  `);
  pgm.sql(`
    CREATE POLICY docs_ins_by_owner ON documents
      FOR INSERT WITH CHECK (owner_id::text = current_setting('app.user_id', true));
  `);
  pgm.sql(`
    CREATE POLICY docs_upd_by_owner ON documents
      FOR UPDATE USING (owner_id::text = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY chunks_by_owner ON chunks
      USING (owner_id::text = current_setting('app.user_id', true));
  `);
  pgm.sql(`
    CREATE POLICY chunks_ins_by_owner ON chunks
      FOR INSERT WITH CHECK (owner_id::text = current_setting('app.user_id', true));
  `);
  pgm.sql(`
    CREATE POLICY chunks_upd_by_owner ON chunks
      FOR UPDATE USING (owner_id::text = current_setting('app.user_id', true));
  `);
};

exports.down = async (pgm) => {
  pgm.sql('DROP POLICY IF EXISTS chunks_upd_by_owner ON chunks;');
  pgm.sql('DROP POLICY IF EXISTS chunks_ins_by_owner ON chunks;');
  pgm.sql('DROP POLICY IF EXISTS chunks_by_owner ON chunks;');

  pgm.sql('DROP POLICY IF EXISTS docs_upd_by_owner ON documents;');
  pgm.sql('DROP POLICY IF EXISTS docs_ins_by_owner ON documents;');
  pgm.sql('DROP POLICY IF EXISTS docs_by_owner ON documents;');

  pgm.dropIndex('chunks', ['owner_id']);
  pgm.dropColumn('chunks', 'owner_id');

  pgm.sql('ALTER TABLE chunks DISABLE ROW LEVEL SECURITY;');
  pgm.sql('ALTER TABLE documents DISABLE ROW LEVEL SECURITY;');
};
