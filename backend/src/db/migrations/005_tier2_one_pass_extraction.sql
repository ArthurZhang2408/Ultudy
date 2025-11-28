-- Tier 2 One-Pass Extraction Enhancement
-- Adds summary storage and section caching for efficient lesson generation

-- Add summary column to chapter_markdown
-- This stores the LLM-generated summary extracted during upload
ALTER TABLE chapter_markdown
ADD COLUMN chapter_summary TEXT;

COMMENT ON COLUMN chapter_markdown.chapter_summary IS 'LLM-generated 2-3 paragraph summary for use in supplemental sources';

-- Create tier2_sections table
-- Caches sections extracted during upload for instant retrieval
CREATE TABLE IF NOT EXISTS tier2_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_markdown_id UUID NOT NULL REFERENCES chapter_markdown(id) ON DELETE CASCADE,
  section_number INTEGER NOT NULL,
  section_name VARCHAR(500) NOT NULL,
  section_description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Ensure each section number is unique per chapter
  CONSTRAINT unique_chapter_section UNIQUE (chapter_markdown_id, section_number)
);

-- Index for efficient section retrieval by chapter
CREATE INDEX IF NOT EXISTS idx_tier2_sections_chapter
ON tier2_sections(chapter_markdown_id);

-- Index for ordering sections
CREATE INDEX IF NOT EXISTS idx_tier2_sections_order
ON tier2_sections(chapter_markdown_id, section_number);

COMMENT ON TABLE tier2_sections IS 'Tier 2: Caches extracted sections from chapter markdown for instant retrieval';
COMMENT ON COLUMN tier2_sections.section_number IS 'Sequential section number within the chapter (1, 2, 3, ...)';
COMMENT ON COLUMN tier2_sections.section_name IS 'Section title/name (e.g., "Introduction to Networks")';
COMMENT ON COLUMN tier2_sections.section_description IS 'Brief description of section content';
