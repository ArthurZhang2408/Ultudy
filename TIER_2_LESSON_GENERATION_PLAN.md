# Tier 2 Lesson Generation - Detailed Planning Document

**Last Updated:** 2025-11-28
**Status:** Planning Phase
**Purpose:** Comprehensive architectural design for tier 2 multi-source lesson generation

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

**Storage Schema:**
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
1. **No lesson generation for tier 2 sources** - Can view markdown but can't generate lessons
2. **No multi-source selection UI** - Can't select which sources to include
3. **No primary/supplement source designation** - All sources treated equally
4. **No deduplication/merging logic** - Multiple sources not intelligently combined
5. **No tier 2 lesson generation API** - Need new endpoint architecture

### Current Challenges

#### Challenge 1: Granularity Mismatch
- **Tier 1:** Lessons generated per **section** (e.g., "Section 2.1: Packet Switching")
- **Tier 2:** Chapters stored as monolithic markdown (e.g., "Chapter 5: Networks" - could be 50+ pages)
- **Problem:** Generating 6-15 concepts from 50 pages yields superficial coverage
- **Solution:** Need section extraction for tier 2 chapters

#### Challenge 2: Multi-Source Merging
- **Scenario:** User has:
  - Textbook Chapter 5 (primary)
  - Lecture notes Chapter 5 (supplement)
  - Study guide Chapter 5 (supplement)
- **Current:** No way to combine these intelligently
- **Needed:**
  - Deduplication (don't repeat same definitions)
  - Merge strategy (textbook definitions + lecture examples + study guide summaries)
  - Source attribution (which concept came from which source)

#### Challenge 3: UI/UX Complexity
- **Tier 1:** Simple - one file, see sections, click to learn
- **Tier 2:** Complex - multiple sources per chapter, need to:
  - Select which sources to include
  - Designate primary vs supplement
  - Choose granularity (whole chapter vs sections)
  - See which sources contributed to lesson

---

## Proposed Architecture

### Design Principles

1. **Modularity:** Each component (extraction, merging, generation) is swappable
2. **Separation of Concerns:** Source selection ≠ merging ≠ lesson generation
3. **Backward Compatibility:** Tier 1 continues to work unchanged
4. **Testability:** Each module can be tested independently
5. **Traceability:** Easy to trace errors to specific module

### High-Level Flow

```
┌────────────────────────────────────────────────────────────────┐
│  User: Tier 2 user with chapter_markdown sources              │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Frontend: Source Selection UI                                │
│  • Show chapter sources grouped by chapter_number             │
│  • User selects: primary source + optional supplements        │
│  • Option: Generate for whole chapter OR extract sections     │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────────┐         ┌──────────────────┐
│  Whole Chapter   │         │  Section-Based   │
│  (Quick)         │         │  (Recommended)   │
└────────┬─────────┘         └────────┬─────────┘
         │                            │
         │                            ▼
         │                   ┌─────────────────────────────────┐
         │                   │  Module 1: Section Extraction   │
         │                   │  • Similar to tier 1            │
         │                   │  • Extracts 4-8 sections        │
         │                   │  • Per-source section detection │
         │                   └────────┬────────────────────────┘
         │                            │
         └───────────────┬────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  Module 2: Multi-Source Aggregation                           │
│  • Collects markdown from selected sources                    │
│  • Primary source is base                                     │
│  • Supplement sources are additive                            │
│  Output: List of markdown texts with metadata                 │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Module 3: Content Merging Strategy (Pluggable)               │
│  Strategy Options:                                             │
│  • A) Simple Concatenation (MVP)                              │
│  • B) LLM-based Deduplication (Future)                        │
│  • C) Structured Merge (Future)                               │
│  Output: Merged markdown text                                  │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Module 4: Lesson Generation (Reuse Tier 1 Logic)             │
│  • Call existing generateFullContextLesson()                  │
│  • Pass merged markdown as full_text                          │
│  • Include source attribution metadata                        │
│  Output: Structured lesson with concepts                      │
└──────────────────────┬─────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Storage: Lessons Table                                        │
│  • Store lesson concepts                                       │
│  • Link to source_ids (array of chapter_markdown IDs)         │
│  • Enable regeneration with different merge strategies        │
└────────────────────────────────────────────────────────────────┘
```

---

## Modular Component Design

### Module 1: Section Extraction for Tier 2

**Purpose:** Extract sections from tier 2 chapter markdown (same as tier 1)

**Input:**
```javascript
{
  chapterId: "uuid",                    // chapter_markdown.id
  markdownContent: "# Chapter 5...",   // chapter_markdown.markdown_content
  chapterTitle: "Networks"             // chapter_markdown.chapter_title
}
```

**Output:**
```javascript
{
  chapterId: "uuid",
  sections: [
    {
      section_number: 1,
      name: "Introduction to Networks",
      description: "Basic network concepts",
      markdown_text: "..."    // Section-scoped markdown
    },
    // ... more sections
  ]
}
```

**Implementation:**
- **File:** `backend/src/services/tier2Section.service.js` (new)
- **Reuses:** `extractSectionsWithLLM()` logic from `section.service.js`
- **Key difference:** Operates on `chapter_markdown.markdown_content` instead of `documents.full_text`

**Why Separate File?**
- Tier 1 section service tightly coupled to `documents` table
- Tier 2 uses `chapter_markdown` table
- Separation allows independent testing and evolution

---

### Module 2: Multi-Source Aggregation

**Purpose:** Collect and prepare markdown from selected sources

**Input:**
```javascript
{
  sourceIds: ["uuid1", "uuid2", "uuid3"],   // chapter_markdown IDs
  primarySourceId: "uuid1",                  // Which is primary
  scope: "whole_chapter" | "section",        // Granularity
  sectionName: "Introduction" (if scope=section)
}
```

**Process:**
1. Fetch all `chapter_markdown` rows by IDs
2. Validate all sources belong to same course and user
3. Extract markdown based on scope:
   - If `whole_chapter`: Use full `markdown_content`
   - If `section`: Extract section from each source
4. Tag each markdown with metadata

**Output:**
```javascript
{
  sources: [
    {
      id: "uuid1",
      chapterTitle: "Networks - Textbook",
      markdown: "...",
      isPrimary: true,
      documentTitle: "Computer Networks.pdf"
    },
    {
      id: "uuid2",
      chapterTitle: "Networks - Lecture",
      markdown: "...",
      isPrimary: false,
      documentTitle: "Lecture 5.pdf"
    }
  ],
  scope: "section",
  sectionName: "Introduction"
}
```

**Implementation:**
- **File:** `backend/src/services/tier2Aggregation.service.js` (new)
- **Dependencies:** Database queries, section extraction if needed

**Error Handling:**
- Source not found → Return error with missing IDs
- Sources from different courses → Return error
- No primary source specified → Default to first source

---

### Module 3: Content Merging Strategy

**Purpose:** Intelligently combine multiple markdown sources into one text

**Interface:**
```javascript
interface MergeStrategy {
  name: string;

  merge(sources: Source[], options: MergeOptions): Promise<MergedContent>;
}

interface Source {
  id: string;
  markdown: string;
  isPrimary: boolean;
  chapterTitle: string;
}

interface MergedContent {
  mergedMarkdown: string;
  sourceAttribution: {
    conceptName: string,
    sourceIds: string[]
  }[];
  strategyUsed: string;
}
```

#### Strategy A: Simple Concatenation (MVP)

**Logic:**
1. Primary source markdown first
2. Append supplement sources with delimiter
3. Add source labels

**Example Output:**
```markdown
# PRIMARY SOURCE: Computer Networks Textbook

[Primary source content...]

---

# SUPPLEMENTARY SOURCE: Lecture Notes

[Supplement 1 content...]

---

# SUPPLEMENTARY SOURCE: Study Guide

[Supplement 2 content...]
```

**Pros:**
- Simple, no LLM calls needed
- Fast
- No information loss
- Easy to debug

**Cons:**
- Redundant content (same definitions repeated)
- LLM may get confused by contradictions
- Large token count if many sources

#### Strategy B: LLM-Based Deduplication (Future)

**Logic:**
1. Send all sources to LLM
2. Ask LLM to merge, removing duplicates
3. Keep best explanation/example from each source
4. Preserve source attribution

**Example Prompt:**
```
You have multiple sources for the same chapter:

SOURCE 1 (PRIMARY - Textbook):
[markdown]

SOURCE 2 (Lecture Notes):
[markdown]

SOURCE 3 (Study Guide):
[markdown]

Merge these into a single cohesive document:
1. Remove duplicate definitions (keep the clearest one)
2. Combine examples (include examples from all sources)
3. Preserve all unique information
4. Mark which source each section came from
```

**Pros:**
- No redundancy
- Best content from each source
- Cleaner output

**Cons:**
- Additional LLM call (cost + latency)
- Potential information loss
- Harder to debug

#### Strategy C: Structured Merge (Future)

**Logic:**
1. Parse markdown into structured components (definitions, examples, formulas)
2. Merge at component level
3. Primary source definitions + all sources' examples
4. Deduplicate programmatically (hash-based or similarity)

**Pros:**
- More control than LLM
- Cheaper than LLM
- Predictable behavior

**Cons:**
- Complex parsing logic
- May miss nuances
- Requires robust markdown structure

**Implementation:**
- **File:** `backend/src/services/tier2Merge/` (folder)
  - `strategies/simple.js` - Strategy A
  - `strategies/llmDedupe.js` - Strategy B (future)
  - `strategies/structured.js` - Strategy C (future)
  - `index.js` - Strategy selector

**Configuration:**
```javascript
// backend/src/services/tier2Merge/index.js
const MERGE_STRATEGIES = {
  simple: require('./strategies/simple'),
  llmDedupe: require('./strategies/llmDedupe'),
  structured: require('./strategies/structured')
};

export function getMergeStrategy(strategyName = 'simple') {
  if (!MERGE_STRATEGIES[strategyName]) {
    throw new Error(`Unknown merge strategy: ${strategyName}`);
  }
  return MERGE_STRATEGIES[strategyName];
}
```

---

### Module 4: Lesson Generation (Reuse Existing)

**Purpose:** Generate concepts from merged markdown

**Implementation:**
- **Reuse:** Existing `generateFullContextLesson()` from `gemini.js`
- **No changes needed** to core lesson generation logic
- **Input:** Merged markdown as `full_text`

**Modified Call:**
```javascript
// backend/src/services/tier2Lesson.service.js
import { getLLMProvider } from '../providers/llm/index.js';

export async function generateTier2Lesson({
  mergedMarkdown,
  sourceAttribution,
  chapterNumber,
  chapterTitle,
  sectionName,
  sectionDescription
}) {
  const provider = await getLLMProvider();

  // Call existing lesson generation function
  const lesson = await provider.generateFullContextLesson({
    document_id: null,  // Not tied to single document
    title: `Chapter ${chapterNumber}: ${chapterTitle}`,
    full_text: mergedMarkdown,
    material_type: 'tier2_chapter',
    chapter: chapterNumber,
    include_check_ins: true,
    section_name: sectionName,
    section_description: sectionDescription
  });

  // Enhance with source attribution
  lesson.source_ids = sourceAttribution.map(s => s.sourceIds).flat();
  lesson.merge_strategy = 'simple';  // or whatever was used

  return lesson;
}
```

**Key Point:** This module is just a thin wrapper. The heavy lifting is already done by tier 1 logic.

---

## Data Flow

### Scenario 1: Single Source, Whole Chapter (Simplest)

**User Actions:**
1. Goes to course page
2. Sees "Chapter 5: Networks" with one source (Textbook)
3. Clicks "Generate Lesson for Chapter 5"

**Backend Flow:**
```
1. POST /api/tier2/generate-lesson
   Body: { sourceIds: ["uuid1"], scope: "whole_chapter" }

2. Module 2 (Aggregation):
   - Fetch chapter_markdown WHERE id = uuid1
   - Extract full markdown_content
   - Output: sources = [{ id: uuid1, markdown: "...", isPrimary: true }]

3. Module 3 (Merging):
   - Single source, no merging needed
   - Output: mergedMarkdown = sources[0].markdown

4. Module 4 (Lesson Generation):
   - Call generateFullContextLesson({ full_text: mergedMarkdown, ... })
   - Generate 6-15 concepts
   - Output: { concepts: [...], source_ids: ["uuid1"] }

5. Store in lessons table
6. Return lesson to frontend
```

**Timeline:** ~15-30 seconds (same as tier 1)

---

### Scenario 2: Single Source, Section-Based (Recommended)

**User Actions:**
1. Goes to course page
2. Sees "Chapter 5: Networks" with one source
3. Clicks "Show Sections" → System extracts sections
4. Sees "Section 5.1: Introduction to Networks"
5. Clicks "Learn Section 5.1"

**Backend Flow:**
```
1. POST /api/tier2/extract-sections
   Body: { chapterId: "uuid1" }

2. Module 1 (Section Extraction):
   - Fetch chapter_markdown WHERE id = uuid1
   - Call extractSectionsWithLLM(markdown_content)
   - Return sections array
   - Store in tier2_sections table (cache)

3. Frontend displays sections

4. POST /api/tier2/generate-lesson
   Body: { sourceIds: ["uuid1"], scope: "section", sectionName: "Introduction to Networks" }

5. Module 2 (Aggregation):
   - Fetch chapter_markdown WHERE id = uuid1
   - Extract section markdown using section name
   - Output: sources = [{ id: uuid1, markdown: "...", isPrimary: true }]

6. Module 3 (Merging):
   - Single source, no merging needed
   - Output: mergedMarkdown = sources[0].markdown

7. Module 4 (Lesson Generation):
   - Call generateFullContextLesson({
       full_text: mergedMarkdown,
       section_name: "Introduction to Networks",
       section_description: "..."
     })
   - Generate 6-15 concepts scoped to this section
   - Output: { concepts: [...], source_ids: ["uuid1"] }

8. Store in lessons table with section metadata
9. Return lesson to frontend
```

**Timeline:**
- Section extraction (one-time): ~10-20 seconds
- Lesson generation per section: ~15-30 seconds

---

### Scenario 3: Multi-Source, Section-Based (Full Complexity)

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
5. Chooses "Section-Based Generation"
6. System extracts sections from each source
7. User picks "Section: Introduction to Networks" (matched across sources)
8. Clicks "Generate Lesson"

**Backend Flow:**
```
1. POST /api/tier2/extract-sections (run for each source)
   Body: { chapterId: "uuid1" } // Textbook
   Body: { chapterId: "uuid2" } // Lecture
   Body: { chapterId: "uuid3" } // Study Guide

2. Module 1 (Section Extraction) - runs 3 times:
   - Extract sections from each chapter_markdown
   - Store in tier2_sections table with parent chapter_markdown_id
   - Return sections for each

3. Frontend: Section Matching UI
   - Show sections from primary source
   - Allow user to map supplement sections to primary sections
   - E.g., "Introduction" (Textbook) ← "Lecture 1 Intro" (Lecture)

4. POST /api/tier2/generate-lesson
   Body: {
     sourceIds: ["uuid1", "uuid2", "uuid3"],
     primarySourceId: "uuid1",
     scope: "section",
     sectionName: "Introduction to Networks",
     sectionMapping: {
       "uuid1": "Introduction to Networks",
       "uuid2": "Lecture 1 Intro",
       "uuid3": "Chapter 5.1 Overview"
     }
   }

5. Module 2 (Aggregation):
   - Fetch chapter_markdown for all 3 IDs
   - For each, extract the mapped section's markdown
   - Output: sources = [
       { id: uuid1, markdown: "...", isPrimary: true },
       { id: uuid2, markdown: "...", isPrimary: false },
       { id: uuid3, markdown: "...", isPrimary: false }
     ]

6. Module 3 (Merging):
   - Strategy: Simple Concatenation (MVP)
   - Combine: Primary first, then supplements with delimiters
   - Output: mergedMarkdown = combined text

7. Module 4 (Lesson Generation):
   - Call generateFullContextLesson({
       full_text: mergedMarkdown,  // All 3 sources combined
       section_name: "Introduction to Networks",
       ...
     })
   - LLM sees all sources and generates concepts
   - Output: { concepts: [...], source_ids: ["uuid1", "uuid2", "uuid3"] }

8. Store lesson with source attribution
9. Return to frontend with source list
```

**Timeline:**
- Section extraction (one-time per source): ~10-20 sec × 3 = 30-60 sec
- Section matching (user task): ~1-2 minutes
- Lesson generation: ~15-30 seconds

---

## API Design

### 1. POST /api/tier2/extract-sections

**Purpose:** Extract sections from a tier 2 chapter (one-time operation, cached)

**Request:**
```json
{
  "chapterId": "uuid"
}
```

**Response:**
```json
{
  "chapterId": "uuid",
  "sections": [
    {
      "id": "section-uuid-1",
      "section_number": 1,
      "name": "Introduction to Networks",
      "description": "Basic network concepts and terminology",
      "markdown_text": "..." // Optional, not sent to save bandwidth
    },
    // ... more sections
  ]
}
```

**Implementation:**
- Check if sections already extracted (cache in `tier2_sections` table)
- If not, run Module 1 (Section Extraction)
- Store results for future use
- Return sections metadata

**New Table:**
```sql
CREATE TABLE tier2_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_markdown_id UUID REFERENCES chapter_markdown(id) ON DELETE CASCADE,
  section_number INTEGER,
  section_name VARCHAR(500),
  section_description TEXT,
  markdown_text TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tier2_sections_chapter ON tier2_sections(chapter_markdown_id);
```

---

### 2. POST /api/tier2/generate-lesson

**Purpose:** Generate a lesson from one or more tier 2 sources

**Request (Simple):**
```json
{
  "sourceIds": ["chapter-uuid-1"],
  "scope": "whole_chapter"
}
```

**Request (Section-Based, Single Source):**
```json
{
  "sourceIds": ["chapter-uuid-1"],
  "scope": "section",
  "sectionName": "Introduction to Networks"
}
```

**Request (Multi-Source):**
```json
{
  "sourceIds": ["chapter-uuid-1", "chapter-uuid-2", "chapter-uuid-3"],
  "primarySourceId": "chapter-uuid-1",
  "scope": "section",
  "sectionMapping": {
    "chapter-uuid-1": "Introduction to Networks",
    "chapter-uuid-2": "Lecture 1 Intro",
    "chapter-uuid-3": "Overview"
  },
  "mergeStrategy": "simple"  // Optional, defaults to "simple"
}
```

**Response:**
```json
{
  "lessonId": "lesson-uuid",
  "concepts": [
    {
      "name": "Network Protocols",
      "explanation": "...",
      "formulas": [...],
      "examples": [...],
      "check_ins": [...]
    },
    // ... more concepts
  ],
  "sources": [
    {
      "id": "chapter-uuid-1",
      "chapterTitle": "Networks - Textbook",
      "isPrimary": true
    },
    {
      "id": "chapter-uuid-2",
      "chapterTitle": "Networks - Lecture",
      "isPrimary": false
    }
  ],
  "mergeStrategy": "simple",
  "generatedAt": "2025-11-28T..."
}
```

**Implementation:**
- Validate source IDs and permissions
- Call Module 2 (Aggregation)
- Call Module 3 (Merging)
- Call Module 4 (Lesson Generation)
- Store lesson in database with source attribution
- Return lesson

---

### 3. GET /api/tier2/sections/:chapterId

**Purpose:** Get cached sections for a chapter

**Response:**
```json
{
  "sections": [
    {
      "id": "section-uuid",
      "section_number": 1,
      "section_name": "Introduction",
      "section_description": "...",
      "hasLesson": true  // Whether lesson exists for this section
    }
  ]
}
```

---

## Implementation Phases

### Phase 1: MVP - Single Source, Whole Chapter (1-2 days)

**Goal:** Get tier 2 lesson generation working in simplest form

**Scope:**
- ✅ Module 2: Aggregation (single source only)
- ✅ Module 3: Simple concatenation (trivial for single source)
- ✅ Module 4: Reuse existing lesson generation
- ✅ API: `POST /tier2/generate-lesson` (single source only)
- ✅ Frontend: "Generate Lesson" button for chapter

**Deliverables:**
1. `backend/src/services/tier2Lesson.service.js`
2. `backend/src/routes/tier2.js` - Add generate-lesson endpoint
3. Frontend: Button to trigger generation, display concepts
4. Test with single-chapter PDF

**Success Criteria:**
- User uploads single-chapter PDF
- Clicks "Generate Lesson"
- Sees 6-15 concepts
- Lesson stored in database

**Why This First?**
- Proves the core concept works
- Minimal new code
- Immediate user value
- Foundation for complexity

---

### Phase 2: Section Extraction for Tier 2 (2-3 days)

**Goal:** Enable section-based lesson generation for tier 2

**Scope:**
- ✅ Module 1: Section extraction service
- ✅ Database: `tier2_sections` table
- ✅ API: `POST /tier2/extract-sections`
- ✅ API: `GET /tier2/sections/:chapterId`
- ✅ Frontend: Section list UI for chapters
- ✅ Module 2: Aggregation with section scope

**Deliverables:**
1. `backend/src/services/tier2Section.service.js`
2. Database migration for `tier2_sections`
3. Updated `tier2Lesson.service.js` to handle sections
4. Frontend: Section selection UI

**Success Criteria:**
- User uploads chapter
- System extracts 4-8 sections
- User clicks on section
- Generates section-scoped lesson (6-15 concepts for that section only)

**Why Second?**
- Dramatically improves lesson quality (focused concepts)
- Matches tier 1 UX
- Still single source (low complexity)

---

### Phase 3: Multi-Source Aggregation (3-4 days)

**Goal:** Allow multiple sources for same chapter

**Scope:**
- ✅ Module 2: Multi-source aggregation
- ✅ Module 3: Simple concatenation strategy
- ✅ API: `POST /tier2/generate-lesson` with multi-source
- ✅ Frontend: Source selection UI
- ✅ Frontend: Primary/supplement designation

**Deliverables:**
1. `backend/src/services/tier2Aggregation.service.js`
2. `backend/src/services/tier2Merge/strategies/simple.js`
3. Frontend: Multi-source selection modal
4. Updated lesson storage to track source_ids array

**Success Criteria:**
- User has 3 sources for Chapter 5
- Selects textbook as primary, lecture + guide as supplements
- Generates lesson from all 3
- Lesson shows source attribution

**Why Third?**
- Core differentiator for tier 2
- Unlocks multi-source value
- Uses simple merge (low risk)

---

### Phase 4: Section Matching Across Sources (4-5 days)

**Goal:** Match sections from different sources for focused generation

**Scope:**
- ✅ Frontend: Section matching UI
- ✅ API: Section mapping in `POST /tier2/generate-lesson`
- ✅ Module 2: Extract and merge specific sections from multiple sources

**Deliverables:**
1. Frontend: Section matcher component
2. Updated aggregation service for section mapping
3. UX for "Section 1 (Textbook) ← Lecture 1 Intro (Lecture)"

**Success Criteria:**
- User extracts sections from 3 sources
- Matches "Introduction" across all 3
- Generates lesson using all 3 sources' intro sections
- Concepts focused on introduction topic only

**Why Fourth?**
- Maximum quality: Multi-source + section-scoped
- Complex UX needs careful design
- Builds on previous phases

---

### Phase 5: Advanced Merge Strategies (Future)

**Goal:** Intelligent deduplication and merging

**Scope:**
- ✅ Module 3: LLM-based deduplication strategy
- ✅ Module 3: Structured merge strategy
- ✅ Strategy selection in API and UI
- ✅ A/B testing framework

**Deliverables:**
1. `backend/src/services/tier2Merge/strategies/llmDedupe.js`
2. `backend/src/services/tier2Merge/strategies/structured.js`
3. Strategy selector dropdown in UI
4. Performance comparison metrics

**Success Criteria:**
- User can choose merge strategy
- LLM dedupe reduces token count by 30%+
- Lesson quality maintained or improved
- Cost/latency tradeoffs documented

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

## Open Questions

### 1. Section Matching UX

**Question:** How should users match sections across sources?

**Options:**
- A) **Manual Mapping:** User drags "Lecture 1" onto "Introduction"
  - Pros: Full control, accurate
  - Cons: Tedious for many sections

- B) **Automatic Matching:** LLM matches sections by similarity
  - Pros: Fast, user-friendly
  - Cons: May mismatch, needs review UI

- C) **Hybrid:** Automatic suggestions + manual override
  - Pros: Best of both
  - Cons: Most complex to implement

**Recommendation:** Start with **Option B** (automatic), add manual override in Phase 4.

---

### 2. Merge Strategy Configuration

**Question:** Where should merge strategy be configured?

**Options:**
- A) **Per-lesson:** User chooses when generating
  - Pros: Flexibility, A/B testing
  - Cons: Confusing for average user

- B) **Per-course:** Set once for entire course
  - Pros: Consistent behavior
  - Cons: Less flexible

- C) **Global default:** Admin-configured
  - Pros: Simplest UX
  - Cons: No customization

**Recommendation:** **Option C** for MVP (simple strategy), **Option A** for Phase 5 (power users).

---

### 3. Section Extraction Caching

**Question:** When should sections be re-extracted?

**Scenarios:**
- User uploads chapter → Sections extracted → Cached
- What if:
  - User deletes and re-uploads same chapter?
  - Chapter markdown is edited?
  - Section extraction logic improves?

**Options:**
- A) **Cache Forever:** Never re-extract
  - Pros: Fast, no wasted LLM calls
  - Cons: Stale if content changes

- B) **Cache with Invalidation:** Re-extract if markdown changes
  - Pros: Always current
  - Cons: Complex change detection

- C) **Cache with TTL:** Expire after 30 days
  - Pros: Balanced
  - Cons: Arbitrary expiration

**Recommendation:** **Option B** with hash-based invalidation:
```javascript
// Store hash of markdown_content in tier2_sections
// If markdown changes, hash changes → re-extract
```

---

### 4. Lesson Storage Schema

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
  chapter_number INTEGER,    -- Logical chapter number
  section_name TEXT,
  concepts JSONB,
  merge_strategy TEXT,       -- Which merge strategy was used
  source_attribution JSONB   -- Which sources contributed to which concepts
)
```

**Question:** Separate table or extend existing?

**Options:**
- A) **Extend Existing:** Add tier2_source_ids column
  - Pros: Unified storage, simpler queries
  - Cons: NULL document_id for tier 2 (conceptually messy)

- B) **Separate Table:** tier2_lessons
  - Pros: Clean separation, specialized schema
  - Cons: Duplicate lesson logic, complex joins

**Recommendation:** **Option A** - Extend existing with nullable document_id. Use `tier2_source_ids IS NOT NULL` to identify tier 2 lessons.

---

### 5. Cost & Performance

**Question:** What are token costs for multi-source merging?

**Analysis:**
- **Tier 1 Section:** ~5,000 tokens per lesson generation
- **Tier 2 Single Source:** Same as tier 1
- **Tier 2 Multi-Source (Simple):**
  - Primary: 5,000 tokens
  - Supplement 1: 3,000 tokens
  - Supplement 2: 3,000 tokens
  - **Total:** ~11,000 tokens (2.2x tier 1)

- **Tier 2 Multi-Source (LLM Dedupe):**
  - Merge call: ~8,000 tokens (input) + 5,000 (output) = 13,000
  - Lesson generation: ~5,000 tokens
  - **Total:** ~18,000 tokens (3.6x tier 1)

**Token Costs (Gemini 2.0 Flash):**
- Input: $0.10 per 1M tokens
- Output: $0.40 per 1M tokens

**Cost Per Lesson:**
- Tier 1: ~$0.003 (negligible)
- Tier 2 Simple: ~$0.006
- Tier 2 LLM Dedupe: ~$0.010

**Recommendation:** Use simple concatenation for MVP. LLM dedupe cost is still negligible (<1¢ per lesson), but adds latency.

---

### 6. Error Handling & Retries

**Question:** What if section extraction fails for one source?

**Scenarios:**
- User selects 3 sources
- Section extraction succeeds for 2, fails for 1
- Should lesson generation proceed?

**Options:**
- A) **Fail Entire Request:** User must fix all sources
  - Pros: All-or-nothing consistency
  - Cons: Poor UX (one bad source blocks all)

- B) **Partial Success:** Generate with available sources
  - Pros: User gets value from working sources
  - Cons: May not realize one source missing

- C) **Warn and Proceed:** Show warning, let user decide
  - Pros: User awareness + flexibility
  - Cons: Requires decision

**Recommendation:** **Option C** - Show modal: "Section extraction failed for Lecture Notes. Proceed with Textbook + Study Guide?"

---

## Summary

This document outlines a **modular, testable, and incremental** architecture for tier 2 lesson generation. Key principles:

1. **Reuse Tier 1 Logic:** Core lesson generation stays the same
2. **Modular Components:** Each module (extraction, merging, generation) is independent and swappable
3. **Progressive Complexity:** Start simple (single source), add features incrementally
4. **Clear Separation:** Source selection ≠ merging ≠ lesson generation
5. **Testability:** Each module has clear inputs/outputs for unit testing

### Next Steps

1. **Review this document** - Discuss open questions, validate architecture
2. **Phase 1 Implementation** - Single source, whole chapter (1-2 days)
3. **Test Phase 1** - Validate core concept works
4. **Phase 2 Implementation** - Section extraction (2-3 days)
5. **Iterate** - Continue through phases with testing between each

### Key Files to Create

**Backend:**
- `backend/src/services/tier2Section.service.js` - Section extraction
- `backend/src/services/tier2Aggregation.service.js` - Multi-source aggregation
- `backend/src/services/tier2Merge/` - Merge strategies folder
  - `strategies/simple.js` - Simple concatenation
  - `index.js` - Strategy selector
- `backend/src/services/tier2Lesson.service.js` - Lesson generation wrapper
- `backend/src/routes/tier2.js` - Add lesson generation endpoints
- `backend/test/tier2*.test.js` - Test files

**Frontend:**
- Source selection modal component
- Section list component for tier 2
- Section matching UI (Phase 4)
- Lesson display (reuse existing)

**Database:**
- Migration for `tier2_sections` table
- Migration for `lessons` table updates (tier2_source_ids column)

---

**Ready to proceed with Phase 1 implementation?** Let's discuss any concerns or modifications before writing code.
