/**
 * Add Lessons Table for Persistence
 *
 * This migration adds:
 * - lessons table to persist generated lessons (no re-generation!)
 * - Links to document, course, and chapter
 * - Stores the full lesson content and extracted concepts
 */

exports.up = async (pgm) => {
  // Create lessons table
  pgm.createTable('lessons', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    owner_id: {
      type: 'text',
      notNull: true,
      comment: 'User who this lesson belongs to'
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'documents',
      onDelete: 'CASCADE',
      comment: 'Source document for this lesson'
    },
    course_id: {
      type: 'uuid',
      notNull: false,
      references: 'courses',
      onDelete: 'CASCADE',
      comment: 'Course this lesson belongs to'
    },
    chapter: {
      type: 'varchar(100)',
      notNull: false,
      comment: 'Chapter this lesson covers'
    },
    summary: {
      type: 'text',
      notNull: false,
      comment: 'Brief lesson summary'
    },
    explanation: {
      type: 'text',
      notNull: true,
      comment: 'Full lesson explanation'
    },
    examples: {
      type: 'jsonb',
      notNull: false,
      default: '[]',
      comment: 'Array of example objects'
    },
    analogies: {
      type: 'jsonb',
      notNull: false,
      default: '[]',
      comment: 'Array of analogy strings'
    },
    concepts: {
      type: 'jsonb',
      notNull: false,
      default: '[]',
      comment: 'Array of concept objects with check-ins'
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

  // Create indexes for efficient lesson lookups
  pgm.createIndex('lessons', ['owner_id', 'document_id']);
  pgm.createIndex('lessons', ['owner_id', 'course_id', 'chapter']);

  // Create unique constraint - one lesson per document per user
  pgm.createIndex('lessons', ['owner_id', 'document_id'], {
    unique: true,
    name: 'lessons_owner_document_unique'
  });

  // Enable RLS
  pgm.sql('ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;');

  // Create RLS policies
  pgm.sql(`
    CREATE POLICY lessons_by_owner ON lessons
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY lessons_ins_by_owner ON lessons
      FOR INSERT
      WITH CHECK (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY lessons_upd_by_owner ON lessons
      FOR UPDATE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY lessons_del_by_owner ON lessons
      FOR DELETE
      USING (owner_id = current_setting('app.user_id', true));
  `);
};

exports.down = async (pgm) => {
  // Drop RLS policies
  pgm.sql('DROP POLICY IF EXISTS lessons_del_by_owner ON lessons;');
  pgm.sql('DROP POLICY IF EXISTS lessons_upd_by_owner ON lessons;');
  pgm.sql('DROP POLICY IF EXISTS lessons_ins_by_owner ON lessons;');
  pgm.sql('DROP POLICY IF EXISTS lessons_by_owner ON lessons;');

  // Drop table
  pgm.dropTable('lessons');
};
