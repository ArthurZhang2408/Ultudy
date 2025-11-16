# Ultudy - Current Architecture (Nov 2025)

**Status:** ✅ **CURRENT** - This document reflects the production architecture as of November 2025

**See also:**
- `CODE_ANALYSIS_REPORT.md` - Technical debt analysis
- `CLEANUP_CHECKLIST.md` - Ongoing refactoring tasks
- `PRODUCT_VISION.md` - Feature roadmap
- `ASYNC_OPERATIONS.md` - Job queue design

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Core Architecture Patterns](#core-architecture-patterns)
4. [PDF Processing Pipeline](#pdf-processing-pipeline)
5. [Learning Content Generation](#learning-content-generation)
6. [Data Model](#data-model)
7. [API Structure](#api-structure)
8. [Authentication & Multi-Tenancy](#authentication--multi-tenancy)
9. [Async Job Processing](#async-job-processing)
10. [What Changed (vs Old README)](#what-changed-vs-old-readme)

---

## System Overview

Ultudy is an AI-powered learning platform that:
1. **Ingests** educational PDFs using LLM vision-based extraction
2. **Structures** content into courses, documents, sections, and concepts
3. **Generates** personalized lessons and practice questions
4. **Tracks** mastery progress through check-ins and study sessions

### Architecture Type
- **Monorepo** with separate frontend/backend
- **Client-Server** with REST API
- **Event-Driven** with async job processing (Bull + Redis)
- **Multi-Tenant** with PostgreSQL Row-Level Security (RLS)

---

## Technology Stack

### Frontend
```
Next.js 14.2.25 (App Router)
├── React 18.3.1
├── TypeScript 5.4.5
├── Tailwind CSS 3.4.4
├── Clerk (Authentication)
└── react-markdown (Content rendering)
```

### Backend
```
Node.js 20+ (ES Modules)
├── Express.js 4.19.2 (REST API)
├── PostgreSQL 16 + pgvector (Database)
├── Bull 4.16.5 (Job Queue)
├── Redis 5.9.0 (Queue Broker + Cache)
├── Google Gemini API (LLM + Embeddings)
└── OpenAI (Fallback LLM)
```

### Infrastructure
- **Docker Compose** for local development
- **GitHub Actions** for CI/CD
- **Migrations** via node-pg-migrate

---

## Core Architecture Patterns

### 1. Vision-Based Document Understanding (PRIMARY PATH)

**Modern Upload Flow:**
```
User uploads PDF
    ↓
Frontend: POST /api/upload → Backend: POST /upload/pdf-structured
    ↓
Create job + save PDF to storage
    ↓
Return job_id immediately (async)
    ↓
Bull Queue processes in background
    ↓
Gemini Vision API extracts structured content:
    - Document metadata
    - Sections (with boundaries)
    - Concepts (key topics)
    - Markdown-formatted text
    ↓
Save to database (documents, sections, concepts tables)
    ↓
Job completes → Frontend polls for status
```

**Key Point:** Vision-based extraction creates the full document structure in ONE STEP. No separate section generation needed.

### 2. Legacy Text-Based Extraction (DEPRECATED)

**Old Upload Flow** (still exists for backwards compatibility):
```
POST /upload/pdf (DEPRECATED)
    ↓
Extract plain text (pdf-parse or Python)
    ↓
Save to documents.full_text
    ↓
Later: POST /sections/generate (DEPRECATED)
    ↓
Extract sections from full_text using TOC or LLM
```

**Status:** Deprecated but maintained for:
- Documents uploaded before Nov 2025
- Development/testing scenarios

### 3. Full-Context Lesson Generation (NO RAG)

**Modern Lesson Flow:**
```
User requests lesson for section
    ↓
Frontend: POST /api/lessons/generate
    ↓
Backend creates lesson generation job
    ↓
Job processor:
    1. Load section markdown_text (full context)
    2. Call Gemini with lesson generation prompt
    3. Parse structured response (markdown + check-ins)
    4. Cache result in Redis
    ↓
Return lesson content to frontend
```

**Key Point:** We use FULL section content, not RAG retrieval. Embeddings are optional.

### 4. Embeddings System (OPTIONAL)

**Current State:**
- **Default:** `SKIP_EMBEDDINGS=true` (disabled)
- **Use Case:** Legacy vector search only
- **Not Used For:** Lesson generation (uses full context)

**When Enabled** (`SKIP_EMBEDDINGS=false`):
```
During upload:
    ↓
Chunk document text
    ↓
Generate embeddings via Gemini
    ↓
Store in chunks table with pgvector
    ↓
Enable: GET /search?q=... (vector similarity search)
```

**Recommendation:** Keep disabled unless you need legacy search.

---

## PDF Processing Pipeline

### Primary: Vision-Based Extraction

**File:** `backend/src/jobs/processors/upload.processor.js`
**Function:** `extractStructuredSections()` from `llm_extractor.js`

**Process:**
1. **Vision Analysis**: Send PDF pages to Gemini Vision API
2. **Structured Extraction**: LLM returns JSON with:
   ```json
   {
     "sections": [
       {
         "section_number": 1,
         "name": "Introduction",
         "page_start": 1,
         "page_end": 5,
         "markdown_text": "# Introduction\n...",
         "concepts": ["topic1", "topic2"]
       }
     ]
   }
   ```
3. **Database Insertion**: Insert into `documents`, `sections`, `concepts` tables
4. **Concept Tracking**: Initialize mastery state for each concept

**Advantages:**
- ✅ Understands document structure semantically
- ✅ Extracts sections + concepts in one pass
- ✅ Preserves formatting (markdown)
- ✅ Works with complex layouts

**Disadvantages:**
- ⚠️ Costs ~$0.004/page (Gemini Vision pricing)
- ⚠️ Slower than text-only extraction (~1-2s/page)

### Fallback: Enhanced Deterministic Extraction

**File:** `backend/src/ingestion/extractor-enhanced.js`
**Used When:** `PDF_EXTRACTION_MODE=enhanced`

**Process:**
1. **Python Script**: `extract_text_deterministic.py`
2. **Structured Parsing**: Uses pdfplumber, PyMuPDF
3. **Rich Content**: Extracts tables, images, formulas, code blocks
4. **Output**: JSON with pages + structured elements

**Advantages:**
- ✅ Free (no API costs)
- ✅ Fast (~0.1-0.6s/page)
- ✅ Preserves tables and formulas

**Disadvantages:**
- ⚠️ Doesn't auto-generate sections (requires `/sections/generate` call)
- ⚠️ Less semantic understanding

### Legacy: Simple Text Extraction

**File:** `backend/src/ingestion/extractor.js` (mode: `auto` or `standard`)
**Status:** Legacy, rarely used

---

## Learning Content Generation

### Lesson Generation

**Endpoint:** `POST /lessons/generate`
**Processor:** `backend/src/jobs/processors/lesson.processor.js`

**Flow:**
```
1. Retrieve section data from database
2. Load section.markdown_text (full content)
3. Build lesson generation prompt:
   - Section content
   - Concepts to cover
   - Learning objectives
4. Call LLM (Gemini or OpenAI)
5. Parse response:
   - Main lesson content (markdown)
   - Check-ins (questions + answers)
6. Cache in Redis (key: lesson:{section_id}:{options_hash})
7. Store result in database
```

**Caching Strategy:**
- Cache key includes section_id + options (concepts, check-ins)
- TTL: 24 hours
- Manual clear: `node scripts/clear-cached-lessons.js`

### Check-In System

**Purpose:** Quick comprehension checks during lesson reading

**Flow:**
```
User clicks "Show Answer" in lesson
    ↓
Frontend: POST /api/check-ins/submit
    ↓
Backend:
    1. Evaluate answer (using LLM)
    2. Determine if correct/incorrect
    3. Update concept mastery state
    4. Return evaluation result
```

**Mastery States:**
- `not_learned` → `learning` → `proficient` → `mastered`
- Tracked per concept in `concepts` table

### MCQ Generation

**Endpoint:** `POST /practice/mcq`
**Purpose:** Generate multiple-choice practice questions

**Process:**
1. Load section content
2. Call LLM with MCQ generation prompt
3. Parse structured MCQ response
4. Return questions with options + correct answer

---

## Data Model

### Core Tables

```
users (managed by Clerk - external)
    ↓ owner_id
courses (user-created course containers)
    id, owner_id, name, code, term, exam_date
    ↓
documents (uploaded PDFs)
    id, owner_id, course_id, title, full_text (legacy), material_type, chapter
    ↓
sections (document subdivisions - auto-created by vision extraction)
    id, owner_id, document_id, course_id, section_number, name, markdown_text, concepts_generated
    ↓
concepts (key topics within sections)
    id, owner_id, section_id, name, mastery_state, total_attempts, correct_attempts
    ↓
check_ins (comprehension check results)
    id, owner_id, concept_id, question, answer, evaluation

study_sessions (learning activity tracking)
    id, owner_id, session_type, concepts_covered, duration, performance_score

lessons (cached lesson content)
    id, owner_id, section_id, content (markdown), metadata (check-ins, concepts)

jobs (async job tracking)
    id, owner_id, type, status, progress, result, error
```

### Legacy Tables (Unused)

```
chunks (pgvector embeddings) - Only populated when SKIP_EMBEDDINGS=false
problem_types (planned feature) - Never implemented
```

### Row-Level Security (RLS)

**All tables have:**
```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY <table>_isolation_policy ON <table>
  USING (owner_id = current_setting('app.user_id'));
```

**Enforcement:**
- Set in `withTenant(ownerId, callback)` helper
- PostgreSQL ensures isolation at database level
- Zero code-level filtering needed

---

## API Structure

### Frontend API Routes (Next.js `/app/api`)

**Purpose:** Proxy layer that:
1. Adds authentication (Clerk JWT → X-User-Id or Bearer token)
2. Forwards to backend Express server
3. Handles CORS and session management

**Example:**
```
POST /api/upload
    ↓ (Clerk session extraction)
POST http://localhost:3001/upload/pdf-structured
```

### Backend Routes (Express)

#### Upload Routes (`/upload`)
- **`POST /pdf`** [DEPRECATED] - Legacy text extraction
- **`POST /pdf-structured`** [ACTIVE] - Vision-based async upload

#### Study Routes (`/study.js`)
- **`POST /sections/generate`** [DEPRECATED] - Extract sections from full_text
- **`GET /sections`** - List sections for document
- **`POST /lessons/generate`** - Async lesson generation job
- **`GET /lessons`** - List cached lessons
- **`DELETE /lessons/:id`** - Clear cached lesson
- **`POST /practice/mcq`** - Generate practice questions
- **`POST /check-ins/submit`** - Submit check-in answer
- **`POST /study-sessions/start`** - Start study session
- **`POST /study-sessions/:id/complete`** - Complete study session
- **`GET /progress/overview`** - Get mastery progress

#### Course Routes (`/courses`)
- **`GET /courses`** - List user courses
- **`POST /courses`** - Create new course
- **`GET /courses/:id`** - Get course details
- **`PUT /courses/:id`** - Update course
- **`DELETE /courses/:id`** - Delete course

#### Document Routes (`/documents`)
- **`GET /documents`** - List user documents
- **`GET /documents/:id`** - Get document details
- **`DELETE /documents/:id`** - Delete document

#### Job Routes (`/jobs`)
- **`GET /jobs`** - List jobs
- **`GET /jobs/:id`** - Get job status

#### Search Routes (`/search`)
- **`GET /search?q=...`** - Vector similarity search (requires SKIP_EMBEDDINGS=false)

---

## Authentication & Multi-Tenancy

### Authentication Modes

**JWT Mode** (Production):
```env
AUTH_MODE=jwt
AUTH_JWT_ISS=https://your-clerk-domain.clerk.accounts.dev
AUTH_JWT_JWKS_URL=https://your-clerk-domain/.well-known/jwks.json
```

**Dev Mode** (Local development):
```env
AUTH_MODE=dev
```
Accepts `X-User-Id` header directly (no JWT validation).

### Tenant Isolation

**Middleware:** `backend/src/auth/middleware.js`

**Flow:**
```
1. Request arrives with Bearer token or X-User-Id
2. Middleware validates and extracts user_id
3. Set req.userId = user_id
4. All database queries use withTenant(userId, callback)
5. PostgreSQL RLS enforces isolation
```

**Database Helper:**
```javascript
import { withTenant } from '../db/tenant.js';

// Inside route handler:
const result = await withTenant(req.userId, async (client) => {
  // All queries here automatically filtered by owner_id
  const { rows } = await client.query(
    `SELECT * FROM documents WHERE id = $1`,
    [document_id]
  );
  return rows;
});
```

---

## Async Job Processing

### Architecture

**Queue:** Bull (backed by Redis)
**Workers:** Separate Node processes (can scale horizontally)

**Job Types:**
1. **`upload_pdf`** - PDF upload + vision extraction
2. **`generate_lesson`** - Lesson generation for section

### Job Flow

```
API creates job
    ↓
Store in jobs table (status: queued)
    ↓
Add to Bull queue
    ↓
Return job_id to frontend
    ↓
Frontend polls: GET /jobs/:id
    ↓
Worker picks up job
    ↓
Update status: queued → running
    ↓
Process job (PDF extraction or lesson generation)
    ↓
Update status: running → completed (or failed)
    ↓
Store result in jobs.result (JSON)
    ↓
Frontend receives result
```

### Job Tracking

**Table:** `jobs`
**Columns:**
- `status`: queued, running, completed, failed
- `progress`: 0-100 (percentage)
- `result`: JSON (final output)
- `error`: Error message if failed

### Testing

**CI/CD Mode:**
```env
DISABLE_QUEUES=true
```
Jobs run synchronously (no Redis required).

---

## What Changed (vs Old README)

### ❌ **Removed:** RAG-Based Architecture

**Old Approach:**
1. Chunk document text
2. Generate embeddings for each chunk
3. Store in pgvector
4. At lesson time: Retrieve relevant chunks via similarity search
5. Use chunks as context for LLM

**Problems:**
- Chunking loses structure
- Retrieval misses important context
- Complex and error-prone

**Current Approach:**
- Use full section.markdown_text (already structured by vision extraction)
- No chunking, no retrieval needed
- Simpler and more accurate

### ✅ **Added:** Vision-Based Extraction

**New Feature:** Gemini Vision API understands document structure

**Benefits:**
- Auto-generates sections
- Auto-identifies concepts
- Preserves formatting
- One-step process

### ⚠️ **Deprecated:** Text-Based Upload

**Old Endpoints:**
- `POST /upload/pdf` (simple text extraction)
- `POST /sections/generate` (extract sections from text)

**Status:**
- Still functional (backwards compatibility)
- Marked deprecated with HTTP headers
- Will be removed Dec 31, 2025

### 📦 **Optional:** Embeddings System

**Old:** Required for system to work
**New:** Optional feature for legacy search

**Configuration:**
```env
# Default (embeddings disabled)
SKIP_EMBEDDINGS=true

# Enable for vector search
SKIP_EMBEDDINGS=false
```

---

## Environment Configuration

### Required Variables

```env
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/study_app

# Authentication
AUTH_MODE=jwt
AUTH_JWT_ISS=https://your-clerk-domain.clerk.accounts.dev
AUTH_JWT_JWKS_URL=https://your-clerk-domain/.well-known/jwks.json

# LLM Provider
LLM_PROVIDER=gemini  # or openai or mock
GEMINI_API_KEY=your-key-here
GEMINI_GEN_MODEL=gemini-1.5-flash

# Redis (for job queue)
REDIS_URL=redis://localhost:6379
```

### Optional Variables

```env
# PDF Extraction (legacy modes)
PDF_EXTRACTION_MODE=enhanced  # auto, standard, enhanced

# Embeddings (legacy search)
SKIP_EMBEDDINGS=true  # Set to false to enable search
EMBEDDINGS_PROVIDER=gemini  # or mock
GEMINI_EMBED_MODEL=gemini-embedding-001

# OpenAI Fallback
OPENAI_API_KEY=your-key-here
```

---

## Quick Start

### 1. Setup Database

```bash
cd backend
npm run migrate up
```

### 2. Start Backend

```bash
cd backend
npm run dev  # Port 3001
```

### 3. Start Frontend

```bash
cd frontend
npm run dev  # Port 3000
```

### 4. Upload a PDF

```
1. Create a course at http://localhost:3000
2. Click "Upload Document"
3. Select PDF file
4. Wait for async processing (job queue)
5. View generated sections and concepts
```

### 5. Generate a Lesson

```
1. Navigate to a section
2. Click "Generate Lesson"
3. Wait for job completion
4. Read lesson with embedded check-ins
```

---

## Troubleshooting

### "Search returns empty results"

**Cause:** `SKIP_EMBEDDINGS=true` (default)

**Solution:** Either:
- Set `SKIP_EMBEDDINGS=false` and re-upload documents, OR
- Use full-context lesson generation instead (doesn't need search)

### "Vision extraction fails"

**Cause:** Missing or invalid `GEMINI_API_KEY`

**Solution:**
1. Get API key from https://aistudio.google.com/app/apikey
2. Set in `.env`: `GEMINI_API_KEY=your-key`
3. Verify quota: https://aistudio.google.com/app/apikey (check limits)

### "Jobs stuck in queued state"

**Cause:** Redis not running or worker not started

**Solution:**
```bash
# Check Redis
redis-cli ping  # Should return PONG

# Start worker (if not running)
cd backend
npm run dev  # Starts both server and worker
```

### "RLS policy violation"

**Cause:** `owner_id` mismatch or `withTenant()` not used

**Solution:**
- Ensure all database queries use `withTenant(userId, callback)`
- Check `req.userId` is set by auth middleware

---

## Testing

### Run Backend Tests

```bash
cd backend
npm test
```

**Note:** Tests use `DISABLE_QUEUES=true` for synchronous execution.

### Run Frontend Type Check

```bash
cd frontend
npm run typecheck
```

---

## Deployment Checklist

- [ ] Set `AUTH_MODE=jwt` (not dev)
- [ ] Configure Clerk JWKS URL
- [ ] Set production `GEMINI_API_KEY`
- [ ] Run database migrations
- [ ] Start Redis for job queue
- [ ] Set `SKIP_EMBEDDINGS=true` (unless search needed)
- [ ] Configure `DATABASE_URL` for production DB
- [ ] Set proper CORS origins in backend

---

## Performance Considerations

### Vision Extraction Costs

- **Gemini Vision:** ~$0.004/page
- **60-page document:** ~$0.24
- **100-page textbook:** ~$0.40

**Optimization:** Cache extracted content aggressively.

### Lesson Generation Costs

- **Gemini 1.5 Flash:** ~$0.01-0.05/lesson (depending on context size)
- **Caching:** Redis caches lessons for 24h
- **Recommendation:** Clear cache only when content changes

### Database Performance

- **RLS Overhead:** Minimal (~1-2ms per query)
- **Indexes:** All foreign keys and owner_id columns indexed
- **pgvector:** Only relevant if SKIP_EMBEDDINGS=false

---

## Future Improvements

See `CLEANUP_CHECKLIST.md` for planned refactoring:

**Phase 2 (In Progress):**
- Standardize UI components
- Improve LLM provider abstractions
- Job system enhancements

**Phase 3 (Planned):**
- Split large route files (study.js → separate routers)
- Consolidate PDF extraction (remove legacy modes)
- Database schema optimizations

---

## Contributing

See `CODE_ANALYSIS_REPORT.md` for technical debt analysis.

When making changes:
1. **Don't touch:** Database/tenant system, authentication middleware
2. **Safe to refactor:** UI components, provider abstractions, job system
3. **High risk:** Study routes, ingestion pipeline, core services

---

**Last Updated:** November 16, 2025
**Version:** 1.0 (Post-Vision-Extraction Migration)
