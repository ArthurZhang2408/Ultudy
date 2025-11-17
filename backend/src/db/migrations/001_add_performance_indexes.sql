-- Performance Indexes Migration
-- Based on actual schema inspection
-- Only adds indexes that don't already exist and will help performance

-- Documents: Add index on chapter for filtering by chapter
-- (already has owner_id and owner_id+course_id indexes)
CREATE INDEX IF NOT EXISTS idx_documents_chapter ON documents(chapter);

-- Lessons: Add index on course_id for course-level queries
-- (already has owner_id+document_id and owner_id+course_id+chapter)
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);

-- Lessons: Add index on document_id for document-level queries
CREATE INDEX IF NOT EXISTS idx_lessons_document_id ON lessons(document_id);

-- Sections: Add index on section_number for ordering
CREATE INDEX IF NOT EXISTS idx_sections_section_number ON sections(section_number);

-- Concepts: Add index on document_id for document-level queries
CREATE INDEX IF NOT EXISTS idx_concepts_document_id ON concepts(document_id);

-- Concepts: Add index on course_id alone (has composite but not single)
CREATE INDEX IF NOT EXISTS idx_concepts_course_id ON concepts(course_id);

-- Study sessions: Add index on course_id alone for course analytics
CREATE INDEX IF NOT EXISTS idx_study_sessions_course_id ON study_sessions(course_id);

-- Problem types: Add index on course_id alone
CREATE INDEX IF NOT EXISTS idx_problem_types_course_id ON problem_types(course_id);

-- Print completion message
DO $$
DECLARE
    new_indexes INTEGER;
BEGIN
    SELECT COUNT(*) INTO new_indexes
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%';

    RAISE NOTICE '';
    RAISE NOTICE '====================================';
    RAISE NOTICE 'Performance indexes created successfully!';
    RAISE NOTICE 'Total custom indexes: %', new_indexes;
    RAISE NOTICE '';
    RAISE NOTICE 'Note: Your database already had excellent indexes!';
    RAISE NOTICE 'This migration added a few supplementary indexes.';
    RAISE NOTICE '';
    RAISE NOTICE 'Running ANALYZE to update query planner...';
    RAISE NOTICE '====================================';
END $$;

-- Update query planner statistics
ANALYZE;
