/**
 * Add markdown_text column to sections table
 *
 * This allows each section to store its own pre-split markdown content,
 * eliminating the need for complex extraction logic and preventing
 * overlapping concepts between sections.
 */

exports.up = async (pgm) => {
  // Add markdown_text column to store section-specific markdown
  pgm.addColumn('sections', {
    markdown_text: {
      type: 'text',
      notNull: false,
      comment: 'Section-specific markdown extracted from full document'
    }
  });

  console.log('[migration] Added markdown_text column to sections table');
};

exports.down = async (pgm) => {
  // Remove markdown_text column
  pgm.dropColumn('sections', 'markdown_text');

  console.log('[migration] Removed markdown_text column from sections table');
};
