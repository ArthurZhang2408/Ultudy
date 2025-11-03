/**
 * MVP v1.0 Schema Migration
 *
 * This migration:
 * 1. Adds full_text column to documents table
 * 2. Adds metadata columns to documents (material_type, chapter, user_tags)
 * 3. Creates concepts table for concept-level mastery tracking
 * 4. Creates problem_types table for problem mastery tracking
 * 5. Creates study_sessions table for session tracking
 * 6. Keeps chunks table temporarily for safe migration (can be removed later)
 */

exports.up = async (pgm) => {
  // 1. Add full_text and metadata columns to documents table
  // Note: title column already exists, so we only add the new columns
  pgm.addColumns('documents', {
    full_text: {
      type: 'text',
      notNull: false,
      comment: 'Full extracted text from the document'
    },
    material_type: {
      type: 'varchar(50)',
      notNull: false,
      comment: 'Type of material: textbook, lecture, tutorial, exam'
    },
    chapter: {
      type: 'varchar(100)',
      notNull: false,
      comment: 'Chapter or section identifier'
    },
    user_tags: {
      type: 'text[]',
      notNull: false,
      default: pgm.func('ARRAY[]::text[]'),
      comment: 'User-defined tags for organization'
    }
  });

  // 2. Create concepts table for concept-level mastery tracking
  pgm.createTable('concepts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    owner_id: {
      type: 'text',
      notNull: true,
      comment: 'User who is learning this concept'
    },
    name: {
      type: 'varchar(500)',
      notNull: true,
      comment: 'Name of the concept (e.g., "Fourier Transform")'
    },
    chapter: {
      type: 'varchar(100)',
      notNull: false,
      comment: 'Chapter this concept belongs to'
    },
    document_id: {
      type: 'uuid',
      notNull: false,
      references: 'documents',
      onDelete: 'SET NULL',
      comment: 'Source document where this concept was introduced'
    },
    mastery_state: {
      type: 'varchar(50)',
      notNull: true,
      default: "'not_learned'",
      comment: 'Current mastery: not_learned, introduced, understood, needs_review, mastered'
    },
    total_attempts: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Total number of check-in attempts'
    },
    correct_attempts: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Number of correct check-in attempts'
    },
    consecutive_correct: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Current streak of consecutive correct answers'
    },
    last_reviewed_at: {
      type: 'timestamp',
      notNull: false,
      comment: 'Last time this concept was reviewed'
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

  // Create index for efficient concept lookups
  pgm.createIndex('concepts', ['owner_id', 'chapter']);
  pgm.createIndex('concepts', ['owner_id', 'mastery_state']);

  // 3. Create problem_types table for problem mastery tracking
  pgm.createTable('problem_types', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    owner_id: {
      type: 'text',
      notNull: true,
      comment: 'User who is practicing this problem type'
    },
    name: {
      type: 'varchar(500)',
      notNull: true,
      comment: 'Name of the problem type (e.g., "Integration by Parts")'
    },
    chapter: {
      type: 'varchar(100)',
      notNull: false,
      comment: 'Chapter this problem type belongs to'
    },
    related_concepts: {
      type: 'uuid[]',
      notNull: false,
      default: pgm.func('ARRAY[]::uuid[]'),
      comment: 'Array of concept IDs this problem type relates to'
    },
    mastery_state: {
      type: 'varchar(50)',
      notNull: true,
      default: "'not_practiced'",
      comment: 'Current mastery: not_practiced, attempted, competent, needs_review, mastered'
    },
    total_attempts: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Total number of problem attempts'
    },
    correct_attempts: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Number of correct problem attempts'
    },
    consecutive_correct: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Current streak of consecutive correct answers'
    },
    last_practiced_at: {
      type: 'timestamp',
      notNull: false,
      comment: 'Last time this problem type was practiced'
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

  // Create index for efficient problem type lookups
  pgm.createIndex('problem_types', ['owner_id', 'chapter']);
  pgm.createIndex('problem_types', ['owner_id', 'mastery_state']);

  // 4. Create study_sessions table for session tracking
  pgm.createTable('study_sessions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    owner_id: {
      type: 'text',
      notNull: true,
      comment: 'User who created this session'
    },
    session_type: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'Type of session: lesson, practice, review'
    },
    chapter: {
      type: 'varchar(100)',
      notNull: false,
      comment: 'Chapter studied in this session'
    },
    document_id: {
      type: 'uuid',
      notNull: false,
      references: 'documents',
      onDelete: 'SET NULL',
      comment: 'Document used in this session'
    },
    concepts_covered: {
      type: 'uuid[]',
      notNull: false,
      default: pgm.func('ARRAY[]::uuid[]'),
      comment: 'Array of concept IDs covered in this session'
    },
    problems_attempted: {
      type: 'uuid[]',
      notNull: false,
      default: pgm.func('ARRAY[]::uuid[]'),
      comment: 'Array of problem_type IDs attempted in this session'
    },
    total_check_ins: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Total number of check-ins completed'
    },
    correct_check_ins: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Number of correct check-ins'
    },
    duration_minutes: {
      type: 'integer',
      notNull: false,
      comment: 'Session duration in minutes'
    },
    started_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()')
    },
    completed_at: {
      type: 'timestamp',
      notNull: false,
      comment: 'When the session was completed'
    }
  });

  // Create index for efficient session lookups
  pgm.createIndex('study_sessions', ['owner_id', 'started_at']);
  pgm.createIndex('study_sessions', ['owner_id', 'chapter']);

  // 5. Enable RLS on new tables
  pgm.sql('ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;');
  pgm.sql('ALTER TABLE problem_types ENABLE ROW LEVEL SECURITY;');
  pgm.sql('ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;');

  // 6. Create RLS policies for concepts table
  pgm.sql(`
    CREATE POLICY concepts_by_owner ON concepts
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY concepts_ins_by_owner ON concepts
      FOR INSERT
      WITH CHECK (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY concepts_upd_by_owner ON concepts
      FOR UPDATE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY concepts_del_by_owner ON concepts
      FOR DELETE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  // 7. Create RLS policies for problem_types table
  pgm.sql(`
    CREATE POLICY problem_types_by_owner ON problem_types
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY problem_types_ins_by_owner ON problem_types
      FOR INSERT
      WITH CHECK (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY problem_types_upd_by_owner ON problem_types
      FOR UPDATE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY problem_types_del_by_owner ON problem_types
      FOR DELETE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  // 8. Create RLS policies for study_sessions table
  pgm.sql(`
    CREATE POLICY study_sessions_by_owner ON study_sessions
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY study_sessions_ins_by_owner ON study_sessions
      FOR INSERT
      WITH CHECK (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY study_sessions_upd_by_owner ON study_sessions
      FOR UPDATE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY study_sessions_del_by_owner ON study_sessions
      FOR DELETE
      USING (owner_id = current_setting('app.user_id', true));
  `);
};

exports.down = async (pgm) => {
  // Drop RLS policies for study_sessions
  pgm.sql('DROP POLICY IF EXISTS study_sessions_del_by_owner ON study_sessions;');
  pgm.sql('DROP POLICY IF EXISTS study_sessions_upd_by_owner ON study_sessions;');
  pgm.sql('DROP POLICY IF EXISTS study_sessions_ins_by_owner ON study_sessions;');
  pgm.sql('DROP POLICY IF EXISTS study_sessions_by_owner ON study_sessions;');

  // Drop RLS policies for problem_types
  pgm.sql('DROP POLICY IF EXISTS problem_types_del_by_owner ON problem_types;');
  pgm.sql('DROP POLICY IF EXISTS problem_types_upd_by_owner ON problem_types;');
  pgm.sql('DROP POLICY IF EXISTS problem_types_ins_by_owner ON problem_types;');
  pgm.sql('DROP POLICY IF EXISTS problem_types_by_owner ON problem_types;');

  // Drop RLS policies for concepts
  pgm.sql('DROP POLICY IF EXISTS concepts_del_by_owner ON concepts;');
  pgm.sql('DROP POLICY IF EXISTS concepts_upd_by_owner ON concepts;');
  pgm.sql('DROP POLICY IF EXISTS concepts_ins_by_owner ON concepts;');
  pgm.sql('DROP POLICY IF EXISTS concepts_by_owner ON concepts;');

  // Drop tables
  pgm.dropTable('study_sessions');
  pgm.dropTable('problem_types');
  pgm.dropTable('concepts');

  // Drop columns from documents (keep title as it existed before this migration)
  pgm.dropColumns('documents', ['full_text', 'material_type', 'chapter', 'user_tags']);
};
