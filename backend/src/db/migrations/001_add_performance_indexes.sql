-- Performance Indexes Migration
-- Safe to run multiple times (uses IF NOT EXISTS)
-- Adds indexes for high-traffic query patterns
-- Run this with: psql $DATABASE_URL -f backend/src/db/migrations/001_add_performance_indexes.sql

-- Courses queries (owner_id is heavily used for filtering)
CREATE INDEX IF NOT EXISTS idx_courses_owner_id ON courses(owner_id);
CREATE INDEX IF NOT EXISTS idx_courses_created_at ON courses(created_at DESC);

-- Documents queries (course_id, owner_id, chapter are common filters)
CREATE INDEX IF NOT EXISTS idx_documents_course_id ON documents(course_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_chapter ON documents(chapter);
CREATE INDEX IF NOT EXISTS idx_documents_owner_course ON documents(owner_id, course_id);

-- Lessons queries (currently missing critical indexes!)
CREATE INDEX IF NOT EXISTS idx_lessons_document_id ON lessons(document_id);
CREATE INDEX IF NOT EXISTS idx_lessons_section_id ON lessons(section_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_doc_section ON lessons(document_id, section_id);

-- Sections queries (document_id is primary lookup)
CREATE INDEX IF NOT EXISTS idx_sections_document_id ON sections(document_id);
CREATE INDEX IF NOT EXISTS idx_sections_section_number ON sections(section_number);

-- Concepts mastery queries (owner_id, section_id, course_id heavily used)
CREATE INDEX IF NOT EXISTS idx_concepts_mastery_owner ON concepts_mastery(owner_id);
CREATE INDEX IF NOT EXISTS idx_concepts_mastery_section ON concepts_mastery(section_id);
CREATE INDEX IF NOT EXISTS idx_concepts_mastery_course ON concepts_mastery(course_id);
CREATE INDEX IF NOT EXISTS idx_concepts_mastery_owner_section ON concepts_mastery(owner_id, section_id);
CREATE INDEX IF NOT EXISTS idx_concepts_mastery_course_chapter ON concepts_mastery(course_id, chapter);

-- Check-ins queries (concept_id, owner_id for mastery tracking)
CREATE INDEX IF NOT EXISTS idx_check_ins_concept_id ON check_ins(concept_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_owner_id ON check_ins(owner_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_created_at ON check_ins(created_at DESC);

-- Study sessions queries (owner_id, created_at for analytics)
CREATE INDEX IF NOT EXISTS idx_study_sessions_owner_id ON study_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_course_id ON study_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_created_at ON study_sessions(created_at DESC);

-- Jobs table (status for queue processing)
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_id ON jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

-- Print success message
DO $$
BEGIN
  RAISE NOTICE 'Performance indexes created successfully!';
  RAISE NOTICE 'Run ANALYZE to update query planner statistics.';
END $$;
