# Tier Testing and Architecture Issues

## Issue 1: Tier 2 Upload Going Through Tier 1 Processing

### Problem
When uploading `lecture_1.pdf` as a tier 2 user, the system:
1. Placed it in "Uncategorized" section
2. Generated sections (tier 1 behavior)

Instead of:
1. Auto-detecting chapter number
2. Displaying markdown content only (no sections)

### Root Cause
The subscription system defaults to **'free' tier** when creating new users. The tier routing check in `backend/src/jobs/processors/upload.processor.js` only routes to tier 2 if the database subscription record has `tier = 'tier2'`.

```javascript
// backend/src/jobs/processors/upload.processor.js:44-50
const userTier = await getUserTier(ownerId);
console.log(`[UploadProcessor] User tier: ${userTier}`);

if (userTier === 'tier2') {
  console.log(`[UploadProcessor] Routing to Tier 2 processor`);
  return await processTier2UploadJob(job, {...});
}
```

```javascript
// backend/src/routes/subscriptions.js:49-57
// Create default free tier subscription
const createResult = await queryWrite(
  `INSERT INTO subscriptions (user_id, tier, status, current_period_start, current_period_end)
   VALUES ($1, 'free', 'active', NOW(), NOW() + INTERVAL '1 year')
   RETURNING *`,
  [userId]
);
```

### Solution: Upgrade to Tier 2 (Test Mode)

#### Option 1: Using Frontend Console
```javascript
// Open browser console on any page where you're signed in
const response = await fetch('http://localhost:3001/subscriptions/upgrade', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${await window.Clerk.session.getToken()}`
  },
  body: JSON.stringify({ tier: 'tier2' })
});
console.log(await response.json());
```

#### Option 2: Using curl (with Clerk token)
```bash
# Get your Clerk token from the browser console first:
# await window.Clerk.session.getToken()

curl -X POST http://localhost:3001/subscriptions/upgrade \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CLERK_TOKEN_HERE" \
  -d '{"tier":"tier2"}'
```

#### Option 3: Direct Database Update
```sql
-- In Railway or local database
UPDATE subscriptions
SET tier = 'tier2', updated_at = NOW()
WHERE user_id = 'YOUR_CLERK_USER_ID';
```

#### Verify Upgrade
After upgrading, refresh the page and check:
1. Frontend will fetch new tier from `/subscriptions/current`
2. Upload button should show "Upload Textbook/Lecture Note" instead of "Upload Materials"
3. Next upload will route through tier 2 processor

---

## Issue 2: Tier 1 Multi-Document Architecture Flaw

### Problem
**Current Behavior (Tier 1):**
- User uploads `chapter_3.pdf` labeled as "Chapter 3"
  - Generates sections: 3.1, 3.2, 3.3
- User uploads `lecture_3.pdf` also labeled as "Chapter 3"
  - Generates sections: 3.1, 3.2
  - **These sections get mixed with the first document's sections!**

### Why This Happens
The current tier 1 architecture groups content by **chapter**, not by **document**:

```javascript
// frontend/src/app/courses/[id]/page.tsx:733-740
// Group documents by chapter
const documentsByChapter = documents.reduce((acc, doc) => {
  const chapter = doc.chapter || 'Uncategorized';
  if (!acc[chapter]) {
    acc[chapter] = [];
  }
  acc[chapter].push(doc);
  return acc;
}, {} as Record<string, Document[]>);
```

But when fetching sections and concepts, the code fetches by `document_id` AND `chapter`, then **merges all sections from all documents in the same chapter**:

```javascript
// frontend/src/app/courses/[id]/page.tsx:381-455
async function fetchConceptsForDocuments(docs: Document[]) {
  // For each document, fetch sections
  const masteryUrl = doc.chapter
    ? `/api/concepts/mastery?document_id=${doc.id}&chapter=${encodeURIComponent(doc.chapter)}`
    : `/api/concepts/mastery?document_id=${doc.id}`;

  // ...then merge all concepts from the same chapter
  const chapterKey = doc.chapter || 'Uncategorized';
  conceptsMap[result.chapterKey].push(concept);
}
```

### Architectural Issue
The problem is that tier 1 treats **chapter as the primary unit**, with documents as sources. This means:
- Chapter 3 is a single "learning session"
- Multiple documents contribute sections to the same session
- Sections get mixed together without clear document boundaries

### Proposed Solution

#### Option A: Document-Based Sessions (Recommended)
Each document becomes its own "study session" that can be **grouped** into a chapter, but maintains separation:

```
Chapter 3
├── Session 1: chapter_3.pdf (Source: Textbook)
│   ├── Section 3.1: Introduction
│   └── Section 3.2: Theory
└── Session 2: lecture_3.pdf (Source: Lecture Notes)
    ├── Section 3.1: Overview
    └── Section 3.2: Examples
```

**Changes Required:**
1. Add `session_id` or use `document_id` as the session identifier
2. Display documents as separate collapsible sections in the UI
3. Each document shows its own MasteryGrid
4. Chapter becomes a grouping/filter, not the primary unit

**Database Changes:**
```sql
-- Add session_name to sections table
ALTER TABLE sections ADD COLUMN session_name VARCHAR(255);
-- This would be the document title

-- Concepts already have document_id, so they're already tied to documents
```

**UI Changes:**
```tsx
// Show documents as separate sessions
{documentsByChapter[chapter].map(doc => (
  <Card key={doc.id}>
    <h4>{doc.title} ({doc.material_type})</h4>
    <MasteryGrid
      title={`${doc.title} - Concept Progress`}
      skills={getConceptsForDocument(doc.id)}
    />
  </Card>
))}
```

#### Option B: Clear Source Labels (Quick Fix)
Keep the current architecture but add visual indicators showing which document each section came from:

```tsx
// In section display
<div className="section-header">
  <h3>Section 3.1: Introduction</h3>
  <Badge>Source: chapter_3.pdf</Badge>
</div>
```

This doesn't fix the mixing issue but makes it clearer to users which content came from where.

---

## Tier 2 Design (Source Extraction + Synthesis Model)

Tier 2 has a fundamentally **different paradigm** from tier 1:

### Tier 2 Architecture
```
1. EXTRACTION PHASE (Upload & Auto-detect)
   Documents (Sources):
   ├── textbook.pdf (multi-chapter)
   │   ├── Chapter 1: Introduction [markdown extracted]
   │   ├── Chapter 2: Theory [markdown extracted]
   │   └── Chapter 3: Applications [markdown extracted]
   └── lecture_notes.pdf (multi-chapter)
       ├── Chapter 1: Overview [markdown extracted]
       ├── Chapter 2: Examples [markdown extracted]
       └── Chapter 3: Practice [markdown extracted]

2. SYNTHESIS PHASE (User generates study session)
   Study Session for Chapter 2:
   ├── Source 1: textbook.pdf Chapter 2 (pages 20-40)
   ├── Source 2: lecture_notes.pdf Chapter 2 (pages 10-25)
   └── [LLM synthesizes unified lesson from both sources]
```

### Key Differences

**Tier 1:** `Document = Study Session` (1:1 mapping)
- Upload `chapter_3.pdf` → Generates Section 3.1, 3.2, 3.3 → Study those sections
- Each document is self-contained

**Tier 2:** `Chapter (synthesized from sources) = Study Session` (N:1 mapping)
- Upload multiple textbooks/notes → Extract all chapters as markdown sources
- User picks Chapter 3 to study
- System synthesizes content from:
  - Part of textbook.pdf Chapter 3
  - Part of lecture_notes.pdf Chapter 3
  - Entirety of another document's Chapter 3
  - etc.
- Creates unified study experience

### Current Tier 2 Implementation Status

**Phase 1 (Completed):** Source Extraction
- ✅ Multi-chapter PDF detection
- ✅ Chapter-by-chapter markdown extraction
- ✅ Storage in `chapter_markdown` table (one row per chapter per document)
- ✅ Display sources with "View Markdown" for testing

**Phase 2 (TODO):** Synthesis & Study Session Generation
- ⬜ User selects a chapter to study
- ⬜ System finds all sources for that chapter
- ⬜ LLM synthesizes sources into unified lesson with:
  - Combined concepts
  - Integrated examples from multiple sources
  - Cross-referenced explanations
  - Practice problems from all sources
- ⬜ Generate study session (like tier 1 sections, but synthesized)

---

## Recommendations

### Immediate Actions

1. **For Testing Tier 2 Phase 1 (Source Extraction):**
   - Upgrade your test user to tier2 using the upgrade endpoint
   - Upload a multi-chapter PDF
   - Verify chapter detection and markdown extraction works
   - Check "View Markdown" shows extracted content

2. **For Tier 1 Architecture Fix:**
   - **Short term:** Add source labels showing which document each section came from
   - **Long term:** Refactor to document-based sessions (see Option A above)

### Long Term Architecture Plan

#### Tier Comparison Table

| Tier | Upload Model | Study Unit | Source Handling |
|------|-------------|-----------|-----------------|
| **Free** | Single document, single chapter | Document = Session | One source only |
| **Tier 1** | Multiple documents, single chapter each | Document = Session | Each doc is separate session |
| **Tier 2** | Multiple documents, multi-chapter | Chapter = Session (synthesized) | Multiple sources → unified lesson |

#### Implementation Roadmap

**Phase 1: Fix Tier 1 (Document-Based Sessions)**
```
Current Problem:
  Chapter 3
  ├── chapter_3.pdf sections (3.1, 3.2) ┐
  └── lecture_3.pdf sections (3.1, 3.2) ┴─ Mixed together!

Desired Behavior:
  Chapter 3
  ├── Session 1: chapter_3.pdf
  │   └── Sections: 3.1, 3.2, 3.3
  └── Session 2: lecture_3.pdf
      └── Sections: 3.1, 3.2
```

**Changes Required:**
1. UI: Display each document as collapsible section with its own MasteryGrid
2. Backend: Already works correctly (sections have document_id)
3. Frontend: Stop merging sections from different documents

**Phase 2: Tier 2 Synthesis (Future)**
```
User Flow:
1. Upload multiple textbooks → All chapters extracted as sources
2. Click "Study Chapter 3"
3. Backend finds all Chapter 3 sources:
   - textbook.pdf Chapter 3 (markdown)
   - lecture_notes.pdf Chapter 3 (markdown)
   - practice_problems.pdf Chapter 3 (markdown)
4. LLM synthesizes unified lesson:
   - Combines concepts from all sources
   - Integrates examples
   - Creates cohesive narrative
5. Generates study session with sections/concepts
6. User studies synthesized content
```

**Implementation for Phase 2:**
- New endpoint: `POST /tier2/synthesize-chapter`
- Input: `course_id`, `chapter_number`
- Fetches all `chapter_markdown` rows for that chapter
- Sends to LLM: "Synthesize these sources into a unified lesson..."
- Generates sections + concepts (like tier 1, but from multiple sources)
- Stores in same tables as tier 1 (but with synthesis metadata)

---

## Summary

**Key Insight:** Tier 1 and Tier 2 have fundamentally different models:

- **Tier 1:** Document-centric (each document is a self-contained study session)
- **Tier 2:** Chapter-centric with synthesis (multiple document sources → unified chapter lesson)

**Immediate Fix:** Tier 1 needs document-based sessions to stop mixing sections from different documents.

**Future Work:** Tier 2 needs synthesis phase to combine multiple sources into unified study sessions per chapter.
