# Tier 2 Lesson Generation - Detailed Planning Document

**Last Updated:** 2025-11-28 (Revised)
**Status:** Planning Phase - Architecture Updated
**Purpose:** Comprehensive architectural design for tier 2 multi-source lesson generation

## ⚠️ CRITICAL DESIGN CONSTRAINT

**NEVER use markdown inside JSON.** All LLM responses must be pure markdown or pure JSON, never mixed.
- ✅ Good: LLM returns markdown, we parse it
- ✅ Good: LLM returns JSON with string fields
- ❌ Bad: JSON with markdown-formatted string values

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Current State Analysis](#current-state-analysis)
3. [Proposed Architecture](#proposed-architecture)
4. [Modular Component Design](#modular-component-design)
5. [Data Flow](#data-flow)
6. [API Design](#api-design)
7. [Implementation Phases](#implementation-phases)
8. [Testing Strategy](#testing-strategy)
9. [Open Questions](#open-questions)

---

## System Overview

### Tier 1 Lesson Generation (Current)

**Input:** Single PDF file uploaded by user

**Extraction Process:**
1. PDF → Full markdown extraction (via Gemini Vision)
2. Markdown → Section detection (LLM extracts 4-8 sections)
3. Each section → Split markdown by section boundaries
4. Store: `documents.full_text` contains full markdown

**Lesson Generation Process:**
1. User selects a section from the course page
2. Backend extracts that section's markdown text using `extractSectionText()`
3. LLM (`generateFullContextLesson()`) receives:
   - `full_text`: section-scoped markdown
   - `section_name`: section title
   - `section_description`: section overview
4. LLM generates 6-15 concepts in markdown format
5. Concepts parsed and returned to frontend

**Key Files:**
- `backend/src/study/section.service.js` - Section extraction logic
- `backend/src/study/service.js` - `buildFullContextLesson()` wrapper
- `backend/src/providers/llm/gemini.js` - `generateFullContextLesson()` and prompt building
- `backend/src/routes/study.js` - API endpoint for lesson generation

### Tier 2 Extraction (Current - Complete)

**Input:** Single or multi-chapter PDFs

**Extraction Process:**
1. PDF uploaded → Detection phase (single vs multi-chapter)
2. **If single chapter:**
   - Extract markdown immediately
   - Store in `chapter_markdown` table (one row)
3. **If multi-chapter:**
   - Show chapter selection modal
   - User selects chapters
   - Queue individual extraction jobs (one per chapter)
   - Each chapter stored as separate row in `chapter_markdown`

**Storage Schema (Current):**
```sql
chapter_markdown (
  id UUID PRIMARY KEY,
  owner_id TEXT,
  document_id UUID,
  course_id UUID,
  chapter_number INTEGER,
  chapter_title VARCHAR(500),
  markdown_content TEXT,  -- Full markdown for this chapter
  page_start INTEGER,
  page_end INTEGER
)
```

**Storage Schema (Updated - Add Summary Field):**
```sql
chapter_markdown (
  id UUID PRIMARY KEY,
  owner_id TEXT,
  document_id UUID,
  course_id UUID,
  chapter_number INTEGER,
  chapter_title VARCHAR(500),
  markdown_content TEXT,     -- Full markdown extraction
  chapter_summary TEXT,       -- NEW: Concise summary of chapter (2-3 paragraphs)
  page_start INTEGER,
  page_end INTEGER,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

**Key Files:**
- `backend/src/services/tier2Detection.js` - Single/multi detection
- `backend/src/services/tier2Extraction.js` - Chapter extraction
- `backend/src/jobs/processors/chapterExtraction.processor.js` - Job processor
- `backend/src/routes/tier2.js` - API endpoints

**API Endpoints:**
- `GET /tier2/chapter-sources/:courseId` - List all chapter sources for a course
- `GET /tier2/chapter-markdown/:id` - Get specific chapter markdown
- `POST /tier2/extract-chapters` - Queue chapter extractions

---

## Current State Analysis

### What Works ✅
1. **Tier 1:** Single file → sections → section-scoped lesson generation
2. **Tier 2:** Multi-chapter PDF → chapter extraction → stored in `chapter_markdown`
3. **Tier 2:** Frontend can list and view chapter markdown sources
4. **Tier 2:** Chapters grouped by `chapter_number` (allows multiple sources per logical chapter)

### What's Missing ❌
1. **No summary extraction during upload** - Need to extract chapter summaries alongside markdown
2. **No lesson generation for tier 2 sources** - Can view markdown but can't generate lessons
3. **No multi-source selection UI** - Can't select which sources to include
4. **No primary/supplement source designation** - All sources treated equally
5. **No intelligent source combination** - Need primary full text + supplement summaries approach
6. **No tier 2 lesson generation API** - Need new endpoint architecture

### Current Challenges & Solutions

#### Challenge 1: Token Efficiency with Multiple Sources
- **Problem:** Sending 3 full chapter markdowns to LLM = massive token count
  - Example: 3 × 50 pages = 150 pages × 2000 chars/page = 300,000 tokens
  - Cost and context window issues
- **Solution:** **Primary full markdown + supplement summaries**
  - Primary source: Full markdown (50 pages = 100,000 tokens)
  - Supplement 1: Summary only (~500 words = 2,000 tokens)
  - Supplement 2: Summary only (~500 words = 2,000 tokens)
  - **Total:** ~104,000 tokens (65% reduction!)

#### Challenge 2: Section Extraction Timing
- **Old Approach:** Extract sections during upload (complicates upload flow)
- **New Approach:** Extract sections at lesson generation time
  - Extraction: Just get markdown + summary (fast)
  - Lesson generation: Combine sources → extract sections → display list
  - **Benefit:** Reuses tier 1 section extraction logic directly
  - **Benefit:** Sections based on combined context (primary + supplement summaries)

#### Challenge 3: Summary Quality
- **Need:** High-quality summaries that capture key concepts
- **Solution:** Dedicated summary prompt during extraction
  - Request: "2-3 paragraph summary covering main topics, key concepts, formulas"
  - Post-process: Clean markdown formatting
  - Store separately: `chapter_summary` field in database

---

## Proposed Architecture

### Design Principles

1. **Modularity:** Each component (extraction, merging, generation) is swappable
2. **Separation of Concerns:** Source selection ≠ merging ≠ lesson generation
3. **Backward Compatibility:** Tier 1 continues to work unchanged
4. **Testability:** Each module can be tested independently
5. **Traceability:** Easy to trace errors to specific module

### High-Level Flow (Revised Architecture)

```
┌────────────────────────────────────────────────────────────────┐
│  PHASE 1: Enhanced Extraction (Updated Upload Process)        │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Chapter Extraction (tier2Extraction.js - UPDATED)            │
│  • Extract markdown (existing)                                │
│  • NEW: Extract chapter summary (2-3 paragraphs)              │
│  • Post-process both for clean markdown formatting            │
│  • Store in chapter_markdown table:                           │
│    - markdown_content: Full chapter markdown                  │
│    - chapter_summary: Concise summary                         │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  PHASE 2: Lesson Generation Flow                              │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Frontend: Source Selection UI                                │
│  • User selects: primary source + optional supplements        │
│  • Clicks "Generate Lesson"                                   │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Step 1: Smart Source Aggregation                             │
│  • Fetch primary source: Use FULL markdown_content            │
│  • Fetch supplements: Use ONLY chapter_summary (not full)     │
│  • Combine:                                                    │
│    Primary (full) + Supplement 1 (summary) + Supplement 2...  │
│  Output: Combined markdown text                               │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Step 2: Section Extraction (Reuse Tier 1 Logic!)             │
│  • Pass combined markdown to extractSectionsWithLLM()         │
│  • LLM analyzes full primary + supplement context             │
│  • Returns 4-8 sections in PURE MARKDOWN                      │
│  • Post-process markdown to extract section list              │
│  Output: Sections array                                       │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Frontend: Display Section List (Like Tier 1)                 │
│  • User sees sections: "Introduction", "Core Concepts", etc.  │
│  • User clicks on section to learn                            │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Step 3: Section-Scoped Lesson Generation                     │
│  • Extract section markdown from combined text                │
│  • Call generateFullContextLesson() (existing tier 1 logic)   │
│  • Generate 6-15 concepts for this section                    │
│  Output: Lesson with concepts                                 │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Storage: Lessons Table                                        │
│  • Store lesson concepts                                       │
│  • Link to source_ids (array of chapter_markdown IDs)         │
│  • Track which was primary                                    │
└────────────────────────────────────────────────────────────────┘
```

**Key Changes from Original Plan:**
1. **Extraction now includes summary** - One-time cost during upload
2. **No separate merge strategies** - Simple pattern: primary full + supplement summaries
3. **Section extraction happens at generation time** - Not during upload
4. **Direct reuse of tier 1 section extraction** - Pass combined markdown to existing function
5. **All markdown, no JSON mixing** - LLM returns pure markdown, we parse it

---

## Modular Component Design (Revised)

### Module 0: Enhanced Extraction (Update Existing)

**Purpose:** Extract both markdown AND summary during chapter extraction

**Changes to Existing Files:**
- **File:** `backend/src/services/tier2Extraction.js` (UPDATE)
- **File:** `backend/src/services/tier2Detection.js` (UPDATE)

**New Extraction Process:**

**Step 1: Call LLM for extraction + summary**
```
System Prompt: "Extract this chapter as markdown AND provide a summary"

User Prompt:
"Extract Chapter 5 as clean markdown, then provide a 2-3 paragraph summary.

RESPONSE FORMAT (PURE MARKDOWN):

# CHAPTER_CONTENT

[Full markdown extraction here...]

---

# CHAPTER_SUMMARY

[2-3 paragraph summary covering:
- Main topics discussed
- Key concepts and definitions
- Important formulas/algorithms
- Real-world applications]
"
```

**Step 2: Post-process LLM response**
```javascript
// Parse the markdown response
const sections = response.split('---');
const markdownContent = extractSection(sections[0], 'CHAPTER_CONTENT');
const chapterSummary = extractSection(sections[1], 'CHAPTER_SUMMARY');

// Clean markdown formatting (remove extra headers, normalize)
const cleanedMarkdown = postProcessMarkdown(markdownContent);
const cleanedSummary = postProcessMarkdown(chapterSummary);

return {
  chapterNumber,
  chapterTitle,
  markdown: cleanedMarkdown,
  summary: cleanedSummary  // NEW!
};
```

**Step 3: Store both in database**
```sql
INSERT INTO chapter_markdown (
  owner_id, document_id, course_id,
  chapter_number, chapter_title,
  markdown_content,   -- Full extraction
  chapter_summary     -- NEW: Summary
) VALUES (...);
```

**Why This Approach?**
- ✅ One LLM call (not two separate calls)
- ✅ Summary is contextually aware of full content
- ✅ Post-processing ensures clean markdown (no JSON mixing)
- ✅ Summaries cached for future lesson generations

---

### Module 1: Smart Source Aggregation (Simplified)

**Purpose:** Combine primary full markdown with supplement summaries

**Input:**
```javascript
{
  primarySourceId: "uuid1",
  supplementSourceIds: ["uuid2", "uuid3"]
}
```

**Process:**
1. Fetch primary source from chapter_markdown
2. Fetch supplement sources
3. Build combined markdown:
   ```markdown
   # PRIMARY SOURCE: [Primary Chapter Title]

   [Full markdown_content from primary source]

   ---

   # SUPPLEMENTARY CONTEXT: [Supplement 1 Title]

   [chapter_summary from supplement 1]

   ---

   # SUPPLEMENTARY CONTEXT: [Supplement 2 Title]

   [chapter_summary from supplement 2]
   ```

**Output:**
```javascript
{
  combinedMarkdown: "...",   // Primary full + supplement summaries
  sourceIds: ["uuid1", "uuid2", "uuid3"],
  primarySourceId: "uuid1"
}
```

**Implementation:**
- **File:** `backend/src/services/tier2Aggregation.service.js` (NEW)
- **Complexity:** Low - just string concatenation with delimiters
- **Token Efficiency:** 65% reduction vs all full markdowns

**Why This Works:**
- Primary source has full detail for section extraction
- Supplements provide context without overwhelming token count
- LLM can reference supplement summaries when generating concepts
- Natural language approach (markdown, not JSON)

---

### Module 2: Section Extraction (Direct Reuse!)

**Purpose:** Extract sections from combined markdown

**Implementation:**
```javascript
// backend/src/services/tier2Lesson.service.js

import { extractSections } from '../study/section.service.js';

export async function extractTier2Sections(combinedMarkdown, chapterTitle) {
  // Pass combined markdown to existing tier 1 function!
  const sections = await extractSections({
    full_text: combinedMarkdown,
    title: chapterTitle
  });

  return sections;
}
```

**That's it!** We literally just call the existing tier 1 section extraction function with the combined markdown. It:
- Analyzes the combined text (primary + supplement summaries)
- Extracts 4-8 sections
- Returns pure markdown section list
- Post-processes to get clean section metadata

**No new extraction logic needed.**

---

### Module 3: Lesson Generation (Direct Reuse!)

**Purpose:** Generate lesson from section markdown

**Implementation:**
```javascript
// backend/src/services/tier2Lesson.service.js

import { createStudyService } from '../study/service.js';

export async function generateTier2Lesson({
  sectionMarkdown,
  sectionName,
  sectionDescription,
  sourceIds,
  primarySourceId,
  chapterNumber,
  chapterTitle
}) {
  const studyService = createStudyService();

  // Call existing tier 1 lesson generation!
  const lesson = await studyService.buildFullContextLesson(
    { full_text: sectionMarkdown },  // Dummy document object
    {
      section_name: sectionName,
      section_description: sectionDescription,
      full_text_override: sectionMarkdown
    }
  );

  // Add tier 2 metadata
  lesson.source_ids = sourceIds;
  lesson.primary_source_id = primarySourceId;
  lesson.chapter_number = chapterNumber;

  return lesson;
}
```

**Again, direct reuse!** The existing `generateFullContextLesson()` handles everything.

---

## Summary of Revised Architecture

**Old Plan:** 4 complex modules with custom merge strategies
**New Plan:** 3 simple modules, mostly reusing tier 1 logic

| Module | Complexity | New Code |
|--------|------------|----------|
| **Module 0:** Enhanced Extraction | Low | Update existing extraction prompts |
| **Module 1:** Smart Aggregation | Very Low | Simple string concatenation |
| **Module 2:** Section Extraction | Zero | Direct reuse of tier 1 |
| **Module 3:** Lesson Generation | Zero | Direct reuse of tier 1 |

**Total New Code:** ~200 lines (vs 1000+ in old plan)

---

### Database Schema Changes

**Migration Required:**
```sql
-- Add chapter_summary column to chapter_markdown table
ALTER TABLE chapter_markdown
ADD COLUMN chapter_summary TEXT;

-- Optional: Add index if we filter by summary presence
CREATE INDEX idx_chapter_markdown_has_summary
ON chapter_markdown((chapter_summary IS NOT NULL));
```

**Updated Table:**
```sql
chapter_markdown (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  chapter_number INTEGER NOT NULL,
  chapter_title VARCHAR(500) NOT NULL,
  markdown_content TEXT NOT NULL,     -- Full markdown extraction
  chapter_summary TEXT,                -- NEW: 2-3 paragraph summary
  page_start INTEGER,
  page_end INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Data Flow (Revised)

### Scenario 1: Single Source (Simplest)

**User Actions:**
1. Goes to course page
2. Sees "Chapter 5: Networks" with one source (Textbook)
3. Clicks "Generate Lesson for Chapter 5"

**Backend Flow:**
```
1. POST /api/tier2/generate-lesson
   Body: {
     primarySourceId: "uuid1"
     // No supplements
   }

2. Smart Aggregation (Module 1):
   - Fetch chapter_markdown WHERE id = uuid1
   - Extract markdown_content (full markdown)
   - Single source, so combinedMarkdown = markdown_content
   - Output: { combinedMarkdown: "...", sourceIds: ["uuid1"] }

3. Section Extraction (Module 2):
   - Call extractSections({ full_text: combinedMarkdown, ... })
   - Reuses tier 1 section extraction logic
   - LLM returns 4-8 sections in PURE MARKDOWN
   - Post-process to parse section list
   - Output: sections = [...]

4. Frontend displays section list

5. User clicks on "Section 1: Introduction"

6. POST /api/tier2/generate-section-lesson
   Body: {
     primarySourceId: "uuid1",
     sectionName: "Introduction"
   }

7. Section Lesson Generation (Module 3):
   - Extract section markdown from combinedMarkdown
   - Call generateFullContextLesson({
       full_text: sectionMarkdown,
       section_name: "Introduction",
       ...
     })
   - Reuses tier 1 lesson generation logic
   - Output: { concepts: [...], source_ids: ["uuid1"] }

8. Return lesson to frontend
```

**Timeline:**
- Section extraction (one-time): ~10-20 seconds
- Lesson generation per section: ~15-30 seconds

---

### Scenario 2: Multi-Source (Full Power!)

**User Actions:**
1. Goes to course page
2. Sees "Chapter 5: Networks" with 3 sources:
   - Computer Networks.pdf (Textbook)
   - Lecture 5.pdf (Lecture Notes)
   - Study Guide.pdf
3. Clicks "Configure Sources" → Opens modal
4. Selects:
   - Primary: Textbook
   - Supplements: Lecture Notes, Study Guide
5. Clicks "Generate Lesson"

**Backend Flow:**
```
1. POST /api/tier2/generate-lesson
   Body: {
     primarySourceId: "uuid1",
     supplementSourceIds: ["uuid2", "uuid3"]
   }

2. Smart Aggregation (Module 1):
   - Fetch chapter_markdown for all 3 IDs
   - Build combined markdown:
     ```
     # PRIMARY SOURCE: Computer Networks
     [FULL markdown_content from uuid1]

     ---

     # SUPPLEMENTARY CONTEXT: Lecture Notes
     [chapter_summary from uuid2]  ← Note: summary only!

     ---

     # SUPPLEMENTARY CONTEXT: Study Guide
     [chapter_summary from uuid3]  ← Note: summary only!
     ```
   - Output: { combinedMarkdown: "...", sourceIds: [...], primarySourceId: "uuid1" }

3. Section Extraction (Module 2):
   - Call extractSections({ full_text: combinedMarkdown, ... })
   - LLM sees:
     * Full detail from primary source
     * Summaries from supplements (for context)
   - Extracts 4-8 sections based on combined context
   - Post-process markdown to get section list
   - Output: sections = [...]

4. Frontend displays section list

5. User clicks on "Section 1: Introduction"

6. POST /api/tier2/generate-section-lesson
   Body: {
     primarySourceId: "uuid1",
     supplementSourceIds: ["uuid2", "uuid3"],
     sectionName: "Introduction"
   }

7. Section Lesson Generation (Module 3):
   - Re-build combined markdown (primary full + supplement summaries)
   - Extract section markdown from combined text
   - Call generateFullContextLesson({
       full_text: sectionMarkdown,  // Includes primary detail + supplement summaries
       section_name: "Introduction",
       ...
     })
   - LLM generates concepts using:
     * Detailed content from primary source
     * Contextual info from supplement summaries
   - Output: { concepts: [...], source_ids: ["uuid1", "uuid2", "uuid3"] }

8. Return lesson with source attribution
```

**Timeline:**
- Section extraction (one-time): ~10-20 seconds
- Lesson generation per section: ~20-35 seconds (slightly longer due to more tokens)

**Token Breakdown:**
- Primary source markdown: ~100,000 tokens
- Supplement 1 summary: ~2,000 tokens
- Supplement 2 summary: ~2,000 tokens
- **Total:** ~104,000 tokens (vs 300,000 if all full markdowns!)

---

### Key Insight: Why This Works

**Primary Source = Full Detail:**
- Section extraction needs complete structure → Use full markdown
- Lesson generation needs examples, formulas, details → Primary has them all

**Supplement Sources = Context:**
- Summaries provide:
  - Alternative explanations of same concepts
  - Different examples or perspectives
  - Complementary information
- Don't need full text because primary provides structure
- Summaries = 2% of full text but capture 80% of key concepts

**Result:**
- LLM gets comprehensive context
- Token efficiency (65% reduction)
- High quality lessons (all sources inform generation)
- No complex merge logic needed

---

## API Design (Revised - Simplified!)

### 1. POST /api/tier2/generate-lesson

**Purpose:** Generate sections from combined sources, return section list

**Request (Single Source):**
```json
{
  "primarySourceId": "uuid1"
}
```

**Request (Multi-Source):**
```json
{
  "primarySourceId": "uuid1",
  "supplementSourceIds": ["uuid2", "uuid3"]
}
```

**Response:**
```json
{
  "sections": [
    {
      "section_number": 1,
      "name": "Introduction to Networks",
      "description": "Basic network concepts and terminology"
    },
    {
      "section_number": 2,
      "name": "Network Protocols",
      "description": "TCP/IP and protocol stacks"
    }
    // ... 4-8 sections total
  ],
  "sourceIds": ["uuid1", "uuid2", "uuid3"],
  "primarySourceId": "uuid1"
}
```

**Implementation:**
1. Fetch primary chapter_markdown (get full markdown_content)
2. Fetch supplements (get chapter_summary only)
3. Combine: primary full + supplement summaries
4. Call `extractSections()` on combined markdown
5. Parse markdown response to get section list
6. Return sections

**Timeline:** ~10-20 seconds (one LLM call)

---

### 2. POST /api/tier2/generate-section-lesson

**Purpose:** Generate lesson for a specific section

**Request:**
```json
{
  "primarySourceId": "uuid1",
  "supplementSourceIds": ["uuid2", "uuid3"],
  "sectionName": "Introduction to Networks"
}
```

**Response:**
```json
{
  "lesson": {
    "concepts": [
      {
        "name": "Network Topology",
        "explanation": "...",
        "formulas": [...],
        "examples": [...],
        "important_notes": [...],
        "check_ins": [...]
      }
      // ... 6-15 concepts
    ]
  },
  "sourceIds": ["uuid1", "uuid2", "uuid3"],
  "primarySourceId": "uuid1",
  "sectionName": "Introduction to Networks"
}
```

**Implementation:**
1. Fetch primary chapter_markdown (get full markdown_content)
2. Fetch supplements (get chapter_summary only)
3. Combine: primary full + supplement summaries
4. Extract section markdown from combined text
5. Call `generateFullContextLesson()` with section markdown
6. Return lesson concepts

**Timeline:** ~15-30 seconds (one LLM call)

---

### Database Changes

**Migration 1: Add Summary Column**
```sql
ALTER TABLE chapter_markdown
ADD COLUMN chapter_summary TEXT;
```

**No New Tables Needed!**
- No `tier2_sections` table (sections extracted on-demand, not cached)
- Reuse existing `lessons` table for storage

**Why No Caching?**
- Section extraction is fast (~10-20 sec)
- Sections depend on which supplements are selected
- Different supplement combos = different sections
- Cache would be complex to invalidate

---

### Updated Tier 2 Routes Summary

**File:** `backend/src/routes/tier2.js`

**Existing Routes (Keep):**
- `POST /tier2/extract-chapters` - Queue chapter extraction
- `GET /tier2/chapter-markdown/:id` - Get chapter markdown
- `GET /tier2/chapter-sources/:courseId` - List chapter sources
- `PATCH /tier2/chapter-markdown/:id/reassign` - Reassign chapter number
- `DELETE /tier2/chapter-markdown/:id` - Delete chapter source

**New Routes (Add):**
- `POST /tier2/generate-lesson` - Generate sections from sources
- `POST /tier2/generate-section-lesson` - Generate lesson for section

---

## Implementation Phases (Revised - Much Simpler!)

### Phase 0: Enhanced Extraction (1 day)

**Goal:** Update extraction to include summaries

**Scope:**
- ✅ Update extraction prompts to request summary
- ✅ Post-process markdown response to separate content and summary
- ✅ Database migration: Add `chapter_summary` column
- ✅ Update extraction services to save both

**Files Changed:**
1. `backend/src/services/tier2Extraction.js` - Update `extractSingleChapter()`
2. `backend/src/services/tier2Detection.js` - Update single-chapter extraction
3. `backend/src/db/migrations/` - Add migration for summary column
4. `backend/src/jobs/processors/chapterExtraction.processor.js` - Save summary

**Success Criteria:**
- Upload single-chapter PDF
- Extraction saves both `markdown_content` and `chapter_summary`
- Summary is 2-3 paragraphs
- Check database: Both fields populated

**New Extraction Prompt:**
```markdown
Extract this chapter as clean markdown, then provide a summary.

RESPONSE FORMAT:

# CHAPTER_CONTENT
[Full markdown extraction]

---

# CHAPTER_SUMMARY
[2-3 paragraph summary covering main topics, key concepts, formulas, applications]
```

**Why This First?**
- Foundation for everything else
- One-time cost per chapter
- Summaries enable token-efficient multi-source

---

### Phase 1: Single Source Section Extraction (2 days)

**Goal:** Generate sections from single source, display list

**Scope:**
- ✅ Smart aggregation service (trivial for single source)
- ✅ Section extraction (reuse tier 1 logic)
- ✅ API: `POST /tier2/generate-lesson`
- ✅ Frontend: "Generate Lesson" button, section list display

**Files Created:**
1. `backend/src/services/tier2Aggregation.service.js`
2. `backend/src/services/tier2Lesson.service.js`
3. `backend/src/routes/tier2.js` - Add `generate-lesson` endpoint
4. Frontend: Lesson generation button, section list component

**Success Criteria:**
- User uploads chapter (with summary from Phase 0)
- Clicks "Generate Lesson"
- Sees 4-8 sections displayed
- Sections are clean and accurate

**Timeline:** ~10-20 seconds per generation

**Why Second?**
- Proves section extraction works
- No multi-source complexity
- Immediate user value

---

### Phase 2: Section-Scoped Lesson Generation (1 day)

**Goal:** Generate lesson from selected section

**Scope:**
- ✅ Extract section markdown from combined text
- ✅ Call existing lesson generation logic
- ✅ API: `POST /tier2/generate-section-lesson`
- ✅ Frontend: Click on section to generate lesson

**Files Updated:**
1. `backend/src/services/tier2Lesson.service.js` - Add `generateSectionLesson()`
2. `backend/src/routes/tier2.js` - Add `generate-section-lesson` endpoint
3. Frontend: Section click handler, lesson display (reuse existing)

**Success Criteria:**
- User clicks on "Section 1: Introduction"
- Sees 6-15 concepts focused on introduction
- Concepts stored in database with source attribution
- Can navigate between sections

**Timeline:** ~15-30 seconds per section lesson

**Why Third?**
- Completes single-source flow
- Matches tier 1 UX
- High quality (section-scoped)

---

### Phase 3: Multi-Source Aggregation (2 days)

**Goal:** Support multiple sources with smart aggregation

**Scope:**
- ✅ Update aggregation to handle supplements
- ✅ Primary full markdown + supplement summaries
- ✅ Frontend: Source selection modal
- ✅ Primary/supplement designation

**Files Updated:**
1. `backend/src/services/tier2Aggregation.service.js` - Multi-source logic
2. `backend/src/routes/tier2.js` - Accept supplement source IDs
3. Frontend: Multi-source selection component
4. `backend/src/db/migrations/` - Lessons table source tracking

**Success Criteria:**
- User has 3 chapters for same chapter number
- Selects primary + 2 supplements
- System combines: primary full + supplement summaries
- Generates sections from combined context
- Token count: ~104K (not 300K!)

**Why Fourth?**
- Core tier 2 differentiator
- Token-efficient approach
- No complex merge logic needed

---

### Phase 4: Complete Multi-Source Flow (1 day)

**Goal:** End-to-end multi-source lesson generation

**Scope:**
- ✅ Section extraction from combined sources
- ✅ Section lesson generation with multi-source attribution
- ✅ UI polish: Source badges, attribution display

**Files Updated:**
1. Frontend: Display which sources contributed
2. Frontend: Source badges on concepts/sections
3. Database: Store source attribution

**Success Criteria:**
- User generates sections from 3 sources
- Sections reflect combined context
- Clicks on section, generates lesson
- Lesson shows "Based on: Textbook (primary), Lecture Notes, Study Guide"
- High quality concepts using all sources

**Timeline:**
- Section extraction: ~10-20 seconds
- Lesson generation: ~20-35 seconds

**Why Last?**
- Completes the vision
- Builds on all previous phases
- Maximum value for tier 2 users

---

### Future Enhancements (Not in Scope)

**Advanced Features (Can Add Later):**
- LLM-based summary improvement (re-summarize poorly extracted summaries)
- User-editable summaries (if auto-summary is poor)
- Section caching (if performance becomes issue)
- A/B testing of different aggregation approaches
- Source weight configuration (e.g., "primary 70%, supplement 1 20%, supplement 2 10%")

**Total Implementation Time:** 7 days (vs 14-18 in old plan!)

**Code Volume:** ~500 lines new code (vs 2000+ in old plan)

**Reuse Factor:** 90% of lesson generation logic reused from tier 1

---

## Testing Strategy

### Unit Tests

**Module 1 (Section Extraction):**
```javascript
// backend/test/tier2Section.test.js
describe('Tier 2 Section Extraction', () => {
  it('extracts 4-8 sections from chapter markdown', async () => {
    const result = await extractSectionsFromChapter({
      chapterId: 'uuid',
      markdownContent: SAMPLE_CHAPTER_MARKDOWN
    });

    expect(result.sections).toHaveLength(6);
    expect(result.sections[0].name).toBe('Introduction');
  });

  it('caches results in tier2_sections table', async () => {
    // Test caching logic
  });
});
```

**Module 2 (Aggregation):**
```javascript
// backend/test/tier2Aggregation.test.js
describe('Multi-Source Aggregation', () => {
  it('fetches single source markdown', async () => {
    const result = await aggregateSources({
      sourceIds: ['uuid1'],
      scope: 'whole_chapter'
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].isPrimary).toBe(true);
  });

  it('fetches multiple sources with primary designation', async () => {
    const result = await aggregateSources({
      sourceIds: ['uuid1', 'uuid2'],
      primarySourceId: 'uuid1',
      scope: 'whole_chapter'
    });

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].isPrimary).toBe(true);
    expect(result.sources[1].isPrimary).toBe(false);
  });

  it('extracts section markdown when scope is section', async () => {
    // Test section extraction from multiple sources
  });
});
```

**Module 3 (Merging):**
```javascript
// backend/test/tier2Merge.test.js
describe('Simple Concatenation Strategy', () => {
  it('merges single source (no-op)', async () => {
    const result = await simpleMerge([
      { id: 'uuid1', markdown: 'Content 1', isPrimary: true }
    ]);

    expect(result.mergedMarkdown).toBe('Content 1');
  });

  it('concatenates primary + supplements with delimiters', async () => {
    const result = await simpleMerge([
      { id: 'uuid1', markdown: 'Primary', isPrimary: true },
      { id: 'uuid2', markdown: 'Supplement', isPrimary: false }
    ]);

    expect(result.mergedMarkdown).toContain('PRIMARY SOURCE');
    expect(result.mergedMarkdown).toContain('SUPPLEMENTARY SOURCE');
  });
});
```

**Module 4 (Lesson Generation):**
```javascript
// backend/test/tier2Lesson.test.js
describe('Tier 2 Lesson Generation', () => {
  it('generates lesson from single source', async () => {
    const lesson = await generateTier2Lesson({
      mergedMarkdown: SAMPLE_MARKDOWN,
      chapterNumber: 5,
      chapterTitle: 'Networks'
    });

    expect(lesson.concepts.length).toBeGreaterThanOrEqual(6);
    expect(lesson.concepts.length).toBeLessThanOrEqual(15);
  });

  it('includes source attribution', async () => {
    const lesson = await generateTier2Lesson({
      mergedMarkdown: SAMPLE_MARKDOWN,
      sourceAttribution: [
        { conceptName: 'Protocols', sourceIds: ['uuid1', 'uuid2'] }
      ]
    });

    expect(lesson.source_ids).toContain('uuid1');
    expect(lesson.source_ids).toContain('uuid2');
  });
});
```

### Integration Tests

```javascript
// backend/test/tier2Integration.test.js
describe('End-to-End Tier 2 Lesson Generation', () => {
  it('generates lesson from single chapter, whole chapter', async () => {
    // 1. Upload single-chapter PDF (reuse tier 2 upload)
    // 2. Call POST /tier2/generate-lesson
    // 3. Verify lesson returned with concepts
    // 4. Verify lesson stored in database
  });

  it('extracts sections, generates section-scoped lesson', async () => {
    // 1. Upload chapter
    // 2. Call POST /tier2/extract-sections
    // 3. Call POST /tier2/generate-lesson with section scope
    // 4. Verify lesson focused on section only
  });

  it('merges 3 sources and generates lesson', async () => {
    // 1. Upload 3 chapters to same course
    // 2. Call POST /tier2/generate-lesson with all 3
    // 3. Verify merged markdown contains content from all 3
    // 4. Verify lesson includes source attribution
  });
});
```

### Manual Testing Checklist

**Phase 1 (MVP):**
- [ ] Upload single-chapter PDF
- [ ] Click "Generate Lesson"
- [ ] Verify 6-15 concepts displayed
- [ ] Verify lesson saved to database
- [ ] Verify lesson persists across page refresh

**Phase 2 (Sections):**
- [ ] Upload chapter, extract sections
- [ ] Verify 4-8 sections shown
- [ ] Click on section, generate lesson
- [ ] Verify lesson focused on that section only
- [ ] Verify section-scoped concepts (not whole chapter)

**Phase 3 (Multi-Source):**
- [ ] Upload 3 chapters (textbook, lecture, guide)
- [ ] Select all 3 sources
- [ ] Designate textbook as primary
- [ ] Generate lesson
- [ ] Verify merged content visible
- [ ] Verify source attribution shown

**Phase 4 (Section Matching):**
- [ ] Extract sections from 3 sources
- [ ] Match "Introduction" across all 3
- [ ] Generate lesson for matched sections
- [ ] Verify only intro content used
- [ ] Verify all 3 sources contributed

---

## Open Questions (Revised)

### 1. Summary Quality Validation

**Question:** What if LLM generates poor summary during extraction?

**Scenarios:**
- Summary is too short (1 sentence instead of 2-3 paragraphs)
- Summary misses key concepts
- Summary is too generic

**Options:**
- A) **No Validation:** Trust LLM, store whatever it returns
  - Pros: Simple, fast
  - Cons: Poor summaries degrade lesson quality

- B) **Basic Validation:** Check length, reject if < 200 words
  - Pros: Catches obvious failures
  - Cons: Doesn't catch quality issues

- C) **LLM Re-check:** Ask second LLM call to evaluate and improve
  - Pros: Best quality
  - Cons: Double extraction cost, slower

**Recommendation:** **Option B** for MVP. Add length check (200-1000 words). Phase 2: Add quality scoring.

---

### 2. Section Extraction Caching

**Question:** Should we cache sections or re-extract every time?

**Scenarios:**
- User generates lesson → Sections extracted → User picks section
- Later, user returns → Generates lesson again with SAME sources
- Should we re-extract sections or cache?

**Analysis:**
- Section extraction: ~10-20 seconds, ~$0.002
- Caching saves time but adds complexity
- Different supplement combos = different sections

**Options:**
- A) **No Caching:** Always re-extract
  - Pros: Simple, always current, handles different source combos
  - Cons: Slower, more LLM calls

- B) **Cache by Source Combo:** Cache sections for each unique source combination
  - Pros: Fast for repeated queries
  - Cons: Complex cache key, invalidation logic

- C) **Session Cache:** Cache only during active session
  - Pros: Balanced - helps during exploration
  - Cons: Lost on page refresh

**Recommendation:** **Option A** for MVP. Section extraction is fast enough. Add caching if it becomes bottleneck.

---

### 3. Lesson Storage Schema

**Question:** How to link lessons to tier 2 sources?

**Current (Tier 1):**
```sql
lessons (
  id UUID,
  document_id UUID,  -- Single source
  chapter TEXT,
  section_name TEXT,
  concepts JSONB
)
```

**Proposed (Tier 2):**
```sql
lessons (
  id UUID,
  document_id UUID,      -- NULL for tier 2
  tier2_source_ids UUID[],  -- Array of chapter_markdown IDs
  tier2_primary_source_id UUID,  -- Which was primary
  chapter_number INTEGER,    -- Logical chapter number
  section_name TEXT,
  concepts JSONB
)
```

**Options:**
- A) **Extend Existing:** Add tier2 columns
  - Pros: Unified storage, simpler queries
  - Cons: NULL document_id for tier 2

- B) **Separate Table:** tier2_lessons
  - Pros: Clean separation
  - Cons: Duplicate lesson logic, complex joins

**Recommendation:** **Option A** - Extend existing. Use `tier2_source_ids IS NOT NULL` to identify tier 2 lessons.

---

### 4. Cost & Performance (Updated Analysis)

**Question:** Token costs with smart aggregation?

**Analysis:**
- **Tier 1 Section:** ~5,000 tokens
- **Tier 2 Single Source:** ~5,000 tokens (same)
- **Tier 2 Multi-Source (Smart Aggregation):**
  - Section extraction:
    * Primary full: 100,000 tokens
    * Supplement 1 summary: 2,000 tokens
    * Supplement 2 summary: 2,000 tokens
    * **Total input:** ~104,000 tokens
    * **Total output:** ~2,000 tokens (section list)
    * **Cost:** ~$0.011
  - Lesson generation (per section):
    * Section markdown: ~15,000 tokens (section from combined)
    * **Cost:** ~$0.003

**Total Cost Per Chapter (3 sources):**
- Section extraction (one-time): $0.011
- Lesson generation (×6 sections): $0.018
- **Total:** ~$0.029 per complete chapter

**Comparison:**
- Tier 1: $0.003 per section × 6 = $0.018
- Tier 2: $0.029 total
- **Premium:** ~$0.011 (60% more, but multi-source value)

**Recommendation:** Current approach is cost-effective. No optimization needed for MVP.

---

### 5. Summary Extraction Timing

**Question:** When should summary be extracted?

**Options:**
- A) **During Upload:** Extract markdown + summary in one LLM call
  - Pros: One-time cost, ready for lesson generation
  - Cons: Slower upload, user waits

- B) **On-Demand:** Extract summary when first needed for lesson generation
  - Pros: Fast upload
  - Cons: Lesson generation slower, must wait for summary

- C) **Background Job:** Upload returns immediately, extract summary in background
  - Pros: Fast upload, summary ready when needed
  - Cons: Lesson generation may wait for summary job

**Recommendation:** **Option A** - Extract during upload. Summary extraction adds ~5 seconds to upload, but makes lesson generation instant. Better UX overall.

---

### 6. Post-Processing Markdown

**Question:** How to ensure clean markdown formatting?

**Scenarios:**
- LLM returns markdown with inconsistent heading levels
- Extra blank lines, weird formatting
- HTML artifacts

**Options:**
- A) **Trust LLM:** No post-processing
  - Pros: Simple
  - Cons: Inconsistent quality

- B) **Regex Cleanup:** Basic regex to normalize
  - Pros: Fast, handles common issues
  - Cons: Brittle, may break on edge cases

- C) **Markdown Parser:** Use library to parse and re-format
  - Pros: Robust, handles all cases
  - Cons: May lose LLM's intentional formatting

**Recommendation:** **Option B** for MVP:
```javascript
function postProcessMarkdown(markdown) {
  return markdown
    .replace(/\n{3,}/g, '\n\n')  // Normalize blank lines
    .replace(/^#{7,}/gm, '######')  // Max 6 heading levels
    .replace(/^\s+$/gm, '')  // Remove whitespace-only lines
    .trim();
}
```

Add Option C if quality issues persist.

---

## Summary of Revised Architecture

### Key Changes from Original Plan

| Aspect | Original Plan | Revised Plan |
|--------|--------------|-------------|
| **Extraction** | Markdown only | Markdown + Summary (one LLM call) |
| **Multi-Source Strategy** | Complex merge strategies (simple, LLM dedupe, structured) | Smart aggregation (primary full + supplement summaries) |
| **Section Extraction** | Custom tier 2 section service | Direct reuse of tier 1 `extractSections()` |
| **Lesson Generation** | Thin wrapper around tier 1 | Direct reuse of tier 1 `generateFullContextLesson()` |
| **Section Caching** | Dedicated `tier2_sections` table | No caching (extract on-demand) |
| **Token Count (3 sources)** | 300,000+ tokens | ~104,000 tokens (65% reduction!) |
| **New Code Volume** | ~2,000 lines | ~500 lines |
| **Implementation Time** | 14-18 days | 7 days |
| **Reuse Factor** | 70% | 90% |

### Architecture Principles

1. **NEVER markdown inside JSON** - All LLM responses are pure markdown or pure JSON
2. **Smart Aggregation over Complex Merging** - Primary full text + supplement summaries
3. **Maximum Reuse** - 90% of code is tier 1 logic, just called with combined markdown
4. **Token Efficiency** - Summaries provide context without overwhelming token count
5. **Simplicity** - Fewer modules, less complexity, faster implementation

### The Core Insight

**Primary Source = Structure + Detail**
- Use full markdown for section extraction (needs complete structure)
- Use full markdown for lesson generation (needs examples, formulas)

**Supplement Sources = Context**
- Summaries capture 80% of key concepts in 2% of space
- Provide alternative perspectives without token explosion
- LLM can reference supplements when generating concepts

**Result:**
- High quality (multi-source context)
- Token efficient (65% reduction)
- Simple implementation (no complex merge logic)

### Next Steps

1. **Phase 0: Enhanced Extraction** (1 day)
   - Update extraction to include summaries
   - Database migration for `chapter_summary` column

2. **Phase 1: Single Source Sections** (2 days)
   - Smart aggregation service
   - Section extraction (reuse tier 1)
   - Display section list

3. **Phase 2: Section Lessons** (1 day)
   - Section-scoped lesson generation
   - Complete single-source flow

4. **Phase 3: Multi-Source** (2 days)
   - Primary + supplement selection
   - Smart aggregation implementation

5. **Phase 4: Complete Flow** (1 day)
   - Multi-source sections and lessons
   - Source attribution UI

**Total:** 7 days to full implementation

### Key Files to Create/Update

**Backend:**
- `backend/src/services/tier2Extraction.js` - UPDATE: Add summary extraction
- `backend/src/services/tier2Detection.js` - UPDATE: Add summary extraction
- `backend/src/services/tier2Aggregation.service.js` - NEW: Smart aggregation
- `backend/src/services/tier2Lesson.service.js` - NEW: Thin wrappers for tier 1 reuse
- `backend/src/routes/tier2.js` - UPDATE: Add 2 new endpoints
- `backend/src/db/migrations/` - NEW: Add `chapter_summary` column

**Frontend:**
- Source selection modal (new)
- Section list component (new, but simple)
- Lesson display (reuse existing tier 1 component)

**Database:**
- One migration: Add `chapter_summary TEXT` column
- Extend `lessons` table with `tier2_source_ids UUID[]` column

---

**This is now a 7-day implementation instead of 14-18 days, with 75% less code to write!**

Ready to start Phase 0?
