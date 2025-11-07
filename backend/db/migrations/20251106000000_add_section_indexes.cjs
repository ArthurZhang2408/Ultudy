/**
 * Add indexes for section_id foreign keys to improve query performance
 */
exports.up = async function(pgm) {
  // Add index on lessons.section_id for faster section-scoped lesson lookups
  pgm.createIndex('lessons', 'section_id', {
    name: 'idx_lessons_section_id',
    ifNotExists: true
  });

  // Add index on concepts.section_id for faster section-scoped concept lookups
  pgm.createIndex('concepts', 'section_id', {
    name: 'idx_concepts_section_id',
    ifNotExists: true
  });

  // Add composite index on sections for common queries
  pgm.createIndex('sections', ['document_id', 'owner_id'], {
    name: 'idx_sections_document_owner',
    ifNotExists: true
  });

  // Add partial index on sections.concepts_generated for filtering ready sections
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_sections_concepts_generated
    ON sections(concepts_generated)
    WHERE concepts_generated = true;
  `);
};

exports.down = async function(pgm) {
  // Remove the indexes
  pgm.dropIndex('lessons', 'section_id', {
    name: 'idx_lessons_section_id',
    ifExists: true
  });

  pgm.dropIndex('concepts', 'section_id', {
    name: 'idx_concepts_section_id',
    ifExists: true
  });

  pgm.dropIndex('sections', ['document_id', 'owner_id'], {
    name: 'idx_sections_document_owner',
    ifExists: true
  });

  pgm.sql('DROP INDEX IF EXISTS idx_sections_concepts_generated;');
};
