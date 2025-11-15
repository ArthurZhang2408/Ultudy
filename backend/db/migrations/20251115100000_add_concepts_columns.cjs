/**
 * Migration: Add missing columns to concepts table for lesson tracking
 *
 * Adds:
 * - lesson_id: Reference to the lesson where concept was learned
 * - section_id: Reference to the section within a document
 * - course_id: Reference to the course
 * - concept_number: Position of concept within the lesson
 */

exports.up = (pgm) => {
  // Add lesson_id column
  pgm.addColumn('concepts', {
    lesson_id: {
      type: 'uuid',
      notNull: false,
      references: 'lessons',
      onDelete: 'SET NULL',
      comment: 'Lesson where this concept was introduced'
    }
  });

  // Add section_id column
  pgm.addColumn('concepts', {
    section_id: {
      type: 'uuid',
      notNull: false,
      references: 'sections',
      onDelete: 'SET NULL',
      comment: 'Section where this concept appears'
    }
  });

  // Add course_id column
  pgm.addColumn('concepts', {
    course_id: {
      type: 'uuid',
      notNull: false,
      references: 'courses',
      onDelete: 'SET NULL',
      comment: 'Course this concept belongs to'
    }
  });

  // Add concept_number column
  pgm.addColumn('concepts', {
    concept_number: {
      type: 'integer',
      notNull: false,
      comment: 'Position of this concept within the lesson'
    }
  });

  // Create indexes for efficient lookups
  pgm.createIndex('concepts', 'lesson_id');
  pgm.createIndex('concepts', 'section_id');
  pgm.createIndex('concepts', ['course_id', 'chapter']);
};

exports.down = (pgm) => {
  pgm.dropIndex('concepts', ['course_id', 'chapter']);
  pgm.dropIndex('concepts', 'section_id');
  pgm.dropIndex('concepts', 'lesson_id');

  pgm.dropColumn('concepts', 'concept_number');
  pgm.dropColumn('concepts', 'course_id');
  pgm.dropColumn('concepts', 'section_id');
  pgm.dropColumn('concepts', 'lesson_id');
};
