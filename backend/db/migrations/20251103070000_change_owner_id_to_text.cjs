/* eslint-disable camelcase */

exports.up = async (pgm) => {
  // Drop RLS policies that reference owner_id
  pgm.sql('DROP POLICY IF EXISTS chunks_upd_by_owner ON chunks;');
  pgm.sql('DROP POLICY IF EXISTS chunks_ins_by_owner ON chunks;');
  pgm.sql('DROP POLICY IF EXISTS chunks_by_owner ON chunks;');
  pgm.sql('DROP POLICY IF EXISTS docs_upd_by_owner ON documents;');
  pgm.sql('DROP POLICY IF EXISTS docs_ins_by_owner ON documents;');
  pgm.sql('DROP POLICY IF EXISTS docs_by_owner ON documents;');

  // Change owner_id from uuid to text in documents table
  pgm.alterColumn('documents', 'owner_id', {
    type: 'text',
    using: 'owner_id::text'
  });

  // Change owner_id from uuid to text in chunks table
  pgm.alterColumn('chunks', 'owner_id', {
    type: 'text',
    using: 'owner_id::text'
  });

  // Recreate RLS policies without ::text cast (since owner_id is now text)
  pgm.sql(`
    CREATE POLICY docs_by_owner ON documents
      USING (owner_id = current_setting('app.user_id', true));
  `);
  pgm.sql(`
    CREATE POLICY docs_ins_by_owner ON documents
      FOR INSERT WITH CHECK (owner_id = current_setting('app.user_id', true));
  `);
  pgm.sql(`
    CREATE POLICY docs_upd_by_owner ON documents
      FOR UPDATE USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY chunks_by_owner ON chunks
      USING (owner_id = current_setting('app.user_id', true));
  `);
  pgm.sql(`
    CREATE POLICY chunks_ins_by_owner ON chunks
      FOR INSERT WITH CHECK (owner_id = current_setting('app.user_id', true));
  `);
  pgm.sql(`
    CREATE POLICY chunks_upd_by_owner ON chunks
      FOR UPDATE USING (owner_id = current_setting('app.user_id', true));
  `);
};

exports.down = async (pgm) => {
  // Drop RLS policies
  pgm.sql('DROP POLICY IF EXISTS chunks_upd_by_owner ON chunks;');
  pgm.sql('DROP POLICY IF EXISTS chunks_ins_by_owner ON chunks;');
  pgm.sql('DROP POLICY IF EXISTS chunks_by_owner ON chunks;');
  pgm.sql('DROP POLICY IF EXISTS docs_upd_by_owner ON documents;');
  pgm.sql('DROP POLICY IF EXISTS docs_ins_by_owner ON documents;');
  pgm.sql('DROP POLICY IF EXISTS docs_by_owner ON documents;');

  // Change owner_id back from text to uuid in documents table
  pgm.alterColumn('documents', 'owner_id', {
    type: 'uuid',
    using: 'owner_id::uuid'
  });

  // Change owner_id back from text to uuid in chunks table
  pgm.alterColumn('chunks', 'owner_id', {
    type: 'uuid',
    using: 'owner_id::uuid'
  });

  // Recreate RLS policies with ::text cast (since owner_id is back to uuid)
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
