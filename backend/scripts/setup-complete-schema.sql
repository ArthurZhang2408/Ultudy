-- Complete Database Schema Setup for Ultudy
-- Run this to set up a fresh database with all required tables

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Base tables from 20240712120000_init
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  pages INTEGER,
  course_id UUID,
  chapter TEXT,
  material_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  text TEXT NOT NULL,
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ease REAL,
  interval_days INTEGER,
  due_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quiz_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  topic TEXT,
  score NUMERIC,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE mastery (
  user_id UUID NOT NULL,
  topic TEXT NOT NULL,
  strength REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, topic)
);

-- Courses table from 20251104010000_add_courses_table
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  term TEXT,
  exam_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add course_id foreign key to documents
ALTER TABLE documents ADD CONSTRAINT documents_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL;

-- Concepts from 20251104000000_mvp_v1_schema
CREATE TABLE concepts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  section_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  mastery_level INTEGER DEFAULT 0,
  concept_number INTEGER,
  accuracy NUMERIC,
  times_practiced INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE problem_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  mastery_level INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  accuracy NUMERIC,
  concepts_practiced INTEGER DEFAULT 0
);

-- Sections table from 20251105000000_add_sections_table
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  content TEXT NOT NULL,
  markdown_text TEXT,
  section_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lessons table from 20251104020000_add_lessons_table
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  examples JSONB DEFAULT '[]'::jsonb,
  analogies JSONB DEFAULT '[]'::jsonb,
  key_concepts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add section_id foreign key to concepts
ALTER TABLE concepts ADD CONSTRAINT concepts_section_id_fkey
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;

-- Jobs table from 20251115000000_add_jobs_table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Create indexes for performance
CREATE INDEX idx_chunks_document_id ON chunks(document_id);
CREATE INDEX idx_chunks_page_range ON chunks(page_start, page_end);
CREATE INDEX idx_documents_owner_id ON documents(owner_id);
CREATE INDEX idx_documents_course_id ON documents(course_id);
CREATE INDEX idx_courses_owner_id ON courses(owner_id);
CREATE INDEX idx_sections_document_id ON sections(document_id);
CREATE INDEX idx_sections_owner_id ON sections(owner_id);
CREATE INDEX idx_lessons_section_id ON lessons(section_id);
CREATE INDEX idx_lessons_document_id ON lessons(document_id);
CREATE INDEX idx_concepts_section_id ON concepts(section_id);
CREATE INDEX idx_concepts_course_id ON concepts(course_id);
CREATE INDEX idx_jobs_owner_id ON jobs(owner_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY documents_isolation ON documents
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY courses_isolation ON courses
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY sections_isolation ON sections
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY lessons_isolation ON lessons
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY concepts_isolation ON concepts
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY problem_types_isolation ON problem_types
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY study_sessions_isolation ON study_sessions
  USING (owner_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY jobs_isolation ON jobs
  USING (owner_id = current_setting('app.current_user_id', TRUE));
