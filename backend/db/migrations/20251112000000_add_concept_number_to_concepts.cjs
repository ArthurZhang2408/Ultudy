/**
 * Adds concept_number column to concepts for preserving lesson ordering.
 */
exports.up = async (pgm) => {
  pgm.addColumn('concepts', {
    concept_number: {
      type: 'integer',
      notNull: false,
      comment: 'Position of the concept within its source section/chapter'
    }
  });

  pgm.createIndex(
    'concepts',
    ['owner_id', 'course_id', 'chapter', 'concept_number'],
    {
      name: 'idx_concepts_owner_course_chapter_concept_number'
    }
  );
};

exports.down = async (pgm) => {
  pgm.dropIndex(
    'concepts',
    ['owner_id', 'course_id', 'chapter', 'concept_number'],
    {
      name: 'idx_concepts_owner_course_chapter_concept_number'
    }
  );

  pgm.dropColumn('concepts', 'concept_number');
};
