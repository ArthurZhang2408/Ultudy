# MVP v1.0 Implementation Plan

**Goal:** Transform current RAG-based system into interactive learning platform with mastery tracking

**Total Estimated Time:** 4-6 work sessions (8-12 hours)

---

## Session 1: Database Migration & Core Data Model
**Time:** 1.5-2 hours
**Status:** ✅ COMPLETED

### Tasks
1. **Create new database tables**
   - ✅ `courses` table (multi-course support)
   - ✅ `concepts` table (concept-level mastery tracking)
   - ✅ `problem_types` table (problem mastery tracking)
   - ✅ `study_sessions` table (session tracking)

2. **Modify existing tables**
   - ✅ Add `full_text` column to `documents` table
   - ✅ Add metadata columns: `material_type`, `chapter`, `user_tags`
   - ✅ Add `course_id` foreign keys to support multi-course hierarchy
   - ✅ Keep `chunks` table temporarily for safe migration

3. **Write migration script**
   - ✅ Create new tables with RLS policies
   - ✅ Add course hierarchy support
   - ✅ Backfill `full_text` from existing PDF storage
   - ✅ Test migration on dev database

4. **Update database models/types**
   - ✅ TypeScript types for new tables
   - ✅ Database query helpers

### Deliverables
- ✅ Migration SQL script: `backend/db/migrations/20251104000000_mvp_v1_schema.cjs`
- ✅ New table schemas working (concepts, problem_types, study_sessions)
- ✅ Added full_text and metadata columns to documents
- ✅ Existing data preserved
- ✅ Tests pass with new schema (24/24)

### Status: ✅ COMPLETED (Nov 4, 2025)
- Created migration with all mastery tracking tables
- Added `SKIP_EMBEDDINGS=true` to avoid Gemini quota issues
- Fixed CORS credentials for frontend testing
- All tests passing

### Success Criteria
- `npm run migrate up` succeeds
- Can query new tables
- Old endpoints still work (backward compatible)

---

## Session 2: Document Tagging & Full-Text Storage
**Time:** 1-1.5 hours
**Status:** ✅ COMPLETED
**Depends On:** Session 1

### Tasks
1. **Update upload endpoint**
   - Store full extracted text in `documents.full_text`
   - Keep current chunking temporarily (don't break existing)

2. **Create metadata endpoint**
   ```
   POST /api/documents/:id/metadata
   {
     material_type: "textbook" | "lecture" | "tutorial" | "exam",
     chapter: "3",
     title: "Signals and Systems - Chapter 3"
   }
   ```

3. **Build frontend tagging UI**
   - Add tagging form after upload success
   - Dropdowns for material_type
   - Free text for chapter/title
   - "Save & Continue" flow

4. **Create document organization view**
   - List view grouped by material_type and chapter
   - Edit metadata inline
   - Delete documents

### Deliverables
- ✅ Backend: `POST /api/documents/:id/metadata` endpoint
- ✅ Backend: `GET /api/documents` returns organized list
- ✅ Frontend: Tagging UI component
- ✅ Frontend: Document list view with organization

### Success Criteria
- Can upload PDF → tag it → see it organized by chapter
- Metadata persists across page refresh
- Can edit tags after initial upload

---

## Session 3: Lesson Generation with Full-Chapter Context
**Time:** 2-2.5 hours
**Status:** ✅ COMPLETED
**Depends On:** Session 2

### Tasks
1. **Create new lesson generation endpoint**
   ```
   POST /api/lessons/generate
   {
     document_id: "uuid",
     chapter: "3",  // optional filter
     include_check_ins: true
   }
   ```

2. **Implement lesson generator service**
   - Load full text from `documents.full_text`
   - Send to Gemini with full context (no chunking)
   - Use lesson generation prompt (see PRODUCT_VISION.md Section 5.2)
   - Parse JSON response
   - Extract concepts covered

3. **Add check-in question generation**
   - Generate 2-3 check-in questions per concept
   - Include hints
   - Store expected answer for evaluation

4. **Update frontend lesson view**
   - Display structured lesson (summary, explanation, examples)
   - Add "Test Yourself" button
   - Show concepts covered

5. **Keep old endpoints working**
   - Don't delete `/study/lesson` yet
   - Add feature flag to switch between old/new

### Deliverables
- ✅ Backend: `POST /api/lessons/generate` endpoint
- ✅ Backend: Lesson generator service with full-context
- ✅ Backend: Check-in question generation
- ✅ Frontend: Updated lesson display component
- ✅ Frontend: "Test Yourself" button (non-functional for now)

### Success Criteria
- Select chapter → Generate lesson with full chapter context
- Lesson includes summary, explanation, examples, analogies
- Check-in questions generated and returned
- Response time < 10 seconds

---

## Session 4: Check-In System & Mastery Tracking
**Time:** 2-2.5 hours
**Status:** 🔄 IN PROGRESS
**Depends On:** Session 3

### Tasks
1. **Create check-in endpoints**
   ```
   POST /api/check-ins/submit
   {
     concept_id: "uuid",
     question: "What is bandwidth?",
     user_answer: "The frequency range of a signal"
   }

   Response:
   {
     correct: true,
     feedback: "Correct! Bandwidth is...",
     mastery_update: {
       concept: "Bandwidth Definition",
       old_state: "not_learned",
       new_state: "understood"
     }
   }
   ```

2. **Implement answer evaluation**
   - Use Gemini to evaluate answer correctness
   - Generate feedback (positive for correct, explanatory for wrong)
   - Use evaluation prompt (see PRODUCT_VISION.md)

3. **Build mastery tracking logic**
   - Create/update concept records
   - Track attempts and correct answers
   - Update mastery state based on performance
   - Store in `concepts` table

4. **Create check-in modal UI**
   - Modal appears when "Test Yourself" clicked
   - Shows question with text input
   - "Need a hint?" button
   - Submit button
   - Feedback display

5. **Update lesson flow**
   - After check-in, update UI to show mastery change
   - Continue to next concept or retry if wrong

### Deliverables
- ✅ Backend: `POST /api/check-ins/submit` endpoint
- ✅ Backend: Answer evaluation service
- ✅ Backend: Mastery tracking logic
- ✅ Frontend: Check-in modal component
- ✅ Frontend: Mastery state display

### Success Criteria
- User answers check-in → gets accurate evaluation
- Mastery state updates correctly
- Wrong answers get helpful feedback
- Can retry questions until correct

---

## Session 5: Progress Dashboard
**Time:** 1.5-2 hours
**Status:** Not Started
**Depends On:** Session 4

### Tasks
1. **Create progress endpoint**
   ```
   GET /api/progress/overview

   Response:
   {
     content_mastery: {
       by_chapter: {
         "1": { percentage: 80, concepts: [...] },
         "2": { percentage: 50, concepts: [...] }
       },
       overall: 65
     },
     weak_areas: ["Sampling Theorem", "Convolution"],
     study_sessions: [...]
   }
   ```

2. **Build progress calculation logic**
   - Aggregate concept mastery by chapter
   - Calculate percentages
   - Identify weak areas (needs_review or low attempts)

3. **Create dashboard UI**
   - Chapter progress bars
   - Concept list with mastery indicators
   - Weak areas highlight
   - "Continue Learning" button

4. **Add progress tracking to lesson flow**
   - Track when lessons started/completed
   - Store in `study_sessions` table
   - Show "Today you learned X concepts"

### Deliverables
- ✅ Backend: `GET /api/progress/overview` endpoint
- ✅ Backend: Progress calculation service
- ✅ Frontend: Progress dashboard component
- ✅ Frontend: Session tracking

### Success Criteria
- Dashboard shows accurate concept mastery
- Chapter progress reflects learning state
- Weak areas are correctly identified
- Progress persists across sessions

---

## Session 6: Testing, Polish & Documentation
**Time:** 1-1.5 hours
**Status:** Not Started
**Depends On:** Sessions 1-5

### Tasks
1. **Write tests**
   - Unit tests for mastery tracking logic
   - Integration tests for new endpoints
   - E2E test for full learning flow

2. **Update existing tests**
   - Fix tests broken by schema changes
   - Add tests for new endpoints

3. **Performance optimization**
   - Cache full text loading
   - Optimize Gemini API calls
   - Add loading states to UI

4. **Documentation**
   - Update README with new architecture
   - Add API documentation
   - Create user guide for MVP features

5. **Feature flag cleanup**
   - Remove old RAG endpoints if new system works
   - Clean up old code
   - Update frontend to only use new APIs

### Deliverables
- ✅ Test suite passing (>90% coverage)
- ✅ Documentation updated
- ✅ Old RAG code removed (or behind feature flag)
- ✅ Performance benchmarks met

### Success Criteria
- All tests pass
- API response times < 10s
- No memory leaks
- Documentation is clear

---

## Optional Session 7: Problem Practice Foundation (If Time Permits)
**Time:** 2-3 hours
**Status:** Nice to Have

### Tasks
1. **Add problem_types tracking**
   - Identify problem types from tutorials
   - Create problem type records

2. **Basic problem generation**
   - Generate practice problems from tutorials
   - Use tutorial solutions as templates

3. **Problem submission endpoint**
   - Accept user solutions
   - Evaluate correctness
   - Track problem mastery

This can be deferred to Phase 2 if needed.

---

## Migration Strategy: RAG → Full-Context

### Option A: Hard Cutover (Recommended)
```
Session 1-2: Add new tables, keep old system running
Session 3: Build new lesson generation alongside old
Session 4-5: Switch frontend to new system
Session 6: Remove old RAG code
```

**Pros:** Clean, simple
**Cons:** Can't easily rollback

### Option B: Feature Flag Approach
```
Add ENABLE_FULL_CONTEXT_LESSONS flag
Build new system behind flag
Test with select users
Gradually migrate all users
Remove old code after validation
```

**Pros:** Safe, can rollback
**Cons:** Maintains two codebases temporarily

**Recommendation:** Option A (hard cutover) since this is MVP stage

---

## Risk Mitigation

### Risk 1: Migration Breaks Existing Functionality
**Mitigation:**
- Write migration in transaction
- Test on dev database first
- Keep old tables temporarily
- Have rollback script ready

### Risk 2: Full-Context API Costs Too High
**Mitigation:**
- Monitor costs per request
- Add caching layer
- Set cost alerts
- Rollback plan: restore chunking

### Risk 3: Lesson Generation Quality Poor
**Mitigation:**
- Test with real course materials early
- Tune prompts iteratively
- Allow user feedback ("Was this helpful?")
- Manual prompt improvement

### Risk 4: Scope Creep
**Mitigation:**
- Stick to plan above
- Defer nice-to-haves (Session 7)
- Focus on core flow: Upload → Tag → Learn → Check-in → Dashboard
- Ship MVP, iterate based on feedback

---

## Success Metrics for MVP v1.0

### Must-Have (Blocking Launch)
- ✅ User can upload PDF and tag by chapter
- ✅ User can generate lesson from chapter
- ✅ User gets check-in questions after reading
- ✅ System tracks concept mastery correctly
- ✅ Dashboard shows learning progress

### Nice-to-Have (Post-Launch)
- ⭕ Auto-detect chapters
- ⭕ Problem practice
- ⭕ Spaced repetition
- ⭕ Visual concept maps

### Launch Criteria
1. One user can complete full learning flow end-to-end
2. Mastery tracking is accurate (manual verification)
3. No critical bugs
4. Core endpoints respond < 10s
5. Documentation exists

---

## Session-by-Session Checklist

### Before Each Session
- [ ] Pull latest code
- [ ] Review previous session's work
- [ ] Read relevant sections of PRODUCT_VISION.md
- [ ] Set up test data (sample PDFs)

### During Each Session
- [ ] Follow task list above
- [ ] Write tests as you go
- [ ] Commit frequently with clear messages
- [ ] Update this plan if scope changes

### After Each Session
- [ ] Run full test suite
- [ ] Update status in this document
- [ ] Document any blockers or decisions
- [ ] Push code to GitHub

---

## Current Status: Session 4 (Check-In System) In Progress

**Sessions Completed:** 1-3 (Database, Document Tagging, Lesson Generation)
**Current Session:** Session 4 (Check-In System & Mastery Tracking)
**Next Up:** Session 5 (Progress Dashboard)
**Blocked By:** Nothing

### Implementation Progress Summary

| Session | Status | Completion Date |
|---------|--------|----------------|
| Session 1: Database Migration | ✅ COMPLETED | Nov 4, 2025 |
| Session 2: Document Tagging | ✅ COMPLETED | Nov 4, 2025 |
| Session 3: Lesson Generation | ✅ COMPLETED | Nov 4, 2025 |
| Session 4: Check-In System | 🔄 IN PROGRESS | - |
| Session 5: Progress Dashboard | ⏳ PENDING | - |
| Session 6: Testing & Polish | ⏳ PENDING | - |

### Key Achievements
- ✅ Multi-course hierarchy support (Course → Chapter → Concept → Check-in)
- ✅ Full-context lesson generation (no RAG chunking)
- ✅ Large file upload support (SKIP_EMBEDDINGS flag)
- ✅ Document metadata tagging system
- ✅ All tests passing (24/24)

### Current Task
Implementing check-in system with:
- Answer evaluation using Gemini
- Mastery tracking logic
- Course-aware concept organization

---

## Notes & Decisions Log

### Nov 4, 2025
- **Multi-course hierarchy**: Added `courses` table to support students preparing for multiple classes
- **Data organization**: Course → Chapter → Concept → Check-in hierarchy
- **Gemini quota fix**: Added `SKIP_EMBEDDINGS=true` to avoid quota issues on large uploads
- **CORS fix**: Enabled credentials for authenticated frontend testing
- **Architecture validated**: Full-context lessons working with 1M token context window

### Nov 3, 2025
- Created implementation plan
- Decided on hard cutover migration strategy
- Estimated 6 sessions (12 hours total)
- Prioritized core learning flow over problem practice

### Future Decisions Needed
- [ ] Exact prompt templates for answer evaluation
- [ ] Error handling strategy for LLM failures
- [ ] Caching strategy for full-text documents
- [ ] UI design for check-in modal (wireframe needed?)
- [ ] Course selection UX flow

---

**This plan is a living document. Update after each session with progress and learnings.**
