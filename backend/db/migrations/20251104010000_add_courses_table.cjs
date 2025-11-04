/**
 * Add Multi-Course Support Migration
 *
 * This migration adds:
 * 1. courses table for organizing content by course
 * 2. course_id foreign keys to documents, concepts, problem_types, study_sessions
 *
 * Data Hierarchy: User → Course → Chapter → Concept → Check-in
 */

exports.up = async (pgm) => {
  // 1. Create courses table
  pgm.createTable('courses', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    owner_id: {
      type: 'text',
      notNull: true,
      comment: 'User who owns this course'
    },
    name: {
      type: 'varchar(500)',
      notNull: true,
      comment: 'Course name (e.g., "Signals and Systems")'
    },
    code: {
      type: 'varchar(50)',
      notNull: false,
      comment: 'Course code (e.g., "ECE 358")'
    },
    term: {
      type: 'varchar(50)',
      notNull: false,
      comment: 'Term/semester (e.g., "Fall 2025")'
    },
    exam_date: {
      type: 'date',
      notNull: false,
      comment: 'Final exam date (for countdown/urgency)'
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

  // Create index for efficient course lookups
  pgm.createIndex('courses', ['owner_id', 'created_at']);

  // 2. Enable RLS on courses table
  pgm.sql('ALTER TABLE courses ENABLE ROW LEVEL SECURITY;');

  // 3. Create RLS policies for courses
  pgm.sql(`
    CREATE POLICY courses_by_owner ON courses
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY courses_ins_by_owner ON courses
      FOR INSERT
      WITH CHECK (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY courses_upd_by_owner ON courses
      FOR UPDATE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  pgm.sql(`
    CREATE POLICY courses_del_by_owner ON courses
      FOR DELETE
      USING (owner_id = current_setting('app.user_id', true));
  `);

  // 4. Add course_id to documents table
  pgm.addColumns('documents', {
    course_id: {
      type: 'uuid',
      notNull: false,
      references: 'courses',
      onDelete: 'CASCADE',
      comment: 'Course this document belongs to'
    }
  });

  pgm.createIndex('documents', ['owner_id', 'course_id']);

  // 5. Add course_id to concepts table
  pgm.addColumns('concepts', {
    course_id: {
      type: 'uuid',
      notNull: false,
      references: 'courses',
      onDelete: 'CASCADE',
      comment: 'Course this concept belongs to'
    }
  });

  pgm.createIndex('concepts', ['owner_id', 'course_id', 'chapter']);

  // 6. Add course_id to problem_types table
  pgm.addColumns('problem_types', {
    course_id: {
      type: 'uuid',
      notNull: false,
      references: 'courses',
      onDelete: 'CASCADE',
      comment: 'Course this problem type belongs to'
    }
  });

  pgm.createIndex('problem_types', ['owner_id', 'course_id', 'chapter']);

  // 7. Add course_id to study_sessions table
  pgm.addColumns('study_sessions', {
    course_id: {
      type: 'uuid',
      notNull: false,
      references: 'courses',
      onDelete: 'CASCADE',
      comment: 'Course this session belongs to'
    }
  });

  pgm.createIndex('study_sessions', ['owner_id', 'course_id', 'started_at']);
};

exports.down = async (pgm) => {
  // Drop course_id columns in reverse order
  pgm.dropColumns('study_sessions', ['course_id']);
  pgm.dropColumns('problem_types', ['course_id']);
  pgm.dropColumns('concepts', ['course_id']);
  pgm.dropColumns('documents', ['course_id']);

  // Drop RLS policies
  pgm.sql('DROP POLICY IF EXISTS courses_del_by_owner ON courses;');
  pgm.sql('DROP POLICY IF EXISTS courses_upd_by_owner ON courses;');
  pgm.sql('DROP POLICY IF EXISTS courses_ins_by_owner ON courses;');
  pgm.sql('DROP POLICY IF EXISTS courses_by_owner ON courses;');

  // Drop courses table
  pgm.dropTable('courses');
};
