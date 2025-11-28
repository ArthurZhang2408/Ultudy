# Tier 2 Architecture: Multi-Chapter PDF Processing

**Last Updated:** 2025-11-28
**Status:** Implemented (Document Extraction Complete)
**Purpose:** Technical architecture for Tier 2 multi-chapter PDF processing, chapter detection, and extraction

---

## Overview

Tier 2 introduces advanced PDF processing capabilities that allow users to:
1. Upload multi-chapter PDFs (textbooks, comprehensive notes)
2. Automatically detect single vs multi-chapter structure
3. Extract individual chapters with faithful markdown conversion
4. Track individual chapter extraction progress with retry logic
5. View extracted markdown with image descriptions
6. Switch between tiers in test mode for development

This document outlines the implemented architecture and remaining work.

---

## Implementation Status

### ✅ Completed (Document Extraction)
- Database schema (`chapter_markdown` table)
- Chapter detection service (single vs multi)
- Chapter extraction service (by page range) with retry logic for 503 errors
- Upload processor routing by tier
- Tier 2 API endpoints
- ChapterSelectionModal component with UX improvements
- Job polling and real-time status updates
- Chapter source display in course page
- Markdown viewer with raw/rendered toggle
- Individual chapter extraction tracking (one job per chapter)
- Auto-refresh when individual chapters complete
- Multi-chapter parent document cleanup on cancel
- Enhanced prompts to exclude metadata and references
- Test mode tier switching for development
- Multi-chapter parent document filtering in UI

### 🚧 Future Enhancements
- Lesson generation for tier 2 chapter sources
- Real Stripe integration for tier management
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

## Individual Chapter Extraction with Job Queue

### Architecture: One Job Per Chapter

Instead of processing all chapters in a single job, each selected chapter is queued as an individual job. This provides:

**Benefits:**
- **Real-time progress**: Each chapter shows its own status (queued → processing → completed)
- **Fault isolation**: One chapter failure doesn't affect others
- **Resource optimization**: Chapters process concurrently (configurable concurrency)
- **User feedback**: Individual chapter completion triggers UI refresh

**Implementation:**

**Backend:** `chapterExtractionQueue` with dedicated processor
```javascript
// backend/src/jobs/processors/chapterExtraction.processor.js
export async function processChapterExtractionJob(job, { tenantHelpers, jobTracker, storageService }) {
  // Download PDF
  // Extract chapter with retry logic
  // Save to chapter_markdown table
  // Update job progress: 10% → 30% → 70% → 100%
}
```

**Frontend:** Individual task tracking with `createJobPoller`
```typescript
// frontend/src/components/ui/ChapterSelectionModal.tsx
result.jobs.forEach((job: any) => {
  addTask({
    id: job.jobId,
    type: 'extraction',
    title: `Extracting ${documentName} - Chapter ${job.chapterNumber}: ${job.chapterTitle}`,
    status: 'processing',
    progress: 0
  });

  createJobPoller(job.jobId, {
    interval: 2000,
    onProgress: (jobData) => updateTask(job.jobId, { status: 'processing', progress: jobData.progress }),
    onComplete: (jobData) => {
      updateTask(job.jobId, { status: 'completed', progress: 100 });
      router.refresh(); // Show this chapter immediately
    },
    onError: (error) => updateTask(job.jobId, { status: 'failed', error })
  });
});
```

---

## Retry Logic for 503 Errors

Gemini API occasionally returns 503 Service Unavailable during high load. The chapter extraction processor includes automatic retry with exponential backoff:

**Configuration:**
- **Max retries**: 3 attempts
- **Base delay**: 10 seconds
- **Backoff**: Exponential (10s → 20s → 40s)
- **Retry condition**: Only 503/Service Unavailable errors

**Implementation:**
```javascript
// backend/src/jobs/processors/chapterExtraction.processor.js
const MAX_RETRIES = 3;
const BASE_DELAY = 10000; // 10 seconds

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    extraction = await extractSingleChapter(tempPdfPath, chapter.number, ...);
    break; // Success
  } catch (error) {
    if (is503Error(error) && attempt < MAX_RETRIES) {
      const delayMs = BASE_DELAY * Math.pow(2, attempt - 1);
      console.log(`503 error detected. Retrying after ${delayMs}ms...`);
      await sleep(delayMs);
    } else {
      throw error; // Non-503 or max retries reached
    }
  }
}
```

---

## Multi-Chapter Parent Document Handling

Multi-chapter PDFs create a "parent" document in the database with `chapter: null`. This document acts as a container and should never be shown to users.

**Problem:** Parent documents would appear as empty "Uncategorized" sections in the UI.

**Solution:** Systematic filtering at multiple levels

### 1. Identify Parent Documents
```typescript
// frontend/src/app/courses/[id]/page.tsx
const documentIdsWithTier2Sources = new Set<string>();
Object.values(chapterSources).forEach(sources => {
  sources.forEach(source => {
    documentIdsWithTier2Sources.add(source.documentId);
  });
});
```

### 2. Filter Parent Documents
```typescript
const filteredDocuments = documents.filter(doc =>
  !documentIdsWithTier2Sources.has(doc.id)
);
```

### 3. Check for Renderable Content
```typescript
const hasAnyContent =
  filteredDocuments.some(doc => {
    const skills = renderDocumentSession(doc, doc.chapter || 'Uncategorized');
    return skills.length > 0; // Has actual sections/concepts
  }) ||
  processingJobs.length > 0 ||
  Object.keys(chapterSources).length > 0;
```

### 4. Cleanup on Cancel
When user closes chapter selection modal without extracting:
```typescript
// frontend/src/components/ui/ChapterSelectionModal.tsx
const handleClose = async () => {
  // Delete the multi-chapter parent document
  await fetch(`${getBackendUrl()}/documents/${documentId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  onClose();
};
```

**Result:** No orphaned parent documents, clean empty states, consistent UI behavior.

---

## Chapter Selection UX Improvements

### Hide Extract Button When No Selection
```tsx
// Only show Extract button when chapters are selected
{selectedChapters.size > 0 && (
  <Button onClick={handleExtract} variant="primary">
    Extract {selectedChapters.size} Chapter{selectedChapters.size !== 1 ? 's' : ''}
  </Button>
)}
```

**Before:** Disabled extract button appeared, looked like overlapping buttons
**After:** Extract button only appears when needed, clean UI

### All Cancel Actions Trigger Cleanup
- Cancel button → `handleClose()`
- X close button → `handleClose()`
- Click outside modal → `handleClose()`
- Escape key → `handleClose()`

All actions delete the parent document to prevent orphaned records.

---

## Test Mode Tier Switching

For development and testing, users can switch tiers without Stripe integration:

**Environment Variable:**
```bash
# backend/.env
ENABLE_TEST_MODE_TIERS=true
```

**Frontend Toggle:**
```tsx
// frontend/src/app/page.tsx
{process.env.NEXT_PUBLIC_ENABLE_TEST_MODE_TIERS === 'true' && (
  <div className="tier-switch">
    <button onClick={() => switchToTier('free')}>Free Tier</button>
    <button onClick={() => switchToTier('tier1')}>Tier 1</button>
    <button onClick={() => switchToTier('tier2')}>Tier 2</button>
  </div>
)}
```

**Backend Logic:**
```javascript
// backend/src/jobs/processors/upload.processor.js
const ENABLE_TEST_MODE_TIERS = process.env.ENABLE_TEST_MODE_TIERS === 'true';

let userTier;
if (ENABLE_TEST_MODE_TIERS) {
  // Test mode: check subscriptions table
  userTier = await getUserTierFromDB(ownerId);
} else {
  // Production: use Stripe integration
  userTier = await getStripeSubscriptionTier(ownerId);
}
```

**Important:** This is for testing only. Production will use real Stripe integration.

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

### Chapter Extraction Prompt (Enhanced)

```
Extract this chapter as clean, faithful markdown.

OUTPUT FORMAT:
# Chapter_5: Title
[Full content in markdown]

IMAGES:
Replace each image with detailed description:
![Tree structure with 5 nodes: root A connects to B and C, B connects to D and E]

**CONTENT TO EXCLUDE:**
- **Metadata:** Course codes (e.g., "ECE356", "CS101"), instructor names (e.g., "Jeff Zarnett"),
  semester/term (e.g., "Fall 2025"), lecture dates/times (e.g., "2023-09-12"), university names
- **References & Citations:** Bibliographies, reference lists, "References" sections
  (e.g., "[SKS11] Abraham Silberschatz..."), citation lists, "Further Reading" sections
- **Non-content elements:** Page numbers, headers, footers, running headers, margin notes
- **Administrative:** Copyright notices, ISBN numbers, publication details, acknowledgments, prefaces
- **Navigation:** Table of contents sections
- **Anything not directly educational content**

**IMPORTANT - EXCLUDE:**
- Course metadata (course codes, instructor names, dates like "Fall 2025" or "2023-09-12")
- References/bibliographies sections at the end
- Page numbers, headers, footers
- Any non-educational administrative content

FORMATTING:
- LaTeX for math: inline $x^2$, display $$E=mc^2$$
- Markdown tables for tables
- Code blocks with language tags
- Preserve structure and hierarchy
```

**Note:** These enhanced exclusion rules significantly improve extraction quality by filtering out non-educational metadata and reference sections that would clutter the markdown.

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
- [x] Single chapter PDF detection
- [x] Single chapter auto-extraction
- [x] Multi-chapter PDF detection
- [x] Chapter list parsing
- [x] Page range splitting
- [x] Multi-chapter extraction with retry logic
- [x] Database storage (chapter_markdown table)
- [x] Tier routing logic (test mode)
- [x] Individual job queue per chapter
- [x] 503 error retry with exponential backoff

### Frontend
- [x] Tier 2 upload modal
- [x] Job polling with createJobPoller
- [x] Chapter selection modal
- [x] Chapter extraction trigger
- [x] Chapter sources display
- [x] Markdown viewer (raw/rendered toggle)
- [x] Error handling
- [x] Real-time status updates
- [x] Individual chapter completion refresh
- [x] Multi-chapter parent document filtering
- [x] Extract button UX (hide when no selection)
- [x] Parent document cleanup on cancel

### Integration
- [x] End-to-end single chapter flow
- [x] End-to-end multi-chapter flow
- [x] Individual chapter tracking
- [x] Metadata and reference exclusion
- [x] Test mode tier switching
- [ ] LaTeX rendering (depends on lesson generation)
- [ ] Multi-source display (future)

---

## Future Enhancements

### Lesson Generation for Tier 2 Sources

Currently, tier 2 sources are extracted and viewable but not used for lesson generation. Future work:
1. Modify lesson generation to accept tier 2 chapter sources
2. Merge multiple sources for same chapter before lesson generation
3. Use enhanced markdown for better lesson quality

### Real Stripe Integration

Replace test mode tier switching with actual Stripe subscription management:
1. Stripe webhook integration
2. Subscription tier enforcement
3. Payment flow
4. Usage tracking and limits

### Multi-Source Merging

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

- `SUBSCRIPTION_ARCHITECTURE.md` - Tier enforcement and payment flow (future)
- `PRICING_TIERS.md` - Tier features and pricing strategy
- `backend/PDF_EXTRACTION_GUIDE.md` - PDF processing overview
- `ASYNC_OPERATIONS.md` - Job queue system
- `LESSON_GENERATION_ARCHITECTURE.md` - Lesson generation (tier 1 only currently)

---

## Changelog

### 2025-11-28: Document Extraction Complete
- ✅ Implemented individual chapter extraction with job queue
- ✅ Added retry logic for 503 errors (exponential backoff)
- ✅ Completed job polling and real-time status updates
- ✅ Implemented chapter source display in course page
- ✅ Created markdown viewer with raw/rendered toggle
- ✅ Fixed multi-chapter parent document handling
- ✅ Enhanced UX for chapter selection modal
- ✅ Added test mode tier switching
- ✅ Improved extraction prompts to exclude metadata and references
- Updated documentation to reflect completed implementation

### 2025-11-25: Backend Implementation
- Backend complete, frontend in progress
- Chapter detection and extraction services implemented
- Tier 2 API endpoints created

### 2025-11-24: Initial Planning
- Initial planning document created
- Architecture designed
