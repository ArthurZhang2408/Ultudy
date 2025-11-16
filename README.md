# Ultudy - AI-Powered Learning Platform

**Transform your educational PDFs into personalized learning experiences with AI.**

[![CI](https://github.com/ArthurZhang2408/Ultudy/workflows/CI/badge.svg)](https://github.com/ArthurZhang2408/Ultudy/actions)

Ultudy helps students learn more effectively by:
- 📚 **Understanding** course materials through AI-extracted concepts and sections
- 📝 **Generating** personalized lessons with embedded comprehension checks
- ✅ **Tracking** mastery progress across topics
- 🎯 **Practicing** with AI-generated multiple-choice questions

---

## Quick Links

- **[Current Architecture](./CURRENT_ARCHITECTURE.md)** - Complete technical documentation
- **[Product Vision](./PRODUCT_VISION.md)** - Feature roadmap and specifications
- **[Cleanup Status](./CLEANUP_CHECKLIST.md)** - Ongoing refactoring tasks
- **[Code Analysis](./CODE_ANALYSIS_REPORT.md)** - Technical debt report

---

## Technology Stack

### Frontend
- **Next.js 14** (App Router) + React 18 + TypeScript
- **Tailwind CSS** for styling
- **Clerk** for authentication
- **React Markdown** for lesson rendering

### Backend
- **Node.js 20+** with Express.js
- **PostgreSQL 16** with pgvector extension
- **Bull + Redis** for async job processing
- **Google Gemini** for AI (LLM + Vision API)

---

## Features

### 🎓 Smart Document Processing
- Upload PDFs and let AI extract structure automatically
- Vision-based extraction identifies sections and key concepts
- Preserves formatting and context

### 📖 Personalized Lesson Generation
- AI-generated lessons tailored to specific topics
- Embedded check-ins to verify comprehension
- Full-context understanding (no chunking/retrieval needed)

### 📊 Mastery Tracking
- Track progress across concepts
- Mastery states: Not Learned → Learning → Proficient → Mastered
- Performance analytics and study session history

### 🏫 Course Organization
- Group documents by course
- Track metadata (course code, term, exam dates)
- Browse by chapter or material type

---

## Getting Started

### Prerequisites

- **Node.js 20+**
- **PostgreSQL 16** (with pgvector extension)
- **Redis** (for job queue)
- **Google Gemini API key** (get from [AI Studio](https://aistudio.google.com/))

### 1. Database Setup

Start PostgreSQL with Docker Compose:

```bash
docker compose up -d db
```

Or use your own PostgreSQL 16 instance with pgvector:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set:
#   - DATABASE_URL
#   - GEMINI_API_KEY
#   - AUTH_MODE (jwt or dev)

# Run migrations
npm run migrate up

# Start development server
npm run dev
```

Backend runs on **http://localhost:3001**

Verify it's working:
```bash
curl http://localhost:3001/health
curl http://localhost:3001/db/health
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local and set Clerk keys (see CLERK_SETUP.md)

# Start development server
npm run dev
```

Frontend runs on **http://localhost:3000**

### 4. Redis Setup (for Job Queue)

```bash
# macOS with Homebrew
brew install redis
brew services start redis

# Or with Docker
docker run -d -p 6379:6379 redis:latest

# Verify
redis-cli ping  # Should return PONG
```

---

## Usage

### Upload a PDF

1. **Create a course** (optional but recommended)
2. **Click "Upload Document"**
3. Select a PDF file
4. Add metadata (title, chapter, material type)
5. Wait for async processing to complete

The system will:
- Extract text with vision AI
- Identify sections and concepts
- Store structured content in database

### Generate a Lesson

1. **Navigate to a document**
2. **Select a section**
3. **Click "Generate Lesson"**
4. Wait for AI to create personalized content
5. Read lesson with embedded check-ins

### Practice with MCQs

1. **Select a topic or section**
2. **Click "Practice"**
3. Answer AI-generated multiple-choice questions
4. Receive instant feedback with explanations

### Track Your Progress

1. **View mastery grid** on course page
2. **Check concept progress** (color-coded by mastery level)
3. **Review study session history**

---

## API Endpoints

### Upload & Documents

```bash
# Upload PDF (async, returns job_id)
POST /upload/pdf-structured
Content-Type: multipart/form-data

# Check job status
GET /jobs/:job_id

# List documents
GET /documents

# Get document details
GET /documents/:id
```

### Lessons & Study

```bash
# Generate lesson (async)
POST /lessons/generate
Body: { section_id, concepts, num_check_ins }

# Get cached lesson
GET /lessons/:id

# Submit check-in answer
POST /check-ins/submit
Body: { concept_id, question, answer }

# Generate MCQs
POST /practice/mcq
Body: { section_id, num_questions, difficulty }
```

### Courses & Progress

```bash
# List courses
GET /courses

# Create course
POST /courses
Body: { name, code, term, exam_date }

# Get mastery overview
GET /progress/overview?course_id=...
```

See **[CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md)** for complete API documentation.

---

## Authentication

### Development Mode (Default)

```env
AUTH_MODE=dev
```

Use `X-User-Id` header:

```bash
curl -H "X-User-Id: dev-user-001" http://localhost:3001/documents
```

### Production Mode (Clerk JWT)

```env
AUTH_MODE=jwt
AUTH_JWT_ISS=https://your-clerk-domain.clerk.accounts.dev
AUTH_JWT_JWKS_URL=https://your-clerk-domain/.well-known/jwks.json
```

Use Bearer token:

```bash
curl -H "Authorization: Bearer <jwt-token>" http://localhost:3001/documents
```

See **[CLERK_SETUP.md](./CLERK_SETUP.md)** for detailed setup instructions.

---

## Configuration

### Environment Variables

**Required:**

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/study_app

# LLM Provider
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
GEMINI_GEN_MODEL=gemini-1.5-flash

# Authentication (production)
AUTH_MODE=jwt
AUTH_JWT_ISS=https://your-clerk-domain.clerk.accounts.dev
AUTH_JWT_JWKS_URL=https://your-clerk-domain/.well-known/jwks.json

# Redis (job queue)
REDIS_URL=redis://localhost:6379
```

**Optional:**

```env
# PDF Extraction (legacy)
PDF_EXTRACTION_MODE=enhanced

# Embeddings (for vector search - optional)
SKIP_EMBEDDINGS=true  # Set to false to enable search
EMBEDDINGS_PROVIDER=gemini
```

---

## Architecture Highlights

### Vision-Based Document Processing

Modern upload flow uses **Gemini Vision API** to understand document structure:

```
Upload PDF → Save to storage → Create job
    ↓
Vision API analyzes pages
    ↓
Extract: sections, concepts, markdown text
    ↓
Save to database
    ↓
Job complete → User can generate lessons
```

### Full-Context Lesson Generation

Lessons use **full section content** (no RAG retrieval):

```
Request lesson → Load section.markdown_text
    ↓
Send to Gemini with prompt
    ↓
Parse structured response (content + check-ins)
    ↓
Cache in Redis → Return to user
```

### Multi-Tenant Isolation

**PostgreSQL Row-Level Security (RLS)** enforces tenant isolation:

```javascript
// All queries automatically filtered by owner_id
await withTenant(userId, async (client) => {
  const { rows } = await client.query(
    `SELECT * FROM documents WHERE id = $1`,
    [document_id]
  );
  return rows;
});
```

### Async Job Processing

**Bull queues** handle long-running tasks:

- PDF upload + vision extraction
- Lesson generation
- Batch operations

Jobs are tracked in database, frontend polls for status.

---

## Testing

### Backend Tests

```bash
cd backend
npm test
```

Tests run with `DISABLE_QUEUES=true` for synchronous execution.

### Frontend Type Check

```bash
cd frontend
npm run typecheck
npm run build
```

### CI/CD

GitHub Actions runs:
- Backend tests with PostgreSQL service
- Frontend type checking and build
- Code quality checks

---

## Project Structure

```
/Ultudy
├── frontend/               # Next.js 14 app
│   ├── src/app/           # App Router pages
│   ├── src/components/    # React components
│   └── src/lib/           # Utilities and API client
├── backend/               # Express.js server
│   ├── src/routes/        # API endpoints
│   ├── src/ingestion/     # PDF processing
│   ├── src/study/         # Lesson generation
│   ├── src/jobs/          # Job queue processors
│   ├── src/providers/     # LLM/embeddings abstractions
│   └── db/migrations/     # Database schema versions
├── docs/                  # Documentation
│   └── archived-scripts/  # Deprecated utility scripts
└── docker-compose.yml     # PostgreSQL + Redis
```

---

## Common Issues

### "Search returns empty results"

**Cause:** Embeddings disabled by default (`SKIP_EMBEDDINGS=true`)

**Solution:** Modern lesson generation doesn't need search. If you need vector search:
```env
SKIP_EMBEDDINGS=false
```
Then re-upload documents.

### "Vision extraction fails"

**Cause:** Missing or invalid `GEMINI_API_KEY`

**Solution:**
1. Get API key from https://aistudio.google.com/app/apikey
2. Add to `.env`: `GEMINI_API_KEY=your-key`
3. Check quota limits on AI Studio dashboard

### "Jobs stuck in queued state"

**Cause:** Redis not running

**Solution:**
```bash
# Start Redis
redis-cli ping  # Should return PONG

# Or start with Docker
docker run -d -p 6379:6379 redis:latest
```

### "RLS policy violation"

**Cause:** Not using `withTenant()` wrapper

**Solution:** All database queries must use:
```javascript
import { withTenant } from '../db/tenant.js';

const result = await withTenant(req.userId, async (client) => {
  // Your queries here
});
```

---

## Performance

### Cost Estimates

**Vision Extraction:**
- ~$0.004/page (Gemini Vision)
- 60-page PDF = ~$0.24
- 100-page textbook = ~$0.40

**Lesson Generation:**
- ~$0.01-0.05/lesson (Gemini 1.5 Flash)
- Cached for 24 hours

**Optimization:**
- Aggressive caching (Redis)
- Async processing (Bull queues)
- Full-context (no retrieval overhead)

---

## Contributing

### Development Workflow

1. Create feature branch
2. Make changes
3. Run tests: `npm test`
4. Type check: `npm run typecheck`
5. Create pull request

### Code Quality

See **[CODE_ANALYSIS_REPORT.md](./CODE_ANALYSIS_REPORT.md)** for:
- Technical debt analysis
- Refactoring priorities
- Safe vs risky areas

**Safe to modify:**
- UI components
- Provider abstractions
- Job processors
- Admin utilities

**High risk (avoid for now):**
- Database/tenant system
- Authentication middleware
- Core study routes

---

## Roadmap

### ✅ Completed (v1.0)
- Vision-based PDF extraction
- Full-context lesson generation
- Mastery tracking system
- Course organization
- Async job processing
- Multi-tenant RLS

### 🚧 In Progress (v1.1)
- UI component standardization
- LLM provider improvements
- Documentation cleanup
- Performance optimizations

### 📋 Planned (v2.0)
- Spaced repetition system
- Advanced analytics
- Mobile app
- Collaborative features

See **[PRODUCT_VISION.md](./PRODUCT_VISION.md)** for detailed roadmap.

---

## Documentation

- **[CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md)** - Technical architecture deep-dive
- **[PRODUCT_VISION.md](./PRODUCT_VISION.md)** - Product specification
- **[CLERK_SETUP.md](./CLERK_SETUP.md)** - Authentication setup guide
- **[ASYNC_OPERATIONS.md](./ASYNC_OPERATIONS.md)** - Job queue design
- **[CODE_ANALYSIS_REPORT.md](./CODE_ANALYSIS_REPORT.md)** - Technical debt analysis
- **[CLEANUP_CHECKLIST.md](./CLEANUP_CHECKLIST.md)** - Refactoring tasks

---

## License

MIT - see [LICENSE](./LICENSE)

---

## Support

For issues, questions, or contributions:
- **Issues:** [GitHub Issues](https://github.com/ArthurZhang2408/Ultudy/issues)
- **Discussions:** [GitHub Discussions](https://github.com/ArthurZhang2408/Ultudy/discussions)

---

**Built with ❤️ by the Ultudy team**

_Last updated: November 2025_
