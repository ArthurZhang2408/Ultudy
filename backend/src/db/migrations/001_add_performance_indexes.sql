-- Performance Indexes Migration (Safe Version)
-- Safe to run multiple times (uses IF NOT EXISTS)
-- Only adds indexes for tables that exist in your database
-- Run this with: node backend/src/db/migrations/run.js

-- Helper function to create index only if table exists
CREATE OR REPLACE FUNCTION create_index_if_table_exists(
    index_name TEXT,
    table_name TEXT,
    columns TEXT
) RETURNS void AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $2) THEN
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I %s', $1, $2, $3);
        RAISE NOTICE 'Created index % on table %', $1, $2;
    ELSE
        RAISE NOTICE 'Skipped index % - table % does not exist', $1, $2;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Courses table indexes
SELECT create_index_if_table_exists('idx_courses_owner_id', 'courses', '(owner_id)');
SELECT create_index_if_table_exists('idx_courses_created_at', 'courses', '(created_at DESC)');

-- Documents table indexes
SELECT create_index_if_table_exists('idx_documents_course_id', 'documents', '(course_id)');
SELECT create_index_if_table_exists('idx_documents_owner_id', 'documents', '(owner_id)');
SELECT create_index_if_table_exists('idx_documents_chapter', 'documents', '(chapter)');
SELECT create_index_if_table_exists('idx_documents_owner_course', 'documents', '(owner_id, course_id)');

-- Lessons table indexes
SELECT create_index_if_table_exists('idx_lessons_document_id', 'lessons', '(document_id)');
SELECT create_index_if_table_exists('idx_lessons_section_id', 'lessons', '(section_id)');
SELECT create_index_if_table_exists('idx_lessons_course_id', 'lessons', '(course_id)');
SELECT create_index_if_table_exists('idx_lessons_doc_section', 'lessons', '(document_id, section_id)');

-- Sections table indexes
SELECT create_index_if_table_exists('idx_sections_document_id', 'sections', '(document_id)');
SELECT create_index_if_table_exists('idx_sections_section_number', 'sections', '(section_number)');

-- Concepts mastery table indexes (might be named differently)
SELECT create_index_if_table_exists('idx_concepts_mastery_owner', 'concepts_mastery', '(owner_id)');
SELECT create_index_if_table_exists('idx_concepts_mastery_section', 'concepts_mastery', '(section_id)');
SELECT create_index_if_table_exists('idx_concepts_mastery_course', 'concepts_mastery', '(course_id)');
SELECT create_index_if_table_exists('idx_concepts_mastery_owner_section', 'concepts_mastery', '(owner_id, section_id)');
SELECT create_index_if_table_exists('idx_concepts_mastery_course_chapter', 'concepts_mastery', '(course_id, chapter)');

-- Try alternative table name: concept_mastery (singular)
SELECT create_index_if_table_exists('idx_concept_mastery_owner', 'concept_mastery', '(owner_id)');
SELECT create_index_if_table_exists('idx_concept_mastery_section', 'concept_mastery', '(section_id)');
SELECT create_index_if_table_exists('idx_concept_mastery_course', 'concept_mastery', '(course_id)');
SELECT create_index_if_table_exists('idx_concept_mastery_owner_section', 'concept_mastery', '(owner_id, section_id)');
SELECT create_index_if_table_exists('idx_concept_mastery_course_chapter', 'concept_mastery', '(course_id, chapter)');

-- Check-ins table indexes
SELECT create_index_if_table_exists('idx_check_ins_concept_id', 'check_ins', '(concept_id)');
SELECT create_index_if_table_exists('idx_check_ins_owner_id', 'check_ins', '(owner_id)');
SELECT create_index_if_table_exists('idx_check_ins_created_at', 'check_ins', '(created_at DESC)');

-- Study sessions table indexes
SELECT create_index_if_table_exists('idx_study_sessions_owner_id', 'study_sessions', '(owner_id)');
SELECT create_index_if_table_exists('idx_study_sessions_course_id', 'study_sessions', '(course_id)');
SELECT create_index_if_table_exists('idx_study_sessions_created_at', 'study_sessions', '(created_at DESC)');

-- Jobs table indexes
SELECT create_index_if_table_exists('idx_jobs_status', 'jobs', '(status)');
SELECT create_index_if_table_exists('idx_jobs_owner_id', 'jobs', '(owner_id)');
SELECT create_index_if_table_exists('idx_jobs_created_at', 'jobs', '(created_at DESC)');

-- Cleanup: Drop the helper function
DROP FUNCTION IF EXISTS create_index_if_table_exists;

-- Print completion message
DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count FROM information_schema.tables WHERE table_schema = 'public';
    SELECT COUNT(*) INTO index_count FROM pg_indexes WHERE schemaname = 'public';

    RAISE NOTICE '';
    RAISE NOTICE '====================================';
    RAISE NOTICE 'Performance indexes migration complete!';
    RAISE NOTICE 'Database has % tables with % indexes', table_count, index_count;
    RAISE NOTICE 'Run ANALYZE to update query planner statistics';
    RAISE NOTICE '====================================';
END $$;
