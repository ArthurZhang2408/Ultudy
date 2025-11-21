# Chapter-Based PDF Extraction (Testing Mode)

**Last Updated:** 2025-11-20
**Status:** Testing / Experimental
**Purpose:** Document the new chapter-based extraction approach for testing

---

## Overview

This document describes the **new chapter-based PDF extraction approach** that replaces the previous section-based extraction. This is currently in **testing mode** to validate the approach before full rollout.

## What Changed

### Before (Section-Based Extraction)

**User Story:**
- User uploads **one PDF per chapter**
- System extracts **multiple sections** from that chapter
- Response format: **JSON** with sections array
- Each section contains markdown (with `$...$` for equations)
- Equations wrapped in `<eqs>` tags to avoid JSON escaping issues

**Limitations:**
1. Users must split textbooks into individual chapter PDFs
2. Cannot handle PDFs with multiple chapters
3. Cannot merge multiple PDFs for the same chapter
4. JSON escaping causes equation formatting issues

### After (Chapter-Based Extraction)

**User Story:**
- User uploads **any PDF** (single chapter, multiple chapters, or partial chapters)
- System extracts **all chapters** from the PDF
- Response format: **Plain markdown with delimiters** (no JSON)
- Each chapter contains complete faithful markdown
- Equations preserved as-is: `$inline$` and `$$display$$` (no escaping needed)

**Benefits:**
1. ✅ Upload entire textbook in one PDF
2. ✅ Upload multiple PDFs for the same chapter (they merge)
3. ✅ Cleaner equation handling (no JSON escaping)
4. ✅ More faithful content extraction

---

## Technical Implementation

### 1. New LLM Extraction Function

**File:** `backend/src/ingestion/llm_extractor_chapters.js`

**Key Features:**
- Asks Gemini to identify ALL chapters in a PDF
- Uses delimiter-based response format (not JSON):
  ```
  ---CHAPTER_START---
  CHAPTER_NUMBER: 1
  CHAPTER_TITLE: Introduction to Physics
  ---CONTENT_START---
  [Complete markdown content]
  ---CHAPTER_END---
  ```
- Parser extracts chapters from delimited text
- Returns structured array of chapters

**Function Signature:**
```javascript
export async function extractChapters(pdfPath)
// Returns: { chapters: [...], total_chapters: number }
```

### 2. Gemini Vision Provider Enhancement

**File:** `backend/src/providers/llm/gemini_vision.js`

**New Method:**
```javascript
async extractChaptersAsMarkdown(pdfPath, systemPrompt, userPrompt)
// Returns: Raw markdown text with chapter delimiters
```

**Differences from `extractStructuredSections`:**
- No `responseSchema` parameter
- No `application/json` mime type
- Returns plain text (not parsed JSON)
- Validates presence of delimiter markers

### 3. Upload Processor Changes

**File:** `backend/src/jobs/processors/upload.processor.js`

**Changes:**
- Imports `extractChapters` instead of `extractStructuredSections`
- Calls new chapter extraction function
- Stores chapters in `sections` table (reusing existing schema)
- Each row represents a **chapter** (not a section)
- `chapter` field stores the chapter number
- `name` field stores the chapter title
- `markdown_text` field stores the complete chapter markdown

**Database Storage:**
```javascript
// Old: 1 PDF = 1 chapter → many section rows
// New: 1 PDF = many chapters → each chapter is one row

INSERT INTO sections (
  owner_id, document_id, course_id, chapter, section_number,
  name, description, markdown_text
) VALUES (
  $ownerId, $documentId, $courseId,
  $chapterNumber,  // e.g., "1", "2", "3"
  $i,              // Sequential ordering
  $chapterTitle,   // e.g., "Introduction to Physics"
  $description,    // e.g., "Chapter 1: Introduction to Physics"
  $fullMarkdown    // Complete chapter content
)
```

### 4. Frontend Display (Debugging View)

**File:** `frontend/src/app/courses/[id]/page.tsx`

**Changes:**
- Updated `SectionWithMastery` type to include `markdown_text` and `chapter`
- Added FormattedText component import
- Added debugging display section showing chapter content
- Displays extracted chapters with:
  - Chapter number and title
  - Character count
  - Full formatted markdown content
  - Yellow banner indicating testing mode

**API Changes:**
- `frontend/src/app/api/sections/mastery/route.ts` now returns `markdown_text` and `chapter` fields

---

## Testing the New Approach

### Step 1: Upload a PDF

1. Go to any course page
2. Click "Upload Material"
3. Upload a PDF containing **multiple chapters** (e.g., `textbook_chapters_2_3.pdf`)
4. Wait for processing to complete

### Step 2: Verify Extraction

On the course page, you should see:

1. **Yellow Testing Banner:**
   ```
   🧪 TESTING MODE: Chapter Content Preview
   This section displays the raw chapter markdown extracted from your PDF for debugging purposes.
   ```

2. **Chapter Cards:**
   - Each chapter displayed separately
   - Chapter title and number
   - Character count
   - Full formatted markdown content
   - Equations rendered properly (no escaping issues)

### Step 3: Verify Content Quality

Check the extracted markdown for:
- ✅ All equations formatted correctly: `$inline$` and `$$display$$`
- ✅ Tables converted to markdown tables
- ✅ Code blocks preserved
- ✅ Headers and formatting intact
- ✅ No content missing or truncated
- ✅ Chapter boundaries correctly identified

---

## Response Format Examples

### Single Chapter PDF

**Input:** `chapter_3_thermodynamics.pdf`

**Extraction Output:**
```
---CHAPTER_START---
CHAPTER_NUMBER: 3
CHAPTER_TITLE: Thermodynamics
---CONTENT_START---
# Thermodynamics

## Introduction
Thermodynamics is the study of heat and energy transfer...

The first law states: $$\Delta U = Q - W$$

Where:
- $U$ is internal energy
- $Q$ is heat added
- $W$ is work done
---CHAPTER_END---
```

**Database:** 1 row in `sections` table with `chapter = "3"`

### Multiple Chapters PDF

**Input:** `textbook_chapters_1_2.pdf`

**Extraction Output:**
```
---CHAPTER_START---
CHAPTER_NUMBER: 1
CHAPTER_TITLE: Classical Mechanics
---CONTENT_START---
[Chapter 1 content...]
---CHAPTER_END---

---CHAPTER_START---
CHAPTER_NUMBER: 2
CHAPTER_TITLE: Electromagnetism
---CONTENT_START---
[Chapter 2 content...]
---CHAPTER_END---
```

**Database:** 2 rows in `sections` table with `chapter = "1"` and `chapter = "2"`

---

## Equation Handling Comparison

### Old Approach (JSON with `<eqs>` tags)

**Prompt:** "Wrap math in `<eqs>LaTeX</eqs>` tags"

**LLM Output (JSON):**
```json
{
  "markdown": "The equation is <eqs>E = mc^2</eqs> which shows..."
}
```

**Frontend:** Converts `<eqs>` to `$` before rendering

**Issues:**
- Extra preprocessing step needed
- LLM sometimes forgets to wrap equations
- Inconsistent formatting

### New Approach (Plain Markdown)

**Prompt:** "Use `$inline$` and `$$display$$` for math"

**LLM Output (Markdown):**
```markdown
The equation is $E = mc^2$ which shows...

$$E = mc^2$$
```

**Frontend:** Renders directly with FormattedText

**Benefits:**
- ✅ No preprocessing needed
- ✅ Standard LaTeX format
- ✅ No escaping issues
- ✅ More reliable

---

## File Structure

```
backend/src/
├── ingestion/
│   ├── llm_extractor.js           # Old section-based extraction
│   └── llm_extractor_chapters.js  # 🆕 New chapter-based extraction
├── providers/llm/
│   └── gemini_vision.js           # Updated with extractChaptersAsMarkdown
└── jobs/processors/
    └── upload.processor.js        # Updated to use chapter extraction

frontend/src/
├── app/
│   ├── courses/[id]/page.tsx      # Updated with debugging display
│   └── api/sections/mastery/route.ts  # Returns markdown_text
└── components/
    └── FormattedText.tsx          # Renders markdown (existing)
```

---

## Next Steps

### Testing Phase
- [ ] Upload sample PDFs with 1 chapter
- [ ] Upload sample PDFs with multiple chapters
- [ ] Verify equation formatting
- [ ] Verify table conversion
- [ ] Verify code block preservation
- [ ] Check for content truncation

### Validation Phase
- [ ] Compare extraction quality vs old approach
- [ ] Measure extraction time
- [ ] Test with large textbooks (10+ chapters)
- [ ] Test with complex equations
- [ ] Test with tables and diagrams

### Production Rollout
- [ ] Remove old section-based extraction
- [ ] Remove debugging display UI
- [ ] Update concept generation to work with chapters
- [ ] Update documentation
- [ ] Migrate existing data (if needed)

---

## Rollback Plan

If testing reveals issues, rollback is simple:

1. **Backend:** Change `upload.processor.js` to import `extractStructuredSections` again
2. **Frontend:** Remove debugging display section
3. **API:** Remove `markdown_text` from mastery endpoint

**No database changes needed** - both approaches use the `sections` table.

---

## Known Limitations

1. **Concept generation not updated yet** - This testing focuses only on extraction
2. **Debugging view only** - Not integrated with learning flow
3. **No chapter merging** - Multiple PDFs for same chapter create separate rows
4. **LLM dependent** - Chapter identification relies on Gemini's understanding

---

## Questions or Issues?

Check console logs for:
- `[llm_extractor_chapters]` - Chapter extraction progress
- `[gemini_vision]` - LLM response validation
- `[UploadProcessor]` - Database storage

**Report issues with:**
- PDF filename
- Expected vs actual chapter count
- Equation rendering problems
- Missing content
