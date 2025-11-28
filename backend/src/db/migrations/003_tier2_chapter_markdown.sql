-- Tier 2 Chapter Markdown Storage
-- Stores extracted markdown content for individual chapters
-- One row per chapter extraction (smallest unit)

CREATE TABLE IF NOT EXISTS chapter_markdown (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  chapter_number INTEGER NOT NULL,
  chapter_title VARCHAR(500) NOT NULL,
  markdown_content TEXT NOT NULL,
  page_start INTEGER,
  page_end INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for efficient querying by course and chapter
CREATE INDEX IF NOT EXISTS idx_chapter_markdown_course
ON chapter_markdown(course_id, chapter_number);

-- Index for finding all chapters from a document
CREATE INDEX IF NOT EXISTS idx_chapter_markdown_document
ON chapter_markdown(document_id);

-- Index for owner queries
CREATE INDEX IF NOT EXISTS idx_chapter_markdown_owner
ON chapter_markdown(owner_id);

COMMENT ON TABLE chapter_markdown IS 'Tier 2: Stores extracted markdown for individual chapters from textbooks/lecture notes';
COMMENT ON COLUMN chapter_markdown.markdown_content IS 'Full markdown extraction with image descriptions, formulas, etc.';
