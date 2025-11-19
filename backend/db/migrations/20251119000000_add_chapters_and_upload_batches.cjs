/**
 * Add Chapters and Upload Batches for Multi-Document Processing
 *
 * This migration adds:
 * - upload_batches table to group multiple documents uploaded together
 * - chapters table to store chapter-level information extracted from batches
 * - Updates sections table to reference chapters
 * - Updates documents table to reference upload batches
 *
 * New hierarchy:
 * upload_batch (multiple PDFs) -> chapters (extracted by LLM) -> sections
 */

exports.up = async (pgm) => {
  // Create upload_batches table
  pgm.createTable('upload_batches', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    owner_id: {
      type: 'text',
      notNull: true,
      comment: 'User who uploaded these documents'
    },
    course_id: {
      type: 'uuid',
      notNull: false,
      references: 'courses',
      onDelete: 'CASCADE',
      comment: 'Course these documents belong to'
    },
    material_type: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'Type of material: textbook, lecture, tutorial, exam, practice'
    },
    title: {
      type: 'varchar(500)',
      notNull: false,
      comment: 'Optional batch title'
    },
    processing_status: {
      type: 'varchar(50)',
      notNull: true,
      default: "'pending'",
      comment: 'Status: pending, processing, completed, failed'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // Create indexes for upload_batches
  pgm.createIndex('upload_batches', ['owner_id', 'course_id']);
  pgm.createIndex('upload_batches', ['owner_id', 'material_type']);

  // Enable RLS for upload_batches
  pgm.sql('ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;');

  // Create RLS policies for upload_batches
  pgm.sql(`
    CREATE POLICY upload_batches_by_owner ON upload_batches
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY upload_batches_ins_by_owner ON upload_batches
      FOR INSERT
      WITH CHECK (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY upload_batches_upd_by_owner ON upload_batches
      FOR UPDATE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY upload_batches_del_by_owner ON upload_batches
      FOR DELETE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  // Create chapters table
  pgm.createTable('chapters', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    owner_id: {
      type: 'text',
      notNull: true,
      comment: 'User who this chapter belongs to'
    },
    upload_batch_id: {
      type: 'uuid',
      notNull: true,
      references: 'upload_batches',
      onDelete: 'CASCADE',
      comment: 'Upload batch this chapter was extracted from'
    },
    course_id: {
      type: 'uuid',
      notNull: false,
      references: 'courses',
      onDelete: 'CASCADE',
      comment: 'Course this chapter belongs to'
    },
    chapter_number: {
      type: 'integer',
      notNull: true,
      comment: 'Chapter number (extracted by LLM)'
    },
    title: {
      type: 'varchar(500)',
      notNull: true,
      comment: 'Chapter title'
    },
    description: {
      type: 'text',
      notNull: false,
      comment: 'Optional chapter description'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  // Create indexes for chapters
  pgm.createIndex('chapters', ['owner_id', 'upload_batch_id']);
  pgm.createIndex('chapters', ['owner_id', 'course_id']);
  pgm.createIndex('chapters', ['upload_batch_id', 'chapter_number']);

  // Enable RLS for chapters
  pgm.sql('ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;');

  // Create RLS policies for chapters
  pgm.sql(`
    CREATE POLICY chapters_by_owner ON chapters
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY chapters_ins_by_owner ON chapters
      FOR INSERT
      WITH CHECK (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY chapters_upd_by_owner ON chapters
      FOR UPDATE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY chapters_del_by_owner ON chapters
      FOR DELETE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  // Add upload_batch_id to documents table
  pgm.addColumn('documents', {
    upload_batch_id: {
      type: 'uuid',
      notNull: false,
      references: 'upload_batches',
      onDelete: 'SET NULL',
      comment: 'Upload batch this document belongs to (null for old documents)'
    }
  });

  // Create index for documents by upload_batch_id
  pgm.createIndex('documents', ['owner_id', 'upload_batch_id']);

  // Add chapter_id to sections table
  pgm.addColumn('sections', {
    chapter_id: {
      type: 'uuid',
      notNull: false,
      references: 'chapters',
      onDelete: 'CASCADE',
      comment: 'Chapter this section belongs to (null for old sections)'
    }
  });

  // Create index for sections by chapter_id
  pgm.createIndex('sections', ['owner_id', 'chapter_id']);
  pgm.createIndex('sections', ['chapter_id', 'section_number']);

  console.log('[migration] Added upload_batches and chapters tables');
  console.log('[migration] Added upload_batch_id to documents');
  console.log('[migration] Added chapter_id to sections');
};

exports.down = async (pgm) => {
  // Remove chapter_id from sections
  pgm.dropIndex('sections', ['chapter_id', 'section_number']);
  pgm.dropIndex('sections', ['owner_id', 'chapter_id']);
  pgm.dropColumn('sections', 'chapter_id');

  // Remove upload_batch_id from documents
  pgm.dropIndex('documents', ['owner_id', 'upload_batch_id']);
  pgm.dropColumn('documents', 'upload_batch_id');

  // Drop chapters table
  pgm.sql('DROP POLICY IF EXISTS chapters_del_by_owner ON chapters;');
  pgm.sql('DROP POLICY IF EXISTS chapters_upd_by_owner ON chapters;');
  pgm.sql('DROP POLICY IF EXISTS chapters_ins_by_owner ON chapters;');
  pgm.sql('DROP POLICY IF EXISTS chapters_by_owner ON chapters;');
  pgm.dropTable('chapters');

  // Drop upload_batches table
  pgm.sql('DROP POLICY IF EXISTS upload_batches_del_by_owner ON upload_batches;');
  pgm.sql('DROP POLICY IF EXISTS upload_batches_upd_by_owner ON upload_batches;');
  pgm.sql('DROP POLICY IF EXISTS upload_batches_ins_by_owner ON upload_batches;');
  pgm.sql('DROP POLICY IF EXISTS upload_batches_by_owner ON upload_batches;');
  pgm.dropTable('upload_batches');

  console.log('[migration] Removed upload_batches and chapters tables');
  console.log('[migration] Removed upload_batch_id from documents');
  console.log('[migration] Removed chapter_id from sections');
};
