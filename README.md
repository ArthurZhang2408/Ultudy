# Ultudy - AI-Powered Study Platform

**Last Updated:** 2025-01-17

> **📚 New to this repo?** Start with [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) for a complete overview of all documentation.

An AI-powered study companion that transforms uploaded course PDFs into structured, interactive learning experiences using vision-based PDF extraction and full-context lesson generation.

## Features

- **Smart PDF Processing** — Vision-based extraction with automatic section detection
- **Course Organization** — Multi-course support with chapter/document management
- **Adaptive Lessons** — Full-context AI-generated lessons with embedded check-ins
- **Interactive Check-ins** — Concept-level MCQs with explanations and hints
- **Progress Tracking** — Per-concept mastery levels and accuracy metrics
- **Scalable Architecture** — Connection pooling, caching, async processing

## Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript, TailwindCSS, Clerk Authentication
- **Backend:** Node.js, Express, Bull (job queues), Redis (optional caching)
- **Database:** PostgreSQL with Row-Level Security (multi-tenant)
- **AI:** Google Gemini Vision & LLM (with OpenAI fallback support)
- **Infrastructure:** Async job processing, optional Redis caching, connection pooling

## Documentation

### Essential Guides
- 📖 **[Documentation Index](./DOCUMENTATION_INDEX.md)** - Start here! Complete documentation overview
- 🎯 **[Product Vision](./PRODUCT_VISION.md)** - Product goals and roadmap
- 🚀 **[Scalability Guide](./SCALABILITY_GUIDE.md)** - Scale from 1k to 100k+ users
- 🔐 **[Authentication Setup](./CLERK_SETUP.md)** - Clerk integration guide

### Technical Guides
- 📄 **[PDF Extraction Guide](./backend/PDF_EXTRACTION_GUIDE.md)** - PDF processing modes
- 🏗️ **[Lesson Architecture](./LESSON_GENERATION_ARCHITECTURE.md)** - How lessons are generated
- ⚡ **[Async Operations](./ASYNC_OPERATIONS.md)** - Job queue architecture
- 🔧 **[Environment Config](./backend/ENV_CONFIGURATION.md)** - All environment variables

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Docker (optional, for local database)
- Redis (optional, for caching)

### 1. Database Setup

Using Docker:
```bash
docker compose up -d db
```

Or use your own PostgreSQL instance and set `DATABASE_URL` in `.env`.

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env to add your GEMINI_API_KEY and DATABASE_URL
npm install
npm run migrate
npm run dev
```

The backend starts at `http://localhost:3001`.

Check health: `curl http://localhost:3001/db/health`

### 3. Frontend Setup

```bash
cd frontend
cp .env.local.example .env.local
# Configure Clerk keys in .env.local
npm install
npm run dev
```

The frontend starts at `http://localhost:3000`.

### 4. Run Database Migrations

```bash
cd backend
node src/db/migrations/run.js
```

This adds performance indexes for better query speed.

## Usage Examples

### Upload a PDF

```bash
# Get auth token from Clerk (or use dev mode)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -F file=@/path/to/textbook.pdf \
  -F course_id=<course-id> \
  -F chapter="Chapter 1" \
  -F material_type=textbook \
  -F title="Introduction to Calculus" \
  http://localhost:3001/upload/pdf-structured
```

### Generate Lesson for a Section

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "document_id":"<doc-id>",
    "section_id":"<section-id>",
    "include_check_ins":true
  }' \
  http://localhost:3001/lessons/generate
```

## Authentication

### Development Mode (Default)
```bash
AUTH_MODE=dev
```
Uses `X-User-Id` headers for testing. Default dev user: `00000000-0000-0000-0000-000000000001`

```bash
curl -H "X-User-Id: dev-user-001" \
  http://localhost:3001/api/courses
```

### Production Mode (Clerk JWT)
```bash
AUTH_MODE=jwt
AUTH_JWT_ISS=https://your-clerk-domain.clerk.accounts.dev
AUTH_JWT_AUD=your-audience
AUTH_JWT_JWKS_URL=https://your-clerk-domain.clerk.accounts.dev/.well-known/jwks.json
```

See [CLERK_SETUP.md](./CLERK_SETUP.md) for detailed instructions.

## LLM Provider Configuration

### Mock Mode (Default - No API Key Required)
```bash
LLM_PROVIDER=mock
```
Generates deterministic responses for testing. No external API calls.

### Gemini (Recommended)
```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-api-key
GEMINI_GEN_MODEL=gemini-1.5-flash  # or gemini-1.5-pro
```

Get your API key from [Google AI Studio](https://aistudio.google.com/).

### OpenAI (Alternative)
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=your-api-key
```

## Scaling to Production

**Current Capacity**: ~1,000 concurrent users

See [SCALABILITY_GUIDE.md](./SCALABILITY_GUIDE.md) for:
- Adding Redis caching (2x capacity)
- Database read replicas (10x capacity)
- Multiple app servers with load balancing
- S3 storage for PDFs
- Scaling to 100,000+ users

## Architecture Overview

```
Frontend (Next.js)
    ↓ API calls
Backend (Express)
    ↓ PostgreSQL
Database (with RLS)
    + Bull Queue (async jobs)
    + Redis (optional cache)
    + Gemini Vision (PDF extraction)
    + Gemini LLM (lesson generation)
```

### Key Design Decisions

1. **Vision-based PDF Extraction** - Uses Gemini Vision to extract text, formulas, diagrams directly from PDF pages
2. **Full-context Lessons** - Each section gets complete context for rich, connected learning
3. **Async Processing** - PDF upload and lesson generation happen in background jobs
4. **Multi-tenancy with RLS** - Database-level isolation using PostgreSQL Row-Level Security
5. **No Embeddings/RAG** - Removed for simpler, more maintainable architecture

### What Changed (Jan 2025 Refactoring)

**Removed:**
- ❌ Embedding system (pgvector, chunks table)
- ❌ Vector search / RAG architecture
- ❌ `/search` endpoints
- ❌ Text chunking system

**Added:**
- ✅ Vision-based PDF extraction
- ✅ Section-based organization
- ✅ Full-context lesson generation
- ✅ Scalability features (connection pooling, caching)
- ✅ Improved async job processing

## Project Structure

```
/
├── frontend/           # Next.js app
│   ├── src/app/       # Pages (courses, learn)
│   ├── src/components/# React components
│   ├── src/lib/       # Utilities
│   └── src/types/     # TypeScript definitions
│
├── backend/           # Express API
│   ├── src/routes/   # API endpoints
│   ├── src/providers/# LLM providers
│   ├── src/services/ # Business logic
│   ├── src/jobs/     # Queue workers
│   ├── src/db/       # Database & migrations
│   └── src/lib/      # Utilities (logger, cache)
│
└── docs/             # Documentation
```

## Development Workflow

1. **Make code changes**
2. **Update relevant documentation** (see [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md))
3. **Run tests** (if applicable)
4. **Commit with clear message**
5. **Update "Last Updated" dates in docs**

## Common Tasks

### Add a New Feature
1. Implement code changes
2. Update `README.md` if public-facing
3. Update `PRODUCT_VISION.md` if product-related
4. Add to `DOCUMENTATION_INDEX.md`
5. Create feature doc if complex

### Deploy to Production
1. Review [SCALABILITY_GUIDE.md](./SCALABILITY_GUIDE.md)
2. Set up Redis caching
3. Configure environment variables
4. Run database migrations
5. Enable production mode (`NODE_ENV=production`)

### Troubleshooting
- Check `backend/ENV_CONFIGURATION.md` for config issues
- Run `node backend/src/db/migrations/inspect_schema.js` to see database schema
- Check backend logs for errors
- Verify API key configuration

## Contributing

This project follows these principles:
- **Documentation-first**: Update docs with every code change
- **Self-maintaining docs**: See [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)
- **Keep it simple**: Remove complexity when possible
- **Production-ready**: Code should scale and handle errors gracefully

## License

MIT — see [LICENSE](./LICENSE)

---

**Need help?** Check [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) for all available documentation.
