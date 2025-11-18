/**
 * Add archived column to courses table
 *
 * Allows courses to be archived after completion or manually
 * Auto-archive based on exam_date
 */

exports.up = (pgm) => {
  // Add archived column
  pgm.addColumns('courses', {
    archived: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Whether this course is archived (completed or manually archived)'
    },
    archived_at: {
      type: 'timestamp',
      notNull: false,
      comment: 'When the course was archived'
    }
  });

  // Create index for filtering active/archived courses
  pgm.createIndex('courses', ['owner_id', 'archived', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropIndex('courses', ['owner_id', 'archived', 'created_at']);
  pgm.dropColumns('courses', ['archived', 'archived_at']);
};
