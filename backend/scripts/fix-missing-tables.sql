-- Script to manually run remaining migrations
-- Run this directly on your database to create missing tables

-- Migration: 20251101000000_add_owner_to_documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_id TEXT;

-- Migration: 20251103000000_enable_rls
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS documents_isolation ON documents
  USING (owner_id = current_setting('app.current_user_id', TRUE));

-- Migration: 20251104000000_mvp_v1_schema (concepts, problem_types, study_sessions)
CREATE TABLE IF NOT EXISTS concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  mastery_level INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS problem_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  mastery_level INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  accuracy NUMERIC,
  concepts_practiced INTEGER DEFAULT 0
);

-- Migration: 20251104010000_add_courses_table
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  term TEXT,
  exam_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chapter TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS material_type TEXT;

ALTER TABLE concepts ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE problem_types ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;

-- Migration: 20251104020000_add_lessons_table
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  examples JSONB DEFAULT '[]'::jsonb,
  analogies JSONB DEFAULT '[]'::jsonb,
  key_concepts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: 20251105000000_add_sections_table
CREATE TABLE IF NOT EXISTS sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  content TEXT NOT NULL,
  section_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE CASCADE;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE CASCADE;

-- Migration: 20251106000000_add_section_indexes
CREATE INDEX IF NOT EXISTS idx_sections_document_id ON sections(document_id);
CREATE INDEX IF NOT EXISTS idx_sections_owner_id ON sections(owner_id);
CREATE INDEX IF NOT EXISTS idx_lessons_section_id ON lessons(section_id);
CREATE INDEX IF NOT EXISTS idx_concepts_section_id ON concepts(section_id);

-- Migration: 20251111000000_add_markdown_text_to_sections
ALTER TABLE sections ADD COLUMN IF NOT EXISTS markdown_text TEXT;

-- Migration: 20251112000000_add_concept_number_to_concepts
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS concept_number INTEGER;

-- Migration: 20251115000000_add_jobs_table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  data JSONB DEFAULT '{}'::jsonb,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_owner_id ON jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

-- Migration: 20251115100000_add_concepts_columns
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS accuracy NUMERIC;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS times_practiced INTEGER DEFAULT 0;

-- Enable RLS on new tables
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY IF NOT EXISTS courses_isolation ON courses
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY IF NOT EXISTS sections_isolation ON sections
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY IF NOT EXISTS lessons_isolation ON lessons
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY IF NOT EXISTS concepts_isolation ON concepts
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY IF NOT EXISTS problem_types_isolation ON problem_types
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY IF NOT EXISTS study_sessions_isolation ON study_sessions
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY IF NOT EXISTS jobs_isolation ON jobs
  USING (owner_id = current_setting('app.current_user_id', TRUE));
