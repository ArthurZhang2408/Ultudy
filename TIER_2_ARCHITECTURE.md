# Tier 2 Architecture: Multi-Chapter PDF Processing

**Last Updated:** 2025-11-24
**Status:** Planning
**Purpose:** Technical architecture for Tier 2 multi-chapter PDF processing, chapter detection, and multi-source merging

---

## Overview

Tier 2 introduces advanced PDF processing capabilities that allow users to:
1. Upload multi-chapter PDFs (textbooks, comprehensive notes)
2. Detect and extract individual chapters automatically
3. Combine multiple sources for the same chapter
4. Generate high-quality lessons from merged content

This document outlines the technical implementation strategy.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User Upload (Tier 2)                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         Step 1: Chapter Detection (Flash-Lite Vision)       │
│  • Analyze first 10-20 pages                                │
│  • Detect single vs multi-chapter                           │
│  • Extract: chapter_number, title, page_range               │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         Step 2: User Chapter Selection (Frontend)           │
│  • Display checkbox list of detected chapters               │
│  • User selects which chapters to import                    │
│  • Validation: Check against monthly limit                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│       Step 3: Chapter Extraction (On-Demand, No Storage)    │
│  • For each selected chapter:                               │
│    - Extract pages using page_range                         │
│    - Convert to images (PDF → PNG)                          │
│    - Send to Flash-Lite vision for markdown                 │
│  • Store: chapter_metadata + markdown_content               │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│          Step 4: Source Organization (Frontend)             │
│  • Group chapters by chapter_number across sources          │
│  • Display:                                                 │
│    Chapter 1                                                │
│    ├─ textbook.pdf                                          │
│    └─ lecture_1.pdf                                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│       Step 5: Content Merging (When User Clicks "Study")    │
│  • Fetch all markdowns for chapter_number                   │
│  • Content conflict detection (Flash-Lite)                  │
│  • Deduplication (Flash-Lite)                               │
│  • Merge with source attribution                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         Step 6: Lesson Generation (Flash or Flash-Lite)     │
│  • Input: Merged markdown                                   │
│  • Extract sections                                         │
│  • Generate concepts per section                            │
│  • Store lesson in database                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Implementation

### Step 1: Chapter Detection

**Endpoint:** `POST /api/documents/detect-chapters`

**Input:**
```json
{
  "document_id": "uuid",
  "file_url": "s3://...",
  "user_id": "clerk_user_id"
}
```

**Process:**
1. Download PDF from S3
2. Extract first 10-20 pages (configurable)
3. Convert pages to images (PNG, base64)
4. Send to Gemini 2.5 Flash-Lite with prompt:

```javascript
const prompt = `
Analyze this PDF document and determine if it's a single-chapter or multi-chapter document.

If SINGLE-CHAPTER:
Return: { "type": "single", "chapter_number": 1, "title": "..." }

If MULTI-CHAPTER:
For each chapter, extract:
- chapter_number (integer)
- chapter_title (string)
- page_start (integer, 1-indexed)
- page_end (integer, 1-indexed, estimated if not explicit)

Return JSON array:
[
  {
    "chapter_number": 1,
    "chapter_title": "Introduction to Databases",
    "page_start": 1,
    "page_end": 15
  },
  {
    "chapter_number": 2,
    "chapter_title": "Relational Model",
    "page_start": 16,
    "page_end": 30
  }
]

IMPORTANT:
- Only include chapters that are clearly marked
- Use the actual page numbers from the PDF (not the printed page numbers in the document)
- If unsure about page_end, estimate based on next chapter's page_start
`;
```

5. Parse JSON response
6. Validate response structure
7. Store in `chapter_metadata` table

**Output:**
```json
{
  "type": "multi",
  "chapters": [
    {
      "chapter_number": 1,
      "chapter_title": "Introduction to Databases",
      "page_start": 1,
      "page_end": 15,
      "estimated": false
    },
    {
      "chapter_number": 2,
      "chapter_title": "Relational Model",
      "page_start": 16,
      "page_end": 30,
      "estimated": false
    }
  ]
}
```

**Error Handling:**
- If AI detection fails: Allow manual chapter input
- If page ranges overlap: Flag warning, let user adjust
- If too many chapters (>50): Prompt user to split PDF

---

### Step 2: User Chapter Selection

**Frontend Component:** `ChapterSelectionModal.tsx`

**UI:**
```tsx
<Modal>
  <h2>Select Chapters to Import</h2>
  <p>You have {remainingChapters}/100 chapters remaining this month</p>

  {chapters.map(chapter => (
    <Checkbox
      key={chapter.chapter_number}
      label={`Chapter ${chapter.chapter_number}: ${chapter.chapter_title}`}
      sublabel={`Pages ${chapter.page_start}-${chapter.page_end}`}
      checked={selected.includes(chapter.chapter_number)}
      onChange={(checked) => toggleChapter(chapter.chapter_number, checked)}
    />
  ))}

  <Button onClick={importSelectedChapters}>
    Import {selected.length} Chapters
  </Button>
</Modal>
```

**Validation:**
- Check if `selected.length + current_month_usage <= 100`
- If exceeds: Offer overage purchase modal
- Update `monthly_usage.chapters_generated`

---

### Step 3: Chapter Extraction

**Endpoint:** `POST /api/documents/extract-chapter`

**Input:**
```json
{
  "document_id": "uuid",
  "chapter_number": 1,
  "page_start": 1,
  "page_end": 15
}
```

**Process:**

1. **Fetch PDF from S3** (original uploaded file)
2. **Extract page range** using `pdf-lib` or `pdfjs-dist`:
   ```javascript
   const PDFDocument = require('pdf-lib').PDFDocument;

   async function extractPages(pdfBuffer, pageStart, pageEnd) {
     const srcDoc = await PDFDocument.load(pdfBuffer);
     const newDoc = await PDFDocument.create();

     // Pages are 0-indexed in pdf-lib, so adjust
     const pageIndices = [];
     for (let i = pageStart - 1; i < pageEnd; i++) {
       pageIndices.push(i);
     }

     const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
     copiedPages.forEach(page => newDoc.addPage(page));

     return await newDoc.save();
   }
   ```

3. **Convert to images** (for vision model):
   ```javascript
   const pdfjsLib = require('pdfjs-dist/legacy/build/pdf');

   async function pdfToImages(pdfBuffer) {
     const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
     const images = [];

     for (let i = 1; i <= pdf.numPages; i++) {
       const page = await pdf.getPage(i);
       const viewport = page.getViewport({ scale: 2.0 });
       const canvas = createCanvas(viewport.width, viewport.height);
       const context = canvas.getContext('2d');

       await page.render({ canvasContext: context, viewport }).promise;
       images.push(canvas.toBuffer('image/png'));
     }

     return images;
   }
   ```

4. **Send to Gemini Vision** for markdown extraction:
   ```javascript
   const prompt = `
   Convert this chapter to clean, well-formatted markdown.

   Requirements:
   - Preserve all headings, subheadings
   - Keep all formulas in LaTeX format
   - Include all diagrams/figures with descriptions
   - Maintain bullet points and numbered lists
   - Remove headers/footers/page numbers

   Return ONLY the markdown, no additional commentary.
   `;

   const response = await gemini.generateContent({
     contents: [
       { role: 'user', parts: [{ text: prompt }, ...images.map(img => ({ inlineData: { mimeType: 'image/png', data: img.toString('base64') } }))] }
     ]
   });

   const markdown = response.text();
   ```

5. **Store in database**:
   ```sql
   INSERT INTO chapter_metadata (
     document_id,
     chapter_number,
     chapter_title,
     page_start,
     page_end,
     source_pdf_url,
     markdown_content
   ) VALUES ($1, $2, $3, $4, $5, $6, $7);
   ```

**Output:**
```json
{
  "chapter_id": "uuid",
  "markdown_length": 12500,
  "processing_time_ms": 8500
}
```

**Optimization:**
- **No storage of split PDFs** - saves S3 costs
- Extract on-demand when user selects chapter
- Cache markdown in database (cheaper than re-extracting)

---

### Step 4: Source Organization

**Endpoint:** `GET /api/chapters/by-number?chapter_number=1&course_id=uuid`

**Process:**
1. Query all `chapter_metadata` WHERE `chapter_number = 1` AND `course_id = uuid`
2. Group by `document_id` (source)
3. Return array with source metadata

**Output:**
```json
{
  "chapter_number": 1,
  "sources": [
    {
      "document_id": "uuid1",
      "document_name": "textbook.pdf",
      "chapter_title": "Introduction to Databases",
      "page_range": "1-15",
      "markdown_preview": "# Introduction\n\nDatabases are..."
    },
    {
      "document_id": "uuid2",
      "document_name": "lecture_1.pdf",
      "chapter_title": "Intro to Databases",
      "page_range": "1-8",
      "markdown_preview": "# Lecture 1\n\nToday we cover..."
    }
  ]
}
```

**Frontend Display:**
```tsx
<ChapterView chapterNumber={1}>
  <h2>Chapter 1: Introduction to Databases</h2>
  <p>{sources.length} sources available</p>

  {sources.map(source => (
    <SourceCard
      key={source.document_id}
      name={source.document_name}
      title={source.chapter_title}
      pageRange={source.page_range}
      preview={source.markdown_preview}
    />
  ))}

  <Button onClick={() => studyChapter(1)}>
    Study Chapter 1
  </Button>
</ChapterView>
```

---

### Step 5: Content Merging

**Endpoint:** `POST /api/chapters/merge-sources`

**Input:**
```json
{
  "chapter_number": 1,
  "source_ids": ["uuid1", "uuid2"],
  "course_id": "uuid"
}
```

**Process:**

#### 5.1 Content Conflict Detection

```javascript
async function detectConflicts(markdowns) {
  const prompt = `
  Analyze these two markdown documents and determine if they cover the same topic.

  Document 1:
  ${markdowns[0].substring(0, 2000)}

  Document 2:
  ${markdowns[1].substring(0, 2000)}

  Return JSON:
  {
    "same_topic": true/false,
    "similarity_score": 0.0-1.0,
    "topic_1": "brief description",
    "topic_2": "brief description",
    "warning": "optional warning message if different topics"
  }
  `;

  const response = await gemini.generateContent(prompt);
  return JSON.parse(response.text());
}
```

**If conflict detected:**
```json
{
  "same_topic": false,
  "similarity_score": 0.3,
  "topic_1": "Database fundamentals",
  "topic_2": "Computer networking",
  "warning": "These sources appear to cover different topics. Are you sure you want to merge them?"
}
```

Frontend shows warning modal, user can proceed or cancel.

#### 5.2 Deduplication

```javascript
async function deduplicateContent(markdowns) {
  const prompt = `
  You are given multiple markdown documents covering the same topic.
  Your task is to merge them into a single, comprehensive document while:

  1. Removing duplicate content
  2. Preserving unique information from each source
  3. Maintaining clear source attribution
  4. Keeping the best explanation for overlapping concepts

  Documents:
  ${markdowns.map((md, i) => `## Source ${i + 1}\n${md}`).join('\n\n')}

  Return the merged markdown with this structure:
  # [Chapter Title]

  ## [Section 1 Name]
  [Content with inline citations like: "According to Source 1, ..." or "(Source 2)"]

  ## [Section 2 Name]
  [Content...]

  Include ALL unique information. When content overlaps, choose the clearest explanation.
  `;

  const response = await gemini.generateContent(prompt);
  return response.text();
}
```

#### 5.3 Source Attribution

Add headers to indicate sources:
```markdown
# Chapter 1: Introduction to Databases

> **Sources:** textbook.pdf (pages 1-15), lecture_1.pdf (pages 1-8)

## What is a Database?

According to the textbook, a database is...

*Note: Lecture 1 provides a simpler definition: "...*"

## Relational Model

[Merged content with citations...]
```

**Output:**
```json
{
  "merged_markdown": "# Chapter 1...",
  "sources_used": ["textbook.pdf", "lecture_1.pdf"],
  "deduplication_stats": {
    "total_sections": 15,
    "duplicate_sections_removed": 5,
    "unique_sections_kept": 10
  }
}
```

---

### Step 6: Lesson Generation

Use existing lesson generation flow with merged markdown:

**Endpoint:** `POST /api/lessons/generate`

**Input:**
```json
{
  "course_id": "uuid",
  "chapter_number": 1,
  "markdown_content": "[merged markdown]",
  "model": "flash" // or "flash-lite" if user toggled "Faster Response"
}
```

**Process:**
1. Extract sections from merged markdown (Flash or Flash-Lite)
2. For each section, generate concepts
3. Store lesson with `lesson.chapter_number = 1`
4. Link to multiple source documents via `lesson_sources` table

**Database Schema:**
```sql
CREATE TABLE lesson_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Database Schema Changes

### New Tables

```sql
-- Chapter metadata
CREATE TABLE chapter_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  chapter_title TEXT NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  markdown_content TEXT, -- Cached extraction
  created_at TIMESTAMP DEFAULT NOW(),
  owner_id TEXT NOT NULL,
  UNIQUE(document_id, chapter_number)
);

-- Lesson sources (many-to-many)
CREATE TABLE lesson_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  chapter_metadata_id UUID REFERENCES chapter_metadata(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chapter_metadata_course ON chapter_metadata(course_id, chapter_number);
CREATE INDEX idx_chapter_metadata_owner ON chapter_metadata(owner_id);
CREATE INDEX idx_lesson_sources_lesson ON lesson_sources(lesson_id);
```

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/documents/detect-chapters` | POST | Detect chapters in uploaded PDF |
| `/api/documents/extract-chapter` | POST | Extract specific chapter by page range |
| `/api/chapters/by-number` | GET | Get all sources for a chapter number |
| `/api/chapters/merge-sources` | POST | Merge multiple sources with deduplication |
| `/api/lessons/generate` | POST | Generate lesson from merged markdown |
| `/api/usage/current` | GET | Get current month's usage stats |

---

## Frontend Components

### New Components

1. **`ChapterDetectionModal.tsx`**
   - Shows detected chapters with checkboxes
   - Displays remaining monthly quota
   - Handles chapter selection

2. **`ChapterSourceCard.tsx`**
   - Shows single source for a chapter
   - Preview of markdown content
   - Page range and document name

3. **`ChapterMergeView.tsx`**
   - Groups sources by chapter number
   - "Study Chapter" button
   - Source conflict warnings

4. **`UsageDashboard.tsx`**
   - Shows chapters used this month
   - Overage pricing calculator
   - Upgrade prompts

### Updated Components

1. **`UploadModal.tsx`**
   - Tier-based upload flow
   - Page limit validation (Free tier)
   - Chapter detection trigger (Tier 2)

2. **`CourseView.tsx`**
   - Chapter-based organization (Tier 2)
   - Section-based organization (Tier 1)

---

## Performance Considerations

### Caching Strategy
- **Markdown content**: Cache in `chapter_metadata.markdown_content`
- **Merged chapters**: Cache for 24 hours in Redis
- **Deduplication results**: Cache key = hash of source IDs

### Rate Limiting
- Chapter detection: 10 requests per hour (prevents abuse)
- Chapter extraction: 20 requests per hour
- Merging: 30 requests per hour

### Optimization
- Extract chapters in parallel (up to 5 concurrent)
- Use smaller images for vision (reduce bandwidth)
- Compress markdown before storage

---

## Error Handling

### Chapter Detection Failures
- **Fallback**: Allow manual chapter entry
- **Retry**: Offer re-analysis with different pages
- **Support**: Log failures for manual review

### Extraction Failures
- **Partial success**: Save successfully extracted chapters
- **Retry**: Allow per-chapter retry
- **Refund**: Deduct from monthly quota only on success

### Merge Conflicts
- **User choice**: Show conflict, let user decide
- **Skip merge**: Allow using single source
- **Manual merge**: Advanced users can edit markdown

---

## Testing Strategy

### Unit Tests
- Chapter detection prompt parsing
- Page range extraction logic
- Markdown deduplication algorithm
- Content conflict detection

### Integration Tests
- End-to-end: Upload → Detect → Extract → Merge → Generate
- Multi-source merging with 2, 3, 4+ sources
- Overage limit enforcement

### User Acceptance Tests
- Real textbook PDFs (50+ pages)
- Mixed sources (textbook + lecture slides)
- Edge cases (1-page chapters, no chapter markers)

---

## Monitoring & Metrics

### Track These Metrics
- Chapter detection accuracy (manual review of 100 samples)
- Average extraction time per chapter
- Deduplication effectiveness (% duplicates removed)
- Merge conflict rate (% of merges with warnings)
- User satisfaction with merged content (feedback prompts)

### Alerts
- Detection failure rate > 5%
- Extraction timeout rate > 2%
- Merge failures > 1%

---

## Migration Path

### Phase 1: Infrastructure (Week 1-2)
- Create database tables
- Build chapter detection endpoint
- Build extraction endpoint

### Phase 2: Core Features (Week 3-4)
- Chapter selection UI
- Source organization UI
- Basic merging (no deduplication)

### Phase 3: Advanced Features (Week 5-6)
- Content conflict detection
- Deduplication with AI
- Usage dashboard

### Phase 4: Polish & Launch (Week 7-8)
- Error handling improvements
- Performance optimization
- Beta testing with 50 users

---

## Related Documentation
- [PRICING_TIERS.md](PRICING_TIERS.md) - Tier 2 pricing and limits
- [backend/PDF_EXTRACTION_GUIDE.md](backend/PDF_EXTRACTION_GUIDE.md) - PDF processing basics
- [LESSON_GENERATION_ARCHITECTURE.md](LESSON_GENERATION_ARCHITECTURE.md) - Lesson generation flow

---

## Changelog
- 2025-11-24: Initial Tier 2 architecture documentation created
