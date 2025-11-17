-- Production Database Schema Setup for Ultudy
-- This matches the exact working local database schema
-- Safe to run on empty Neon database

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create pgvector extension if available (optional, for future use)
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- CORE TABLES (in dependency order)
-- ============================================================================

-- 1. Courses (no dependencies)
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  name VARCHAR(500) NOT NULL,
  code VARCHAR(50),
  term VARCHAR(50),
  exam_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX courses_owner_id_created_at_index ON courses(owner_id, created_at);

-- 2. Documents (depends on courses)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  pages INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  owner_id TEXT NOT NULL,
  full_text TEXT,
  material_type VARCHAR(50),
  chapter VARCHAR(100),
  user_tags TEXT[] DEFAULT ARRAY[]::text[],
  course_id UUID
);

ALTER TABLE documents ADD CONSTRAINT documents_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

CREATE INDEX documents_owner_id_course_id_index ON documents(owner_id, course_id);
CREATE INDEX documents_owner_id_index ON documents(owner_id);
CREATE INDEX idx_documents_chapter ON documents(chapter);

-- 3. Chunks (depends on documents)
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  text TEXT NOT NULL,
  token_count INTEGER,
  embedding vector,
  created_at TIMESTAMPTZ DEFAULT now(),
  owner_id TEXT NOT NULL
);

ALTER TABLE chunks ADD CONSTRAINT chunks_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

CREATE INDEX chunks_document_id_index ON chunks(document_id);
CREATE INDEX chunks_owner_id_index ON chunks(owner_id);
CREATE INDEX chunks_page_start_page_end_index ON chunks(page_start, page_end);

-- 4. Sections (depends on documents and courses)
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  document_id UUID NOT NULL,
  course_id UUID,
  chapter VARCHAR(100),
  section_number INTEGER NOT NULL,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  page_start INTEGER,
  page_end INTEGER,
  concepts_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  markdown_text TEXT
);

ALTER TABLE sections ADD CONSTRAINT sections_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE sections ADD CONSTRAINT sections_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

CREATE INDEX idx_sections_concepts_generated ON sections(concepts_generated);
CREATE INDEX idx_sections_document_owner ON sections(owner_id, document_id);
CREATE INDEX idx_sections_section_number ON sections(section_number);
CREATE INDEX sections_document_id_section_number_index ON sections(document_id, section_number);
CREATE INDEX sections_owner_id_course_id_index ON sections(owner_id, course_id);
CREATE INDEX sections_owner_id_document_id_index ON sections(owner_id, document_id);

-- 5. Lessons (depends on documents, courses, sections)
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  document_id UUID NOT NULL,
  course_id UUID,
  chapter VARCHAR(100),
  summary TEXT,
  explanation TEXT NOT NULL,
  examples JSONB DEFAULT '[]'::jsonb,
  analogies JSONB DEFAULT '[]'::jsonb,
  concepts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  section_id UUID
);

ALTER TABLE lessons ADD CONSTRAINT lessons_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE lessons ADD CONSTRAINT lessons_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

ALTER TABLE lessons ADD CONSTRAINT lessons_section_id_fkey
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;

CREATE INDEX idx_lessons_course_id ON lessons(course_id);
CREATE INDEX idx_lessons_document_id ON lessons(document_id);
CREATE INDEX idx_lessons_section_id ON lessons(section_id);
CREATE INDEX lessons_owner_id_course_id_chapter_index ON lessons(owner_id, course_id, chapter);
CREATE INDEX lessons_owner_id_document_id_index ON lessons(owner_id, document_id);
CREATE UNIQUE INDEX lessons_owner_section_unique ON lessons(owner_id, section_id);

-- 6. Concepts (depends on documents, courses, sections, lessons)
CREATE TABLE concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  name VARCHAR(500) NOT NULL,
  chapter VARCHAR(100),
  document_id UUID,
  mastery_state VARCHAR(50) NOT NULL DEFAULT 'not_learned',
  total_attempts INTEGER NOT NULL DEFAULT 0,
  correct_attempts INTEGER NOT NULL DEFAULT 0,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  course_id UUID,
  section_id UUID,
  concept_number INTEGER,
  lesson_id UUID
);

ALTER TABLE concepts ADD CONSTRAINT concepts_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE concepts ADD CONSTRAINT concepts_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

ALTER TABLE concepts ADD CONSTRAINT concepts_section_id_fkey
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL;

ALTER TABLE concepts ADD CONSTRAINT concepts_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE SET NULL;

CREATE INDEX concepts_lesson_id_index ON concepts(lesson_id);
CREATE INDEX concepts_owner_id_chapter_index ON concepts(owner_id, chapter);
CREATE INDEX concepts_owner_id_course_id_chapter_index ON concepts(owner_id, chapter, course_id);
CREATE INDEX concepts_owner_id_mastery_state_index ON concepts(owner_id, mastery_state);
CREATE INDEX concepts_owner_id_section_id_index ON concepts(owner_id, section_id);
CREATE INDEX idx_concepts_course_id ON concepts(course_id);
CREATE INDEX idx_concepts_document_id ON concepts(document_id);
CREATE INDEX idx_concepts_owner_course_chapter_concept_number ON concepts(owner_id, chapter, course_id, concept_number);
CREATE INDEX idx_concepts_section_id ON concepts(section_id);

-- 7. Problem Types (depends on courses)
CREATE TABLE problem_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  name VARCHAR(500) NOT NULL,
  chapter VARCHAR(100),
  related_concepts UUID[] DEFAULT ARRAY[]::uuid[],
  mastery_state VARCHAR(50) NOT NULL DEFAULT 'not_practiced',
  total_attempts INTEGER NOT NULL DEFAULT 0,
  correct_attempts INTEGER NOT NULL DEFAULT 0,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  course_id UUID
);

ALTER TABLE problem_types ADD CONSTRAINT problem_types_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

CREATE INDEX idx_problem_types_course_id ON problem_types(course_id);
CREATE INDEX problem_types_owner_id_chapter_index ON problem_types(owner_id, chapter);
CREATE INDEX problem_types_owner_id_course_id_chapter_index ON problem_types(owner_id, chapter, course_id);
CREATE INDEX problem_types_owner_id_mastery_state_index ON problem_types(owner_id, mastery_state);

-- 8. Study Sessions (depends on documents, courses)
CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  session_type VARCHAR(50) NOT NULL,
  chapter VARCHAR(100),
  document_id UUID,
  concepts_covered UUID[] DEFAULT ARRAY[]::uuid[],
  problems_attempted UUID[] DEFAULT ARRAY[]::uuid[],
  total_check_ins INTEGER NOT NULL DEFAULT 0,
  correct_check_ins INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER,
  started_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP,
  course_id UUID
);

ALTER TABLE study_sessions ADD CONSTRAINT study_sessions_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE study_sessions ADD CONSTRAINT study_sessions_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

CREATE INDEX idx_study_sessions_course_id ON study_sessions(course_id);
CREATE INDEX study_sessions_owner_id_chapter_index ON study_sessions(owner_id, chapter);
CREATE INDEX study_sessions_owner_id_course_id_started_at_index ON study_sessions(owner_id, started_at, course_id);
CREATE INDEX study_sessions_owner_id_started_at_index ON study_sessions(owner_id, started_at);

-- 9. Jobs (no dependencies)
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  data JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX jobs_created_at_idx ON jobs(created_at);
CREATE INDEX jobs_owner_id_idx ON jobs(owner_id);
CREATE INDEX jobs_owner_id_status_idx ON jobs(owner_id, status);
CREATE INDEX jobs_owner_id_type_status_idx ON jobs(owner_id, type, status);
CREATE INDEX jobs_status_idx ON jobs(status);
CREATE INDEX jobs_type_idx ON jobs(type);

-- ============================================================================
-- LEGACY TABLES (minimal usage but kept for compatibility)
-- ============================================================================

-- Cards (depends on chunks)
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  chunk_id UUID,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ease REAL,
  interval_days INTEGER,
  due_at DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cards ADD CONSTRAINT cards_chunk_id_fkey
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE SET NULL;

-- Quiz Runs
CREATE TABLE quiz_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  topic TEXT,
  score NUMERIC,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- Mastery
CREATE TABLE mastery (
  user_id UUID NOT NULL,
  topic TEXT NOT NULL,
  strength REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, topic)
);

-- ============================================================================
-- COMPLETE
-- ============================================================================
