-- Tier 2 Summary Extraction
-- Adds summary column for multi-source lesson generation

-- Add summary column to chapter_markdown
-- This stores the LLM-generated summary extracted during upload
-- Used when this chapter serves as a supplemental source (primary gets full content, supplements get summary)
ALTER TABLE chapter_markdown
ADD COLUMN chapter_summary TEXT;

COMMENT ON COLUMN chapter_markdown.chapter_summary IS 'LLM-generated 2-3 paragraph summary for use in supplemental sources during multi-source lesson generation';
