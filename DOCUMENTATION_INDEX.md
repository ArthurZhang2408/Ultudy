# Ultudy Documentation System

**Last Updated:** 2025-11-18
**Purpose:** Central index for all project documentation with self-maintenance instructions

---

## 📋 Quick Start for Claude Code

When you open this repository:
1. **Read this file first** to understand the project structure
2. Check `PRODUCT_VISION.md` for the product goals and features
3. Review `SCALABILITY_GUIDE.md` for production scaling information
4. See `backend/PDF_EXTRACTION_GUIDE.md` for PDF processing details

---

## 📚 Documentation Index

### Core Project Documentation

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **README.md** | Project overview, getting started, tech stack | First time setup |
| **PRODUCT_VISION.md** | Product goals, user stories, feature roadmap | Understanding product direction |
| **DEVELOPMENT_PIPELINE.md** | Development workflow and environment strategy | Setting up dev pipeline |
| **DEPLOYMENT_GUIDE.md** | Complete deployment guide to ultudy.com | Deploying to production |
| **DEPLOYMENT_CHECKLIST.md** | Step-by-step deployment checklist | During deployment |
| **LAUNCH_MODE_GUIDE.md** | Switching between landing page and app | Pre-launch setup, launch day |
| **WAITLIST_GUIDE.md** | Managing pre-launch waitlist and launch emails | Pre-launch, launch day |
| **PRODUCTION_FIXES.md** | Production deployment troubleshooting | After deployment, fixing issues |
| **SCALABILITY_GUIDE.md** | Scaling from 1k to 100k+ users | After deployment, scaling |
| **CLERK_SETUP.md** | Authentication setup with Clerk | Setting up auth |

### Backend Documentation

| Document | Purpose | Location |
|----------|---------|----------|
| **PDF_EXTRACTION_GUIDE.md** | PDF processing modes and configuration | `backend/` |
| **CHAPTER_EXTRACTION_TESTING.md** | Chapter-based extraction testing guide | Root |
| **ENV_CONFIGURATION.md** | Environment variables reference | `backend/` |
| **scripts/README.md** | Database and PDF extraction utilities | `backend/scripts/` |
| **migrations/README.md** | Database migration guide | `backend/src/db/migrations/` |

### Frontend Documentation

| Document | Purpose | Location |
|----------|---------|----------|
| *(none currently)* | - | `frontend/` |

### Architecture Documentation

| Document | Purpose | Status |
|----------|---------|--------|
| **LESSON_GENERATION_ARCHITECTURE.md** | How AI lessons are generated | Current |
| **ASYNC_OPERATIONS.md** | Job queue and async processing | Current |

---

## 🗂️ Documentation Categories

### Active Documentation (Keep Updated)
Files that represent the current state of the system:
- `README.md` - Main project documentation
- `PRODUCT_VISION.md` - Product strategy
- `DEVELOPMENT_PIPELINE.md` - Development workflow and CI/CD
- `DEPLOYMENT_GUIDE.md` - Production deployment guide
- `DEPLOYMENT_CHECKLIST.md` - Deployment verification checklist
- `LAUNCH_MODE_GUIDE.md` - Landing page/app switching guide
- `WAITLIST_GUIDE.md` - Pre-launch waitlist and launch email guide
- `PRODUCTION_FIXES.md` - Production troubleshooting guide
- `SCALABILITY_GUIDE.md` - Production scaling guide
- `CLERK_SETUP.md` - Authentication setup
- `backend/PDF_EXTRACTION_GUIDE.md` - PDF processing
- `CHAPTER_EXTRACTION_TESTING.md` - Chapter-based extraction (testing)
- `backend/ENV_CONFIGURATION.md` - Environment configuration
- `backend/scripts/README.md` - Utility scripts documentation
- `backend/src/db/migrations/README.md` - Database migrations
- `LESSON_GENERATION_ARCHITECTURE.md` - Core architecture
- `ASYNC_OPERATIONS.md` - Async job processing

### Archived/Historical Documentation
Implementation plans, migration docs, and phase documents that are completed:
- Moved to `/docs/archive/` for reference

### Deleted Documentation
Outdated docs that no longer apply to current codebase:
- Old RAG/embedding system docs (deprecated features removed)
- Phase implementation plans (completed or obsolete)
- Old testing guides for removed features

---

## 🔄 Self-Maintenance System

### **CRITICAL: Update Documentation After Every Code Change**

When making changes to the codebase, **always** update documentation:

#### 1. For Feature Changes
- Update `README.md` if public API changes
- Update `PRODUCT_VISION.md` if feature set changes
- Update architecture docs if design changes
- Update relevant backend/frontend docs

#### 2. For New Features
- Document in `README.md` under appropriate section
- Add to `PRODUCT_VISION.md` if user-facing
- Create dedicated doc in `backend/` or `frontend/` if complex
- **Add entry to this DOCUMENTATION_INDEX.md**

#### 3. For Deprecated Features
- Remove from `README.md`
- Mark as deprecated in `PRODUCT_VISION.md`
- Delete or archive related documentation
- **Update this DOCUMENTATION_INDEX.md**

#### 4. For Configuration Changes
- Update `backend/ENV_CONFIGURATION.md`
- Update `backend/.env.example`
- Update `SCALABILITY_GUIDE.md` if affects scaling

#### 5. For Database Changes
- Create migration in `backend/src/db/migrations/`
- Update `backend/src/db/migrations/README.md`
- Update schema documentation if it exists

### **Documentation Quality Standards**

Every documentation file must have:
- **Date**: "Last Updated: YYYY-MM-DD" at the top
- **Purpose**: Clear statement of what the doc covers
- **Status**: Current, Deprecated, or Archived
- **Examples**: Code examples where applicable
- **Cross-references**: Links to related docs

### **Automated Documentation Checks**

Before committing code changes, verify:
- [ ] All changed features are documented
- [ ] No docs reference deleted/deprecated features
- [ ] This DOCUMENTATION_INDEX.md is updated
- [ ] All docs have "Last Updated" dates
- [ ] README.md reflects current state

---

## 🏗️ Architecture Overview

### Current Architecture (Post-Refactoring)

**Frontend (Next.js 14)**
```
/frontend/src/
├── app/              # Next.js pages (courses, learn, etc.)
├── components/       # React components (MasteryGrid, etc.)
├── lib/              # Utilities and hooks
└── types/            # TypeScript type definitions
```

**Backend (Node.js + Express)**
```
/backend/src/
├── routes/           # API endpoints (courses, lessons, upload, etc.)
├── providers/        # LLM providers (Gemini, OpenAI)
├── services/         # Business logic (uploadService, etc.)
├── jobs/             # Bull queue workers
├── middleware/       # Request validation, auth
├── db/               # Database connection and migrations
└── lib/              # Utilities (logger, cache)
```

**Key Technologies**
- **No RAG/Embeddings**: Removed in refactoring (Jan 2025)
- **Vision-based PDF**: Uses Gemini Vision for full-context extraction
- **PostgreSQL**: With RLS for multi-tenancy
- **Bull + Redis**: Job queues for async processing
- **Clerk**: Authentication (JWT tokens)

### What Was Removed (Don't Document)
- ❌ Embedding system (pgvector, chunks table)
- ❌ Vector search / RAG
- ❌ `/search` endpoints
- ❌ Old `/study/lesson` endpoint
- ❌ Chunking system

### What's Current (Keep Documented)
- ✅ Vision-based PDF extraction
- ✅ Section-based lesson generation
- ✅ Concept mastery tracking
- ✅ Multi-course support
- ✅ Async job processing
- ✅ Scalability features (connection pooling, caching)

---

## 📝 Template for New Documentation

When creating new documentation, use this template:

```markdown
# [Feature/Component Name]

**Last Updated:** YYYY-MM-DD
**Status:** Current | Deprecated | Experimental
**Maintainer:** [Your name/team]

---

## Overview

[Brief description of what this doc covers]

## Prerequisites

- [What you need before reading this]
- [Dependencies, setup required]

## [Main Content Sections]

### Section 1
[Content]

### Section 2
[Content]

## Examples

```[language]
// Code examples
```

## Related Documentation

- [Link to related doc 1]
- [Link to related doc 2]

## Changelog

- YYYY-MM-DD: [Change description]
```

---

## 🎯 Quick Commands Reference

```bash
# Database utilities
cd backend && node scripts/dump-schema.cjs                    # Dump schema
cd backend && node scripts/clear-cached-lessons.js            # Clear lesson cache

# Run migrations
cd backend && node src/db/migrations/run.js

# Inspect database schema (deprecated - use scripts/dump-schema.cjs)
cd backend && node src/db/migrations/inspect_schema.js

# Start development
cd backend && npm run dev
cd frontend && npm run dev

# Check guides
cat PRODUCTION_FIXES.md     # Production troubleshooting
cat SCALABILITY_GUIDE.md    # Scaling guide
```

---

## 🔍 Finding Information

### "How do I set up authentication?"
→ See `CLERK_SETUP.md`

### "How does PDF extraction work?"
→ See `backend/PDF_EXTRACTION_GUIDE.md`
→ For chapter-based testing: `CHAPTER_EXTRACTION_TESTING.md`

### "How do I set up the development pipeline?"
→ See `DEVELOPMENT_PIPELINE.md`

### "How do I deploy to production?"
→ See `DEPLOYMENT_GUIDE.md` and `DEPLOYMENT_CHECKLIST.md`

### "How do I switch between landing page and app?"
→ See `LAUNCH_MODE_GUIDE.md`

### "How do I manage the pre-launch waitlist?"
→ See `WAITLIST_GUIDE.md`

### "How do I send launch day emails?"
→ See `WAITLIST_GUIDE.md`

### "How do I scale to production?"
→ See `SCALABILITY_GUIDE.md`

### "What's the product vision?"
→ See `PRODUCT_VISION.md`

### "How do I configure environment variables?"
→ See `backend/ENV_CONFIGURATION.md` and `backend/.env.example`

### "What database tables exist?"
→ Run: `node backend/scripts/dump-schema.cjs`

### "How do I troubleshoot production issues?"
→ See `PRODUCTION_FIXES.md`

### "How do lessons get generated?"
→ See `LESSON_GENERATION_ARCHITECTURE.md`

---

## ⚠️ Common Pitfalls

1. **Don't update README.md without reading this doc first**
2. **Don't reference embeddings/RAG/chunks** (removed features)
3. **Don't create docs without adding them to this index**
4. **Don't forget to update "Last Updated" dates**
5. **Don't leave outdated information** - delete or update immediately

---

## 📊 Documentation Health Check

Run this checklist monthly:

- [ ] All docs have recent "Last Updated" dates (< 3 months)
- [ ] No docs reference removed features
- [ ] README.md accurately reflects current state
- [ ] All new features from last month are documented
- [ ] DOCUMENTATION_INDEX.md is up to date
- [ ] `/docs/archive/` contains only historical docs
- [ ] No duplicate information across docs

---

## 🤖 Instructions for Claude Code

When you open this repository:

1. **Read DOCUMENTATION_INDEX.md first** (this file)
2. Understand current architecture vs removed features
3. Check `PRODUCT_VISION.md` for product goals
4. When making changes:
   - Update relevant documentation
   - Add new docs to this index
   - Mark deprecated features
   - Update "Last Updated" dates
5. **Before finishing**: Verify all docs are current

---

**Remember:** Good documentation is code that explains itself. Keep it concise, current, and cross-referenced.
