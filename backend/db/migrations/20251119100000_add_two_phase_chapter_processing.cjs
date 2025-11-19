/**
 * Add Two-Phase Chapter Processing Support
 *
 * Phase 1: Extract raw markdown from PDFs (chapters without sections)
 * Phase 2: Generate sections from raw markdown on-demand
 *
 * This migration adds:
 * - raw_markdown field to store unsectionalized content
 * - sections_generated flag to track processing state
 * - source_count to track how many files contributed to this chapter
 */

exports.up = async (pgm) => {
  // Add raw_markdown to chapters table (stores unsectionalized content)
  pgm.addColumn('chapters', {
    raw_markdown: {
      type: 'text',
      notNull: false,
      comment: 'Raw markdown content before sectioning (Phase 1 output)'
    }
  });

  // Add sections_generated flag
  pgm.addColumn('chapters', {
    sections_generated: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'True if sections have been generated from raw_markdown (Phase 2 complete)'
    }
  });

  // Add source_count to track multiple file contributions
  pgm.addColumn('chapters', {
    source_count: {
      type: 'integer',
      notNull: true,
      default: 1,
      comment: 'Number of PDF files that contributed content to this chapter'
    }
  });

  // Create index for finding chapters that need section generation
  pgm.createIndex('chapters', ['owner_id', 'sections_generated']);
};

exports.down = async (pgm) => {
  pgm.dropColumn('chapters', 'raw_markdown');
  pgm.dropColumn('chapters', 'sections_generated');
  pgm.dropColumn('chapters', 'source_count');
  pgm.dropIndex('chapters', ['owner_id', 'sections_generated']);
};
