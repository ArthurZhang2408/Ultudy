/**
 * Normalizes existing concept_number values to start at 1 and remain sequential
 * within each section/document so legacy data created before the numbering fix
 * keeps its intended ordering.
 */
exports.up = async (pgm) => {
  pgm.sql(`
    WITH renumbered AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY owner_id,
                       document_id,
                       COALESCE(section_id::text, 'no-section')
          ORDER BY
            concept_number NULLS LAST,
            created_at,
            name
        ) AS seq
      FROM concepts
    )
    UPDATE concepts AS c
    SET concept_number = renumbered.seq
    FROM renumbered
    WHERE c.id = renumbered.id;
  `);
};

exports.down = async () => {
  // No-op: we can't reliably restore previous numbering
};
