/**
 * Add Sections Table for Multi-Layer Lesson Structure
 *
 * This migration adds:
 * - sections table to store top-level sections/topics from documents
 * - Modifies lessons table to be section-scoped instead of document-scoped
 * - Updates concepts table to link to sections
 * - Deletes existing lessons to force regeneration with new structure
 */

exports.up = async (pgm) => {
  // Create sections table
  pgm.createTable('sections', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    owner_id: {
      type: 'text',
      notNull: true,
      comment: 'User who this section belongs to'
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'documents',
      onDelete: 'CASCADE',
      comment: 'Source document for this section'
    },
    course_id: {
      type: 'uuid',
      notNull: false,
      references: 'courses',
      onDelete: 'CASCADE',
      comment: 'Course this section belongs to'
    },
    chapter: {
      type: 'varchar(100)',
      notNull: false,
      comment: 'Chapter this section belongs to'
    },
    section_number: {
      type: 'integer',
      notNull: true,
      comment: 'Order of this section within the document'
    },
    name: {
      type: 'varchar(500)',
      notNull: true,
      comment: 'Section name/title'
    },
    description: {
      type: 'text',
      notNull: false,
      comment: '1-2 sentence overview of section content'
    },
    page_start: {
      type: 'integer',
      notNull: false,
      comment: 'Estimated starting page number'
    },
    page_end: {
      type: 'integer',
      notNull: false,
      comment: 'Estimated ending page number'
    },
    concepts_generated: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Whether concepts have been generated for this section'
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

  // Create indexes for sections
  pgm.createIndex('sections', ['owner_id', 'document_id']);
  pgm.createIndex('sections', ['owner_id', 'course_id']);
  pgm.createIndex('sections', ['document_id', 'section_number']);

  // Enable RLS for sections
  pgm.sql('ALTER TABLE sections ENABLE ROW LEVEL SECURITY;');

  // Create RLS policies for sections
  pgm.sql(`
    CREATE POLICY sections_by_owner ON sections
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY sections_ins_by_owner ON sections
      FOR INSERT
      WITH CHECK (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY sections_upd_by_owner ON sections
      FOR UPDATE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY sections_del_by_owner ON sections
      FOR DELETE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  // Delete all existing lessons (as per migration strategy)
  pgm.sql('DELETE FROM lessons;');

  // Drop old unique constraint on lessons
  pgm.dropIndex('lessons', ['owner_id', 'document_id'], {
    name: 'lessons_owner_document_unique'
  });

  // Add section_id to lessons table
  pgm.addColumn('lessons', {
    section_id: {
      type: 'uuid',
      notNull: false,
      references: 'sections',
      onDelete: 'CASCADE',
      comment: 'Section this lesson belongs to (null for old lessons)'
    }
  });

  // Create new unique constraint - one lesson per section per user
  pgm.createIndex('lessons', ['owner_id', 'section_id'], {
    unique: true,
    name: 'lessons_owner_section_unique',
    where: 'section_id IS NOT NULL'
  });

  // Add section_id to concepts table
  pgm.addColumn('concepts', {
    section_id: {
      type: 'uuid',
      notNull: false,
      references: 'sections',
      onDelete: 'SET NULL',
      comment: 'Section this concept belongs to (null for old concepts)'
    }
  });

  // Create index for concepts by section
  pgm.createIndex('concepts', ['owner_id', 'section_id']);
};

exports.down = async (pgm) => {
  // Remove section_id from concepts
  pgm.dropIndex('concepts', ['owner_id', 'section_id']);
  pgm.dropColumn('concepts', 'section_id');

  // Remove section_id from lessons
  pgm.dropIndex('lessons', ['owner_id', 'section_id'], {
    name: 'lessons_owner_section_unique'
  });
  pgm.dropColumn('lessons', 'section_id');

  // Restore old unique constraint
  pgm.createIndex('lessons', ['owner_id', 'document_id'], {
    unique: true,
    name: 'lessons_owner_document_unique'
  });

  // Drop sections table
  pgm.sql('DROP POLICY IF EXISTS sections_del_by_owner ON sections;');
  pgm.sql('DROP POLICY IF EXISTS sections_upd_by_owner ON sections;');
  pgm.sql('DROP POLICY IF EXISTS sections_ins_by_owner ON sections;');
  pgm.sql('DROP POLICY IF EXISTS sections_by_owner ON sections;');
  pgm.dropTable('sections');
};
