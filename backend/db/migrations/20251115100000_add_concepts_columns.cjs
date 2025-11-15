/**
 * Migration: Add lesson_id to concepts table
 *
 * Adds:
 * - lesson_id: Reference to the lesson where concept was learned
 *
 * Note: Other columns (section_id, course_id, concept_number) were already
 * added in previous migrations (20251104010000, 20251105000000, 20251112000000)
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

  // Create index for efficient lesson lookups
  pgm.createIndex('concepts', 'lesson_id');
};

exports.down = (pgm) => {
  pgm.dropIndex('concepts', 'lesson_id');
  pgm.dropColumn('concepts', 'lesson_id');
};
