# Tier 2 Architecture: Multi-Chapter PDF Processing

**Last Updated:** 2025-11-25
**Status:** Implemented (Backend Complete, Frontend In Progress)
**Purpose:** Technical architecture for Tier 2 multi-chapter PDF processing, chapter detection, and extraction

---

## Overview

Tier 2 introduces advanced PDF processing capabilities that allow users to:
1. Upload multi-chapter PDFs (textbooks, comprehensive notes)
2. Automatically detect single vs multi-chapter structure
3. Extract individual chapters with faithful markdown conversion
4. View extracted markdown with image descriptions
5. Support multi-source chapter merging (future enhancement)

This document outlines the implemented architecture and remaining work.

---

## Implementation Status

### ✅ Completed
- Database schema (`chapter_markdown` table)
- Chapter detection service (single vs multi)
- Chapter extraction service (by page range)
- Upload processor routing by tier
- Tier 2 API endpoints
- ChapterSelectionModal component

### 🚧 In Progress
- Job polling to trigger modal
- Chapter source display in course page
- Markdown viewer with raw/rendered toggle

### 📋 Future Enhancements
- Multi-source merging for same chapter
- Conflict detection and deduplication
- Source attribution in merged content

---

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                Tier 2 User Uploads PDF                      │
│              (via Tier2UploadModal component)               │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│           POST /upload/pdf-structured                       │
│  • Saves PDF to storage (S3 or local)                       │
│  • Creates job in database                                  │
│  • Queues for background processing                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│          Upload Processor (Tier Detection)                  │
│  • Checks user's tier from subscriptions table              │
│  • Routes to processTier2UploadJob if tier2                 │
│  • Routes to legacy processor for free/tier1                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│      Tier 2 Detection (detectChapterStructure)              │
│  • Downloads PDF from storage                               │
│  • Calls Gemini Vision API                                  │
│  • Detects: single-chapter OR multi-chapter                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
                   ┌────┴────┐
                   │         │
        ┌──────────▼──┐  ┌──▼──────────┐
        │   SINGLE    │  │   MULTI     │
        │   CHAPTER   │  │  CHAPTER    │
        └──────┬──────┘  └──┬──────────┘
               │            │
               │            ▼
               │  ┌─────────────────────────────────────────┐
               │  │  Store document with chapter=NULL       │
               │  │  Return detection results to frontend   │
               │  │  Job marked complete with:              │
               │  │  - type: 'multi_chapter'                │
               │  │  - chapters: [...detected chapters]     │
               │  │  - storage_key: for later extraction    │
               │  └──────────────┬──────────────────────────┘
               │                 │
               │                 ▼
               │  ┌─────────────────────────────────────────┐
               │  │  Frontend: ChapterSelectionModal        │
               │  │  • Polls job status                     │
               │  │  • Detects multi_chapter completion     │
               │  │  • Shows checkbox list                  │
               │  │  • All chapters selected by default     │
               │  └──────────────┬──────────────────────────┘
               │                 │
               │                 ▼
               │  ┌─────────────────────────────────────────┐
               │  │  POST /tier2/extract-chapters           │
               │  │  • Downloads PDF from storage           │
               │  │  • For each selected chapter:           │
               │  │    - Split PDF by page range            │
               │  │    - Extract markdown via Gemini Vision │
               │  │    - Save to chapter_markdown table     │
               │  └──────────────┬──────────────────────────┘
               │                 │
               ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│            chapter_markdown table populated                 │
│  • One row per chapter extraction                           │
│  • Links to document_id                                     │
│  • Contains full markdown with image descriptions           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│       Frontend: Course Page Shows Chapter Sources           │
│  • Fetches: GET /tier2/chapter-sources/:courseId            │
│  • Groups sources by chapter_number                         │
│  • Displays document names under each chapter               │
│  • [View Markdown] button next to each source               │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### `chapter_markdown` Table

```sql
CREATE TABLE chapter_markdown (
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

CREATE INDEX idx_chapter_markdown_course ON chapter_markdown(course_id, chapter_number);
CREATE INDEX idx_chapter_markdown_document ON chapter_markdown(document_id);
CREATE INDEX idx_chapter_markdown_owner ON chapter_markdown(owner_id);
```

**Design Decisions:**
- **One row per chapter**: Each extraction is a separate row (smallest unit)
- **document_id links to source**: Multi-chapter PDFs create multiple rows
- **chapter field in documents table is NULL**: For tier 2 multi-chapter uploads
- **Backward compatible**: Tier 1 uploads still use documents.chapter string field

---

## Backend Implementation

### Service: tier2Detection.js

**Purpose:** Detect if PDF is single or multi-chapter, extract single chapters immediately

**Key Functions:**
- `detectChapterStructure(pdfPath)` - Main detection function
- `parseSingleChapterMarkdown(markdown)` - Parses `# Chapter_5: Title` format
- `parseMultiChapterResponse(text)` - Parses pipe-separated chapter list

**LLM Response Formats (No JSON):**

**Single Chapter:**
```markdown
# Chapter_5: Introduction to Algorithms

[Full markdown content with image descriptions...]
```

**Multi-Chapter:**
```
1|Introduction to Algorithms|1|25
2|Data Structures|26|58
3|Graph Theory|59|102
```

**Design Decision:** Plain text formats instead of JSON to reduce parsing errors and improve LLM reliability.

---

### Service: tier2Extraction.js

**Purpose:** Extract individual chapters from multi-chapter PDFs

**Key Functions:**
- `extractSingleChapter(pdfPath, chapterNumber, chapterTitle, pageStart, pageEnd)`
- `splitPdfByPageRange(sourcePdfPath, pageStart, pageEnd)` - Uses pdf-lib to split

**Process:**
1. Split PDF to temp file with only chapter pages
2. Send to Gemini Vision with extraction prompt
3. Parse response for chapter markdown
4. Return structured data

**Image Handling:**
- Replace images with detailed textual descriptions
- Example: `![Tree data structure with 5 nodes: root A connects to B and C, B connects to D and E]`
- Descriptions should allow reconstruction of diagrams

---

### Processor: tier2Upload.processor.js

**Purpose:** Handle tier 2 uploads from detection to storage

**Flow:**
1. Download PDF from storage if needed
2. Call `detectChapterStructure()`
3. **If single chapter:**
   - Insert document record
   - Insert chapter_markdown record
   - Mark job complete
4. **If multi-chapter:**
   - Insert document record (chapter=NULL)
   - Return chapter list in job result
   - Mark job complete with `awaiting_user_selection: true`

**Design Decision:** Single chapter auto-extracts immediately for better UX. Multi-chapter waits for user selection to avoid wasting resources on unwanted chapters.

---

### Routes: /tier2/*

**POST /tier2/extract-chapters**
```json
// Request
{
  "documentId": "uuid",
  "storageKey": "s3-key-or-path",
  "courseId": "uuid",
  "chapters": [
    { "number": 1, "title": "...", "pageStart": 1, "pageEnd": 25 },
    { "number": 3, "title": "...", "pageStart": 59, "pageEnd": 102 }
  ]
}

// Response
{
  "success": true,
  "extracted": 2,
  "total": 2,
  "results": [
    { "chapter_number": 1, "chapter_title": "...", "id": "uuid", "success": true },
    { "chapter_number": 3, "chapter_title": "...", "id": "uuid", "success": true }
  ]
}
```

**GET /tier2/chapter-markdown/:id**
```json
{
  "id": "uuid",
  "document_id": "uuid",
  "chapter_number": 1,
  "chapter_title": "Introduction",
  "markdown_content": "# Content here...",
  "page_start": 1,
  "page_end": 25,
  "created_at": "2025-11-25T..."
}
```

**GET /tier2/chapter-sources/:courseId**
```json
{
  "chapters": {
    "1": [
      {
        "id": "markdown-uuid",
        "documentId": "doc-uuid",
        "documentTitle": "textbook.pdf",
        "chapterTitle": "Introduction",
        "pageStart": 1,
        "pageEnd": 25,
        "createdAt": "..."
      },
      {
        "id": "markdown-uuid-2",
        "documentId": "doc-uuid-2",
        "documentTitle": "lecture_1.pdf",
        "chapterTitle": "Intro Lecture",
        "pageStart": null,
        "pageEnd": null,
        "createdAt": "..."
      }
    ],
    "2": [...]
  }
}
```

---

## Frontend Implementation

### Component: Tier2UploadModal.tsx

**Purpose:** Simplified upload modal for tier 2 users

**Key Differences from UploadModal:**
- No "Material Type" dropdown (defaults to textbook)
- No "Chapter/Section" input field
- Title: "Upload Textbook/Lecture Note"

**Design Decision:** Simplified UI reflects tier 2's focus on comprehensive materials rather than granular organization.

---

### Component: ChapterSelectionModal.tsx

**Purpose:** Allow users to select which chapters to extract from multi-chapter PDFs

**Features:**
- Checkbox list of detected chapters
- All chapters selected by default
- Select/Deselect all button
- Shows chapter number, title, page range
- Disabled during extraction
- Progress indicator
- Error handling

**Usage:**
```tsx
<ChapterSelectionModal
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  documentId={doc.id}
  documentName={doc.title}
  storageKey={job.storage_key}
  courseId={courseId}
  chapters={job.chapters}
/>
```

---

## Remaining Work

### 1. Job Polling Integration (courses/[id]/page.tsx)

**TODO:** Add polling logic to detect tier 2 job completion and trigger modal

```tsx
// Pseudo-code
useEffect(() => {
  if (job.status === 'completed' && job.result.type === 'multi_chapter') {
    setChapterSelectionData({
      documentId: job.result.document_id,
      documentName: job.result.title,
      storageKey: job.result.storage_key,
      chapters: job.result.chapters
    });
    setIsChapterSelectionOpen(true);
  }
}, [processingJobs]);
```

---

### 2. Chapter Sources Display

**TODO:** Fetch and display chapter sources in course page

```tsx
// Pseudo-code
const { chapterSources } = useFetchChapterSources(courseId);

// In chapter section:
{chapterSources[chapterNumber]?.map(source => (
  <div key={source.id}>
    <span>{source.documentTitle}</span>
    <button onClick={() => viewMarkdown(source.id)}>
      View Markdown
    </button>
  </div>
))}
```

---

### 3. Markdown Viewer Component

**TODO:** Create component to display markdown with raw/rendered toggle

**Features:**
- Toggle button: [Raw] [Rendered]
- Raw view: Plain text in monospace
- Rendered view: Markdown + LaTeX rendering
- Modal or expandable panel
- Syntax highlighting for code blocks

---

## LLM Prompts

### Chapter Detection Prompt

```
You are an expert at analyzing educational PDFs (textbooks, lecture notes).

YOUR TASK:
Determine if this PDF contains a SINGLE chapter or MULTIPLE chapters.

SINGLE CHAPTER if:
- PDF covers ONE chapter/topic only
- Titled like "Chapter 5", "Lecture 3", "Unit 2"
- All content cohesive and related

MULTI-CHAPTER if:
- PDF contains multiple chapters
- Has table of contents with chapters
- Clear chapter boundaries
- Covers multiple distinct topics

RESPONSE FORMAT:

For SINGLE CHAPTER:
# Chapter_N: Title
[Full markdown extraction]

For MULTI-CHAPTER:
number|title|pageStart|pageEnd
number|title|pageStart|pageEnd

Example:
1|Introduction to Programming|1|28
2|Variables and Data Types|29|52
```

### Chapter Extraction Prompt

```
Extract this chapter as clean, faithful markdown.

OUTPUT FORMAT:
# Chapter_5: Title
[Full content in markdown]

IMAGES:
Replace each image with detailed description:
![Tree structure with 5 nodes: root A connects to B and C, B connects to D and E]

EXCLUDE:
- Page numbers, headers, footers
- References to other chapters
- Copyright notices

FORMATTING:
- LaTeX for math: inline $x^2$, display $$E=mc^2$$
- Markdown tables for tables
- Code blocks with language tags
- Preserve structure and hierarchy
```

---

## Cost Analysis

**Tier 2 Pricing:** $40/month

**Chapter Extraction Costs:**
- Detection: ~1-2 cents per PDF (analyzing first 10-20 pages)
- Single chapter extraction: ~5-10 cents
- Multi-chapter extraction: ~5-10 cents per chapter

**Monthly Limit:** 100 chapters/month
- Max cost: $10/month in LLM usage
- Profit margin: $30/month per user

---

## Testing Checklist

### Backend
- [ ] Single chapter PDF detection
- [ ] Single chapter auto-extraction
- [ ] Multi-chapter PDF detection
- [ ] Chapter list parsing
- [ ] Page range splitting
- [ ] Multi-chapter extraction
- [ ] Database storage
- [ ] Tier routing logic

### Frontend
- [ ] Tier 2 upload modal
- [ ] Job polling
- [ ] Chapter selection modal
- [ ] Chapter extraction trigger
- [ ] Chapter sources display
- [ ] Markdown viewer
- [ ] Error handling

### Integration
- [ ] End-to-end single chapter flow
- [ ] End-to-end multi-chapter flow
- [ ] Image description quality
- [ ] LaTeX rendering
- [ ] Multi-source display (future)

---

## Future Enhancements

### Multi-Source Merging (Post-MVP)

When multiple sources exist for same chapter:
1. Fetch all markdown for chapter_number
2. Send to LLM for conflict detection
3. Deduplicate redundant content
4. Merge with source attribution
5. Store merged version
6. Use merged version for lesson generation

**API:** `POST /tier2/merge-chapter`
```json
{
  "course_id": "uuid",
  "chapter_number": 1,
  "source_ids": ["uuid1", "uuid2"]
}
```

---

## Related Documentation

- `SUBSCRIPTION_ARCHITECTURE.md` - Tier enforcement and payment flow
- `PRICING_TIERS.md` - Tier features and pricing strategy
- `backend/PDF_EXTRACTION_GUIDE.md` - PDF processing overview
- `ASYNC_OPERATIONS.md` - Job queue system

---

**Document History:**
- 2025-11-24: Initial planning document
- 2025-11-25: Updated with actual implementation details (backend complete, frontend in progress)
