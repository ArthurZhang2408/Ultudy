-- Allow NULL chapter_number for uncategorized tier 2 sources
-- This enables users to have uncategorized sources that haven't been assigned to a chapter yet

ALTER TABLE chapter_markdown
  ALTER COLUMN chapter_number DROP NOT NULL;

COMMENT ON COLUMN chapter_markdown.chapter_number IS 'Chapter number (NULL for uncategorized sources)';
