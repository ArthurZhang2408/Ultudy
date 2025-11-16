# Ultudy Codebase - Deprecated & Unused Code Analysis

**Analysis Date:** November 16, 2025  
**Repository:** /home/user/Ultudy  
**Current Branch:** claude/cleanup-codebase-013npKUzUTKwCWSr5tWSe3Pe

---

## Executive Summary

The codebase has significant technical debt from multiple migration phases (Python extraction → Enhanced extraction → LLM vision-based extraction). This analysis identifies **HIGH priority issues** requiring immediate cleanup, **MEDIUM priority code quality improvements**, and **LOW priority optimizations**.

**Total Issues Found:** 24  
- **Critical/High:** 8
- **Medium:** 10  
- **Low:** 6

---

## 1. UNUSED IMPORTS & DEAD CODE (HIGH PRIORITY)

### 1.1 Unused Import in `/backend/src/routes/upload.js`
**Severity:** HIGH  
**File:** `/home/user/Ultudy/backend/src/routes/upload.js` (Line 8)

```javascript
import { extractStructuredSections } from '../ingestion/llm_extractor.js';
```

**Issue:** This import is defined but never used in the file. The function is only used in the upload processor job handler, not in the route handler.

**Status:** Actively maintained (`extractStructuredSections` is used in `/home/user/Ultudy/backend/src/jobs/processors/upload.processor.js`)

**Action:** Remove the unused import from `upload.js` (it's only needed in the job processor).

---

## 2. DEPRECATED/LEGACY ENDPOINTS (HIGH PRIORITY)

### 2.1 Old PDF Upload Endpoint
**Severity:** HIGH  
**File:** `/home/user/Ultudy/backend/src/routes/upload.js` (Line 26-45)

```javascript
// OLD ENDPOINT: Keep for backwards compatibility
router.post('/pdf', upload.single('file'), async (req, res) => {
  // ... old ingestion logic
});
```

**Issue:**
- Marked as deprecated but still in codebase
- Different from new `/pdf-structured` endpoint
- Old endpoint uses `createPdfIngestionService` with simple text extraction
- New endpoint uses `extractStructuredSections` with LLM vision-based extraction
- Both routes coexist in same file

**Impact:** Creates API versioning confusion. Clients might use either endpoint leading to inconsistent behavior.

**Action:** Either fully deprecate and remove, or document as legacy with clear migration path.

---

### 2.2 Old Sections Generation Endpoint
**Severity:** HIGH  
**File:** `/home/user/Ultudy/backend/src/routes/study.js` (Lines referenced in search results)

```javascript
// Note: /sections/generate is for OLD python-based extraction
// NEW vision-based extraction creates sections directly during upload
router.post('/sections/generate', async (req, res) => {
  // ...
});
```

**Issue:**
- Explicitly marked as handling "OLD python-based extraction"
- Modern flow now creates sections during upload (via LLM vision)
- This endpoint exists as fallback for old documents
- Creates duplicate logic for section generation

**Affected Documents:** Only documents with `full_text` from old Python extraction

**Action:** Consider deprecating once all documents are regenerated with new extraction method.

---

## 3. UNUSED DATABASE TABLE (HIGH PRIORITY)

### 3.1 problem_types Table (Never Used)
**Severity:** HIGH  
**Created in Migration:** `20251104000000_mvp_v1_schema.cjs`

```sql
-- Created with 4 RLS policies and indexes
CREATE TABLE problem_types (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  name varchar(500) NOT NULL,
  chapter varchar(100),
  related_concepts uuid[],
  mastery_state varchar(50),
  total_attempts integer,
  correct_attempts integer,
  consecutive_correct integer,
  last_practiced_at timestamp,
  created_at timestamp,
  updated_at timestamp
);
```

**Usage Search Results:** 0 references in codebase  
**Storage Cost:** Real PostgreSQL storage + 2 indexes  
**RLS Overhead:** 4 row-level security policies defined but never enforced

**Action:** Either implement problem_types functionality or remove the table and its 4 RLS policies in a rollback migration.

---

## 4. MULTIPLE PDF EXTRACTION IMPLEMENTATIONS (MEDIUM PRIORITY)

### 4.1 Three Extraction Methods in Parallel
**Severity:** MEDIUM  
**Files Involved:**
- `/home/user/Ultudy/backend/src/ingestion/extractor.js` - Main extractor with mode selection
- `/home/user/Ultudy/backend/src/ingestion/extractor-enhanced.js` - Deterministic extraction with markdown
- `/home/user/Ultudy/backend/src/ingestion/llm_extractor.js` - LLM vision-based extraction
- `/home/user/Ultudy/backend/scripts/extract_text.py` - Python text extraction
- `/home/user/Ultudy/backend/scripts/extract_text_deterministic.py` - Python deterministic extraction

**Extraction Modes:**

| Mode | Implementation | Status | Use Case |
|------|---|---|---|
| `auto` | Tries Python, falls back to pdf-parse | Legacy | Dev/testing |
| `standard` | Uses pdf-parse directly | Legacy | Fallback |
| `enhanced` | Deterministic Python extraction | Active | Rich content (tables, formulas) |
| Vision-based | LLM vision model (Gemini) | NEW/ACTIVE | Modern uploads |

**Environment Variable:** `PDF_EXTRACTION_MODE=enhanced` (in example .env)

**Issue:**
- Four separate extraction implementations
- Unclear which is preferred for new documents
- Maintenance burden across multiple extractors
- Configuration is unclear (modes not well documented)

**Recommendation:**
1. Vision-based extraction is used for all NEW uploads (recommended path)
2. `enhanced` mode used as fallback for documents without sections
3. `auto` and `standard` modes are legacy and unused in production

---

## 5. EMBEDDINGS INFRASTRUCTURE - OPTIONAL/DISABLED (MEDIUM PRIORITY)

### 5.1 Embeddings System Marked As Optional
**Severity:** MEDIUM  
**Files:**
- `/home/user/Ultudy/backend/src/ingestion/service.js` (Lines 111-134)
- `/home/user/Ultudy/backend/src/search/service.js`
- `backend/.env.example` (Line 33: `SKIP_EMBEDDINGS=true`)

**Code:**
```javascript
// MVP v1.0: Embeddings are optional now (only needed for legacy RAG search)
// Set SKIP_EMBEDDINGS=true to avoid Gemini quota issues on upload
const skipEmbeddings = process.env.SKIP_EMBEDDINGS === 'true';

if (!skipEmbeddings) {
  chunks = chunker(pages);
  // ... embedding generation code
}
```

**Issues:**
1. **Embeddings are skipped by default** (`SKIP_EMBEDDINGS=true`)
2. **Chunks table still created** but not populated when embeddings skipped
3. **RAG search depends on chunks/embeddings** - becomes non-functional when skipped
4. **Vector search endpoint exists** but returns empty results
5. README still references embeddings as core feature (outdated documentation)

**Impact:** 
- Legacy RAG-based search (`/search?q=...`) doesn't work with default settings
- Lesson generation now uses full-context instead of chunk-based retrieval
- Search service code exists but is not used in happy path

---

## 6. UNUSED/ORPHANED SCRIPTS (MEDIUM PRIORITY)

### 6.1 Demo and Test Scripts (Never Imported)
**Severity:** MEDIUM  
**Files in `/home/user/Ultudy/backend/scripts/`:**

```
demo_improvements.sh (executable)
demo_phase3.py (executable)  
show_improvements.py (executable)
test_layout_simple.py (executable)
test_positioning.py (executable)
test_rich_extraction.sh (executable)
compare_extraction.py
```

**Status:** 0 references in application code  
**Purpose:** Development/testing scripts from earlier phases

**Action:** Move to `/docs/scripts/` or create dedicated `/scripts/archived/` folder with documentation.

---

### 6.2 Unused Python Extraction Scripts
**Severity:** MEDIUM  
**Scripts:**

| Script | Purpose | Used | Current Mode |
|--------|---------|------|---|
| `extract_text.py` | Basic text extraction | YES (legacy) | `auto` mode fallback |
| `extract_text_vision.py` | Vision-based extraction | NO | Superseded by LLM |
| `extract_text_deterministic.py` | Deterministic extraction | YES | `enhanced` mode |
| `markdown_converter.py` | Markdown conversion | YES (implicit) | Part of enhanced |
| `postprocessor.py` | Post-processing | YES (implicit) | Part of enhanced |
| `layout_analyzer.py` | Layout analysis | YES (implicit) | Part of enhanced |

**Unused:** `extract_text_vision.py` (not called anywhere)

---

## 7. UTILITY SCRIPTS (MEDIUM PRIORITY)

### 7.1 Database Utility Scripts
**Severity:** MEDIUM  
**Files:**
- `/home/user/Ultudy/backend/delete-sections.js` - Manual section deletion (for regeneration)
- `/home/user/Ultudy/backend/scripts/clear-cached-lessons.js` - Redis cache clearing
- `/home/user/Ultudy/backend/scripts/check-ivfflat-support.js` - pgvector index checking
- `/home/user/Ultudy/backend/scripts/create-jobs-table.js` - Migration helper
- `/home/user/Ultudy/backend/scripts/setup-jobs-table*.js` - Multiple migration approaches

**Issue:** Multiple approaches to same problem (jobs table setup has 3 files)

**Action:** Consolidate into single, well-documented migration.

---

## 8. DUPLICATED IMPORTS IN FRONTEND API ROUTES (LOW PRIORITY)

### 8.1 Repeated Helper Imports
**Severity:** LOW  
**Pattern:** Multiple frontend routes import same utilities with different relative paths

```javascript
// In different files:
import { createProxyResponse } from '../../../_utils/proxy-response';
import { createProxyResponse } from '../../_utils/proxy-response';
import { createProxyResponse } from '../_utils/proxy-response';
```

**Root Cause:** Nested API route structure requires different relative paths

**Impact:** Not a bug, but suggests utility functions could be re-exported from central location

**Recommendation:** Create `/frontend/src/app/api/index.ts` that re-exports common utilities

---

## 9. SECTION FALLBACK EXTRACTION LOGIC (LOW PRIORITY)

### 9.1 Complex Extraction Fallback Chain
**Severity:** LOW  
**File:** `/home/user/Ultudy/backend/src/jobs/processors/lesson.processor.js` (Lines 140-160)

```javascript
if (sectionData.markdown_text) {
  textToProcess = sectionData.markdown_text;
} else {
  // Fallback: try to extract from full_text
  if (document.full_text) {
    // Use extractSectionText with complex logic
    textToProcess = extractSectionText(...);
  }
}
```

**Issue:**
- Handles case where section has no `markdown_text` but document has `full_text`
- This case shouldn't exist in modern uploads (they have markdown_text)
- Only affects documents from old Python extraction pipeline

**Impact:** Technical debt - fallback code maintains compatibility with legacy data

---

## 10. CONFIGURATION & DOCUMENTATION MISMATCHES (LOW PRIORITY)

### 10.1 README.md Outdated
**Severity:** LOW  
**File:** `/home/user/Ultudy/README.md` (Lines 1-30)

```markdown
STATUS: PARTIALLY OUTDATED - This README describes the original RAG-based architecture
Current implementation uses:
- LLM vision-based PDF extraction (not chunking/embeddings)
- Full-context lesson generation (not RAG retrieval)
```

**Documented Legacy Features Still in README:**
- pgvector embeddings (marked as NO LONGER USED)
- Chunk-based RAG search (marked as NO LONGER USED)
- `npm run check:pgvector` (still listed as useful)

**Action:** Create comprehensive `CURRENT_ARCHITECTURE.md` and clean up README

---

## 11. UNUSED COLUMNS IN DATABASE (LOW PRIORITY)

### 11.1 chunks Table - Used But Sparse
**Severity:** LOW  
**Issue:** Chunks table created and populated by code (when `SKIP_EMBEDDINGS=false`), but:
- Not used in lesson generation (uses full_text instead)
- Search endpoint exists but disabled by default
- Indexed by `document_id` and `embedding` for pgvector search

**Status:** 
- Code exists to populate it
- Default configuration skips it (`SKIP_EMBEDDINGS=true`)
- Takes up storage space if populated

---

## 12. JOB PROCESSOR UNUSED IMPORT (LOW PRIORITY)

### 12.1 Potential Unused in Lesson Processor
**Severity:** LOW  
**File:** `/home/user/Ultudy/backend/src/jobs/processors/lesson.processor.js` (Line 7)

```javascript
import { extractSectionText } from '../../study/section.service.js';
```

**Usage:** Only called when section has no `markdown_text` (legacy fallback)

**Impact:** Import is used but only in edge case (legacy data path)

---

## Summary by Category

### CRITICAL - Immediate Action Required
1. **Unused import in upload.js** - Remove `extractStructuredSections`
2. **Unused problem_types table** - Decision needed: implement or remove
3. **Unused problem_types RLS policies** (4 policies)
4. **SKIP_EMBEDDINGS=true by default** - Disables search functionality silently

### HIGH - Should Be Addressed Soon
1. **Deprecated /pdf endpoint** - Document or remove
2. **Deprecated /sections/generate endpoint** - Mark for removal
3. **Multiple PDF extractors** - Clarify architecture

### MEDIUM - Code Quality Improvements
1. **Unused Python scripts** - Archive or document
2. **Multiple database setup scripts** - Consolidate
3. **Embeddings optional but code present** - Clarify intent

### LOW - Technical Debt
1. **Legacy fallback extraction logic** - Maintain for compatibility
2. **Duplicated imports in frontend** - Could consolidate
3. **Outdated documentation** - Update README

---

## Recommendations by Priority

### Phase 1 (Do First)
- [ ] Remove unused `extractStructuredSections` import from `upload.js`
- [ ] Document or implement `problem_types` table usage
- [ ] Remove `problem_types` RLS policies if table unused
- [ ] Document current PDF extraction architecture

### Phase 2 (Do This Sprint)
- [ ] Mark deprecated endpoints with 410 Gone responses
- [ ] Create migration plan for `/sections/generate`
- [ ] Consolidate database setup scripts
- [ ] Archive demo/test scripts

### Phase 3 (Future Cleanup)
- [ ] Decide: Keep RAG search or remove completely?
- [ ] Consolidate PDF extraction (choose one primary method)
- [ ] Update documentation to match current architecture
- [ ] Create database cleanup task for old documents

---

## Files to Review/Action

### Need Immediate Changes
- `/home/user/Ultudy/backend/src/routes/upload.js` - Remove unused import (line 8)
- `/home/user/Ultudy/backend/db/migrations/20251104000000_mvp_v1_schema.cjs` - Review problem_types table

### Need Documentation/Decisions  
- `/home/user/Ultudy/backend/src/ingestion/` - PDF extraction architecture decision
- `/home/user/Ultudy/backend/src/routes/study.js` - Deprecation plan for sections/generate
- `/home/user/Ultudy/backend/src/routes/upload.js` - Deprecation plan for /pdf endpoint

### Archived Files (Move to docs/)
- All files in `/home/user/Ultudy/backend/scripts/` starting with `demo_`, `show_`, `test_`, `compare_`

---

## Appendix: Code References

### Extraction Mode Documentation
Current `.env.example` shows:
```
PDF_EXTRACTION_MODE=enhanced
SKIP_EMBEDDINGS=true
```

But code supports multiple modes:
- `auto` (try Python, fallback to pdf-parse)
- `standard` (pdf-parse only)
- `enhanced` (Python deterministic with markdown)
- Vision-based (LLM, used directly in upload processor)

### Database Migration Chain
1. `20240712120000_init.cjs` - Initial schema
2. `20251101000000_add_owner_to_documents.cjs` - Add owner_id
3. `20251103000000_enable_rls.cjs` - Enable RLS
4. `20251103070000_change_owner_id_to_text.cjs` - Change data type
5. `20251104000000_mvp_v1_schema.cjs` - Add concepts, problem_types, study_sessions
6. `20251104010000_add_courses_table.cjs` - Add courses
7. `20251104020000_add_lessons_table.cjs` - Add lessons
8. `20251105000000_add_sections_table.cjs` - Add sections
9. Latest migrations - Add indexes, markdown_text, concept tracking

