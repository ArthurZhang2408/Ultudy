# Ultudy - Product Vision & Technical Specification

**Last Updated:** November 3, 2025
**Status:** MVP v1.0 - Core Learning Feature

---

## 1. Core User Story

### The Problem
> "I'm a university student who hasn't attended lectures. I have 2 weeks until finals. I have all the course materials (textbook, lecture notes, tutorials, practice problems, past exams) but I'm overwhelmed and don't know where to start or what I don't know."

### The Solution
An AI-powered adaptive study companion that:
1. **Ingests** all course materials at once
2. **Structures** them into a learnable pathway
3. **Guides** the user through content interactively with constant check-ins
4. **Identifies** knowledge gaps and weak problem-solving areas
5. **Adapts** to focus on weaknesses until mastery
6. **Explains** concepts on-demand when confused

### The Value Proposition
**vs. ChatGPT:** Course-aware, tracks your specific progress, adapts to YOUR weak areas, maintains learning state across sessions

**vs. Brilliant.org:** Dynamic for ANY course (not pre-built), uses YOUR course materials, adapts to YOUR professor's style/notation

---

## 2. MVP v1.0 Scope - "The Adaptive Course Walkthrough"

### Core Feature: Interactive Lesson Generation
The single magical moment that differentiates us from ChatGPT.

**User Flow:**
```
1. Upload materials (textbook, lectures, tutorials, exams)
2. Tag materials by type/chapter
3. Click "Start Study Session"
4. App generates interactive lesson:
   - Reads textbook Chapter 1
   - Creates structured explanation (summary + examples + analogies)
   - Presents to user
   - [🤔 Test yourself] button appears
   - User clicks → gets check-in questions
   - Based on answers, adapts next content
5. Tracks what user knows vs. doesn't know
6. Moves to next chapter or remedies gaps
```

### What's Included in MVP v1.0
- ✅ PDF upload with user-defined tagging (Chapter 1, Tutorial 3, etc.)
- ✅ Interactive lesson generation from textbook chapters
- ✅ Check-in questions after each concept section
- ✅ Dual mastery tracking:
  - **Content Mastery**: Concept-level (Chapter 1 → Concept A, B, C)
  - **Problem Mastery**: Problem-type level (Convolutions, Proofs, etc.)
- ✅ On-demand explanations ("Explain this concept again")
- ✅ Progress dashboard showing weak areas

### What's NOT in MVP v1.0
- ❌ Auto-detection of chapter structure (future: use cheap LLM)
- ❌ Spaced repetition (future phase)
- ❌ Visual diagrams/animations (future phase)
- ❌ Voice tutoring (future phase)
- ❌ Collaborative study (future phase)

---

## 3. Product Architecture

### 3.1 Dual Mastery System

```
User Progress
├── Content Mastery (Concepts)
│   ├── Chapter 1: Introduction
│   │   ├── Concept: Signal Definition [✓ Mastered]
│   │   ├── Concept: Continuous vs Discrete [⚠ Needs Review]
│   │   └── Concept: Sampling Theorem [✗ Not Learned]
│   └── Chapter 2: Fourier Transforms
│       └── ...
│
└── Problem Mastery (Techniques)
    ├── Time-domain convolution [90% - Strong]
    ├── Frequency-domain analysis [40% - Weak]
    └── Z-transforms [0% - Not Attempted]
```

**Concept Mastery States:**
- `not_learned`: User hasn't seen this concept
- `needs_review`: User answered check-in incorrectly
- `understood`: User answered correctly once
- `mastered`: User answered correctly 3+ times

**Problem Type Mastery:**
- Tracked as percentage (0-100%)
- Calculated from success rate on problems of that type
- Used to generate targeted practice

### 3.2 Material Organization (MVP)

**User-Defined Tagging:**
```
User uploads PDF → Prompted to tag:
- Material Type: [Textbook | Lecture Notes | Tutorial | Past Exam]
- Chapter/Week: [Free text or dropdown]
- Title: [User-defined name]

Stored as:
{
  document_id: "uuid",
  title: "Signals and Systems - Chapter 3",
  material_type: "textbook",
  chapter: "3",
  owner_id: "user_clerk_id"
}
```

**Future Auto-Structuring (Phase 2):**
- Use cheap LLM (e.g., GPT-4o-mini) to analyze TOC
- Auto-split textbook by chapter
- Auto-identify problem types from past exams

### 3.3 Technical Architecture Simplification

**DECISION: Remove RAG, Use Full-Document Context**

**Rationale:**
- Course materials are small (~500 pages total)
- Gemini 2.0 has 1M token context window
- Chunking destroys semantic structure of chapters
- Simpler architecture = faster iteration

**New Data Model:**
```sql
-- Documents table (no chunks needed)
documents (
  id: uuid,
  title: text,
  material_type: enum('textbook', 'lecture', 'tutorial', 'exam'),
  chapter: text,
  full_text: text,  -- Store entire document text
  page_count: int,
  owner_id: text,
  created_at: timestamp
)

-- Concepts table (content mastery tracking)
concepts (
  id: uuid,
  document_id: uuid,
  chapter: text,
  concept_name: text,
  mastery_state: enum('not_learned', 'needs_review', 'understood', 'mastered'),
  check_in_attempts: int,
  check_in_correct: int,
  owner_id: text
)

-- Problem types table (problem mastery tracking)
problem_types (
  id: uuid,
  type_name: text,
  description: text,
  attempts: int,
  correct: int,
  mastery_percentage: int,  -- calculated field
  owner_id: text
)

-- Study sessions table
study_sessions (
  id: uuid,
  session_start: timestamp,
  session_end: timestamp,
  chapters_studied: text[],
  concepts_learned: int,
  problems_attempted: int,
  owner_id: text
)
```

**Removed:**
- ❌ `chunks` table
- ❌ `embedding` vector columns
- ❌ pgvector extension
- ❌ Vector similarity search

**API Changes:**
```
Old: /search?q=fourier → Returns chunks via RAG
New: /lesson/generate?chapter=3 → Loads full Chapter 3 text as context
```

---

## 4. Core User Flows

### 4.1 First-Time User Flow

```
1. Sign up with Clerk
2. Create new course
   - Course name: "ECE 358 - Computer Networks"
   - Exam date: [date picker]
3. Upload materials
   - [Upload Textbook PDF] → Tag: "Textbook", Chapter: "1"
   - [Upload Lecture 1 PDF] → Tag: "Lecture Notes", Week: "1"
   - [Upload Tutorial 1 PDF] → Tag: "Tutorial", Week: "1"
   - [Upload Midterm 2023 PDF] → Tag: "Past Exam"
4. [Start Study Session] button appears
5. App shows:
   "I've organized your course into 8 chapters and identified 4 problem types.
   Let's start with Chapter 1: Introduction to Networks."
```

### 4.2 Interactive Learning Flow (Core MVP Feature)

```
[User clicks "Start Study Session"]

App: "Let's learn Chapter 1: Introduction to Signals"

[App generates lesson from textbook Chapter 1]
┌─────────────────────────────────────────────┐
│ Chapter 1: Introduction to Signals         │
│                                             │
│ Summary:                                    │
│ • A signal is a function of time that      │
│   carries information                       │
│ • Signals can be continuous (analog) or    │
│   discrete (digital)                        │
│ • Key property: signals can be transformed │
│                                             │
│ Explanation:                                │
│ Think of a signal like a message. When you │
│ speak, your voice creates a continuous     │
│ sound wave (analog signal). When recorded  │
│ digitally, it becomes a discrete signal... │
│                                             │
│ Example:                                    │
│ x(t) = sin(2πt) is a continuous signal     │
│ x[n] = sin(2πn/N) is its discrete version  │
│                                             │
│ [🤔 Test Yourself]  [Continue Reading]     │
└─────────────────────────────────────────────┘

[User clicks "Test Yourself"]

App: "Quick check: What's the main difference between
      continuous and discrete signals?"

[User types answer or chooses multiple choice]

--- IF CORRECT ---
App: "✓ Correct! Continuous signals are defined at every
      point in time, while discrete signals are only
      defined at specific intervals."
[Updates concept mastery: "Signal Types" → understood]
[Continue to next concept]

--- IF INCORRECT ---
App: "Not quite. Let me explain it differently..."
[Shows alternative explanation with analogy]
App: "Let's try a similar question:"
[Asks related but simpler question]
[Updates concept mastery: "Signal Types" → needs_review]
```

### 4.3 Problem-Solving Flow

```
[After completing Chapter 1 content]

App: "Great! You've learned 5 concepts in Chapter 1.
      Let's practice with some problems."

[Loads Tutorial 1, Problem 1]
┌─────────────────────────────────────────────┐
│ Problem 1: Sample the signal x(t) = cos(4πt)│
│ at a rate of 8 Hz. Write the discrete      │
│ signal x[n].                                │
│                                             │
│ [Show Hint] [I'm Stuck - Explain]          │
│                                             │
│ Your solution:                              │
│ [ text area for user to type ]             │
│                                             │
│ [Submit Answer]                             │
└─────────────────────────────────────────────┘

[User clicks "Show Hint"]
App: "Hint: Remember that sampling means evaluating
      x(t) at t = n/fs, where fs is the sampling rate."

[User submits wrong answer]

App: "Not quite. You used the wrong formula for the
      sampling interval. Let me show you step by step:

      Step 1: Sampling rate fs = 8 Hz
      Step 2: Sampling interval T = 1/fs = 0.125 seconds
      Step 3: At time n, t = n × T = n × 0.125
      Step 4: x[n] = x(n × 0.125) = cos(4π × n × 0.125)
      Step 5: Simplify: x[n] = cos(πn/2)

      Now let's try a similar problem..."

[Generates new problem: "Sample x(t) = sin(6πt) at 12 Hz"]

[User must get 3 similar problems correct]
[Tracks problem type: "Sampling" → 33% → 66% → 100%]
```

### 4.4 Mistake Re-testing (Immediate Mastery)

```
[User gets problem wrong on first attempt]

App:
1. Explains the mistake
2. Shows the correct solution step-by-step
3. Generates a similar problem (same type, different numbers)

[User solves similar problem]
- Correct → Generate another similar problem
- Wrong → Re-explain, simplify, try again

[Requirement: 3 consecutive correct answers]
Problem Type Mastery: "Sampling"
├── Attempt 1: ✗ Wrong
├── Attempt 2: ✓ Correct (1/3)
├── Attempt 3: ✓ Correct (2/3)
└── Attempt 4: ✓ Correct (3/3) → Marked as Mastered

[Only then, move to next problem type]
```

---

## 5. API Design (Post-RAG Removal)

### 5.1 Core Endpoints

```typescript
// Upload & Organization
POST /api/documents/upload
  - Upload PDF
  - Extract text
  - Store full text (no chunking)
  - Return document_id

POST /api/documents/:id/metadata
  - Update material_type, chapter, title
  - User-defined tagging

GET /api/documents
  - List all user's documents
  - Group by material_type and chapter

// Lesson Generation (Core MVP Feature)
POST /api/lessons/generate
  Body: {
    chapter: "3",
    material_type: "textbook",
    user_progress: { /* concepts already learned */ }
  }
  Process:
    1. Load full text of Chapter 3 from documents table
    2. Send to Gemini 2.0 with full context (no RAG)
    3. Generate structured lesson
    4. Return lesson + auto-generated check-in questions
  Response: {
    lesson: {
      summary: string[],
      explanation: string,
      examples: Example[],
      analogies: string[]
    },
    check_ins: Question[],
    concepts_covered: string[]
  }

// Check-in Evaluation
POST /api/check-ins/evaluate
  Body: {
    concept_id: uuid,
    question: string,
    user_answer: string
  }
  Process:
    1. Use LLM to evaluate answer correctness
    2. Update concept mastery state
    3. If wrong, generate alternative explanation
  Response: {
    correct: boolean,
    feedback: string,
    mastery_updated: {
      old_state: "not_learned",
      new_state: "needs_review"
    },
    next_action: "retry" | "continue" | "review"
  }

// Problem Generation
POST /api/problems/generate
  Body: {
    problem_type: "sampling" | "convolution" | etc.,
    difficulty: "easy" | "medium" | "hard",
    context_chapter: "3"
  }
  Process:
    1. Load tutorial/exam problems of this type
    2. Generate similar problem with different values
    3. Store expected solution steps
  Response: {
    problem: {
      text: string,
      hints: string[],
      solution_steps: string[]
    }
  }

POST /api/problems/submit
  Body: {
    problem_id: uuid,
    user_solution: string
  }
  Process:
    1. Evaluate correctness
    2. Update problem_type mastery
    3. If wrong, explain mistake + generate similar problem
    4. Track consecutive correct (need 3)
  Response: {
    correct: boolean,
    feedback: string,
    consecutive_correct: number,
    mastery_percentage: number,
    next_problem?: Problem  // if need more practice
  }

// Progress Dashboard
GET /api/progress/overview
  Response: {
    content_mastery: {
      chapter_1: {
        concepts: [
          { name: "Signal Definition", state: "mastered" },
          { name: "Sampling", state: "needs_review" }
        ],
        overall_percentage: 80
      }
    },
    problem_mastery: {
      "Sampling": 100,
      "Convolution": 40,
      "Fourier Transform": 0
    },
    study_sessions: SessionSummary[],
    weak_areas: string[]
  }
```

### 5.2 LLM Prompt Structure

**Lesson Generation Prompt:**
```
You are an expert tutor teaching from a university course.

Context: [Full Chapter 3 text from textbook - up to 1M tokens]

Student's current knowledge:
- Mastered concepts: [list]
- Needs review: [list]

Task: Create an interactive lesson on Chapter 3: Fourier Transforms

Structure your response as JSON:
{
  "lesson": {
    "summary": ["3-5 bullet points covering key ideas"],
    "explanation": "Detailed explanation with intuitive language",
    "examples": [
      { "setup": "problem statement", "solution": "step-by-step" }
    ],
    "analogies": ["Real-world comparison that aids understanding"]
  },
  "check_ins": [
    {
      "concept": "convolution theorem",
      "question": "What happens when you convolve two signals in time domain?",
      "expected_answer": "It multiplies their Fourier transforms in frequency domain",
      "hints": ["Think about domain transformation", "Remember multiplication property"]
    }
  ],
  "concepts_covered": ["concept_name_1", "concept_name_2"]
}

Style:
- Conversational and encouraging
- Use analogies and real-world examples
- Break complex ideas into digestible parts
- Reference the uploaded course materials' notation and examples
```

**Problem Generation Prompt:**
```
You are creating practice problems based on course materials.

Context: [Tutorial solutions + Past exam problems of this type]

Student's mastery: 40% on "Convolution" problems (2/5 correct)

Task: Generate a NEW convolution problem similar to those in the course materials.

Requirements:
- Same difficulty as Tutorial 3, Problem 2
- Use the professor's notation style
- Different numbers/functions but same technique
- Include solution steps

Response as JSON:
{
  "problem": {
    "text": "Find the convolution of x(t) = u(t) and h(t) = e^(-2t)u(t)",
    "difficulty": "medium",
    "problem_type": "time_domain_convolution"
  },
  "hints": [
    "Start with the convolution integral formula",
    "Remember u(t) limits the integration bounds"
  ],
  "solution_steps": [
    "Step 1: Write convolution integral: y(t) = ∫ x(τ)h(t-τ)dτ",
    "Step 2: Substitute: y(t) = ∫ u(τ)e^(-2(t-τ))u(t-τ)dτ",
    "Step 3: Determine integration bounds based on u(t) and u(t-τ)",
    "Step 4: Evaluate integral...",
    "Final answer: y(t) = (1/2)(1 - e^(-2t))u(t)"
  ]
}
```

**Answer Evaluation Prompt:**
```
You are evaluating a student's answer to a check-in question.

Question: "What's the main property of the Fourier Transform?"
Expected: "It converts signals from time domain to frequency domain"
Student answered: "it changes the signal"

Task: Evaluate if the student understands the concept.

Response as JSON:
{
  "correct": false,
  "partial_credit": true,
  "feedback": "You're on the right track - it does change the signal's representation. But specifically, it converts from TIME domain to FREQUENCY domain. Think of it like translating a book - the content is the same but the language (domain) changes.",
  "mastery_assessment": "needs_review",
  "suggested_action": "retry_with_hint"
}
```

---

## 6. UI/UX Design Principles

### 6.1 Visual Design Philosophy
- **Minimal and clean** - No clutter, focus on content
- **Encouraging tone** - Always positive feedback, never discouraging
- **Progress visibility** - User always sees how much they've learned
- **Low friction** - Minimal clicks to start learning

### 6.2 Key UI Components

**Dashboard View:**
```
┌─────────────────────────────────────────────────────────┐
│ ECE 358 - Computer Networks          [Start Session]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Content Mastery                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━ 65%                         │
│                                                         │
│ Chapter 1: Introduction        ████████░░  80%         │
│ Chapter 2: Physical Layer      █████░░░░░  50%         │
│ Chapter 3: Data Link          ░░░░░░░░░░   0%         │
│                                                         │
│ Problem Mastery                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━ 45%                         │
│                                                         │
│ ✓ Network addressing (90%)                             │
│ ⚠ Error detection (40%) ← Focus here                   │
│ ✗ Routing protocols (0%)                               │
│                                                         │
│ [Continue Learning] [Practice Problems]                │
└─────────────────────────────────────────────────────────┘
```

**Interactive Lesson View:**
```
┌─────────────────────────────────────────────────────────┐
│ Chapter 2: Physical Layer Fundamentals                 │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ [Lesson content displayed here]                  │   │
│ │                                                  │   │
│ │ Bandwidth is like the width of a highway...     │   │
│ │                                                  │   │
│ │ Example: If a signal has frequency range...     │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ Concepts in this section:                              │
│ • Bandwidth definition [not tested yet]                │
│ • Signal-to-noise ratio [not tested yet]              │
│                                                         │
│ [🤔 Test Yourself] [Continue] [Explain More]          │
└─────────────────────────────────────────────────────────┘
```

**Check-in Question View:**
```
┌─────────────────────────────────────────────────────────┐
│ Quick Check: Bandwidth                                 │
│                                                         │
│ What determines the maximum data rate of a channel?    │
│                                                         │
│ ○ The amplitude of the signal                          │
│ ○ The bandwidth and signal-to-noise ratio              │
│ ○ The length of the transmission medium                │
│ ○ The type of encoding used                            │
│                                                         │
│ [Need a hint?]                   [Submit Answer]       │
└─────────────────────────────────────────────────────────┘

[After answer]
┌─────────────────────────────────────────────────────────┐
│ ✓ Correct!                                             │
│                                                         │
│ You're right - according to Shannon's theorem, the     │
│ maximum data rate depends on both bandwidth and SNR.   │
│                                                         │
│ Concept mastery updated: "Bandwidth" → Understood      │
│                                                         │
│ [Continue to next concept]                             │
└─────────────────────────────────────────────────────────┘
```

**Problem Practice View:**
```
┌─────────────────────────────────────────────────────────┐
│ Practice: Error Detection (2/3 consecutive correct)    │
│                                                         │
│ Problem: Calculate the CRC for message 1011 using     │
│ divisor 1101.                                          │
│                                                         │
│ [Problem statement and working area]                   │
│                                                         │
│ Your solution:                                          │
│ ┌─────────────────────────────────────────────┐       │
│ │ [User types work here]                       │       │
│ │                                              │       │
│ └─────────────────────────────────────────────┘       │
│                                                         │
│ [Show Hint] [I'm Stuck - Explain]  [Submit]          │
└─────────────────────────────────────────────────────────┘
```

### 6.3 Interaction Patterns

**"Test Yourself" Button:**
- Appears after every concept section
- Subtle, non-intrusive (doesn't block reading)
- User controls when to self-test
- Clicking shows 1-3 check-in questions

**Mistake Handling:**
```
Wrong Answer Flow:
1. "Not quite..." (encouraging tone)
2. Show where they went wrong
3. Explain concept differently (new analogy)
4. [Try a similar question] button
5. Generate easier version of same problem
6. Track attempts until 3 consecutive correct
```

**Progress Indicators:**
- Chapter progress bars (visual satisfaction)
- Concept checkmarks (✓ mastered, ⚠ needs review, ✗ not learned)
- Problem type percentages (motivates improvement)
- Session summaries ("Today you learned 5 concepts and solved 8 problems!")

---

## 7. Implementation Roadmap

### Phase 1: MVP v1.0 - Interactive Learning Core (Current)

**Goal:** User can upload materials, get interactive lessons, and track concept mastery.

**Features:**
- [ ] Remove RAG (chunks, embeddings, vector search)
- [ ] Migrate to full-document storage
- [ ] Add `concepts` and `problem_types` tables
- [ ] Implement `/documents/:id/metadata` tagging endpoint
- [ ] Build lesson generation with full-chapter context
- [ ] Create check-in question generation + evaluation
- [ ] Build interactive lesson UI with "Test Yourself" button
- [ ] Implement concept mastery tracking
- [ ] Create progress dashboard showing concept-level mastery

**Success Metrics:**
- User can complete one chapter from upload to mastery
- Check-in questions accurately assess understanding
- Dashboard shows clear progress visualization

**Timeline:** 2-3 weeks

---

### Phase 2: Problem Solving & Mastery (Next Iteration)

**Goal:** Add problem-solving practice with adaptive difficulty and re-testing.

**Features:**
- [ ] Problem type identification from tutorials/exams
- [ ] Problem generation using course materials as templates
- [ ] Solution submission and evaluation
- [ ] Immediate mastery re-testing (3 consecutive correct)
- [ ] Problem-type mastery tracking dashboard
- [ ] Adaptive problem difficulty

**Success Metrics:**
- User can practice until mastery on any problem type
- System accurately identifies when user has mastered a technique
- Problem generation matches course style/notation

**Timeline:** 2-3 weeks

---

### Phase 3: Auto-Organization & Intelligence (Future)

**Goal:** Reduce manual work, auto-detect structure, smarter adaptive learning.

**Features:**
- [ ] Auto-detect chapters from textbook TOC (using GPT-4o-mini)
- [ ] Auto-split lectures by week
- [ ] Auto-identify problem types from past exams
- [ ] Suggested study order based on exam date
- [ ] Weak area auto-remediation
- [ ] Study plan generator ("You have 2 weeks, here's your daily plan")

**Success Metrics:**
- Upload entire course → app auto-structures everything
- App creates optimal study plan based on time remaining
- Adapts plan based on user's learning speed

**Timeline:** 3-4 weeks

---

### Phase 4: Enhanced Engagement (Future)

**Goal:** Make learning more engaging and visual.

**Features:**
- [ ] Visual concept maps (generated by LLM)
- [ ] Animated diagrams for complex topics
- [ ] Voice tutoring mode (Realtime API)
- [ ] Gamification (streaks, achievements, XP)
- [ ] Spaced repetition for long-term retention
- [ ] Mock exam generator (timed, full-length)

**Success Metrics:**
- Users study more frequently (engagement)
- Higher retention rates (spaced repetition validation)
- Users report more enjoyment vs traditional studying

**Timeline:** 4-6 weeks

---

## 8. Current Technical Status (As of Nov 3, 2025)

### What's Built
✅ PostgreSQL + pgvector database
✅ PDF upload and text extraction
✅ User authentication with Clerk
✅ Gemini 2.0 Flash API integration
✅ Lesson generation endpoint (but uses RAG)
✅ MCQ generation endpoint (but uses RAG)
✅ Multi-tenant row-level security
✅ Frontend with Next.js + React
✅ API proxy routes for auth

### What Needs to Change (for MVP v1.0)
🔄 **Remove RAG Architecture:**
- Delete `chunks` table and vector operations
- Store full text per document instead
- Remove pgvector extension dependency
- Update lesson generation to use full-chapter context

🔄 **Add Mastery Tracking:**
- Create `concepts` table
- Create `problem_types` table
- Create `study_sessions` table
- Build mastery state tracking logic

🔄 **Refactor Lesson Generation:**
- Change from search-based to chapter-based
- Add check-in question generation
- Add concept extraction from lessons
- Implement answer evaluation

🔄 **Build Interactive UI:**
- Create lesson view with "Test Yourself" button
- Build check-in question modal
- Create progress dashboard with concept/problem mastery
- Add material tagging interface

### Migration Path
1. **Database Migration:**
   - Add new tables (`concepts`, `problem_types`, `study_sessions`)
   - Add `full_text` column to `documents`
   - Keep existing tables temporarily for safe migration
   - Backfill full text from existing PDFs

2. **API Refactor:**
   - Create new `/lessons/generate` endpoint (chapter-based)
   - Deprecate old `/study/lesson` endpoint (RAG-based)
   - Add `/check-ins/evaluate` endpoint
   - Keep old endpoints until frontend migrates

3. **Frontend Updates:**
   - Add material tagging on upload
   - Build new interactive lesson component
   - Create progress dashboard
   - Migrate study page to use new APIs

---

## 9. Key Design Decisions & Rationale

### Decision 1: Remove RAG
**Rationale:**
- Course materials are small (500 pages = ~1M tokens max)
- Gemini 2.0 context window is 1M tokens
- Chunking destroys document structure (chapters, sections)
- Simpler architecture = faster iteration
- We're not doing open-ended search, we're doing structured learning

**Trade-offs:**
- ✅ Simpler code, easier to debug
- ✅ Preserves document structure
- ✅ Better semantic understanding (LLM sees full chapter)
- ❌ Can't scale beyond 1M tokens (not a problem for MVP)
- ❌ Higher API costs per request (acceptable for MVP)

### Decision 2: Dual Mastery Tracking
**Rationale:**
- Learning has two distinct dimensions:
  1. Understanding concepts (theoretical knowledge)
  2. Solving problems (applied skills)
- Separating these allows targeted remediation
- User might understand convolution but struggle to solve convolution problems

**Implementation:**
```
Concept Mastery: Binary states (learned vs not learned)
Problem Mastery: Percentage (based on success rate)
```

### Decision 3: Immediate Re-testing (not Spaced Repetition)
**Rationale:**
- MVP focuses on cramming (2 weeks until exam)
- Spaced repetition is for long-term retention
- Immediate mastery ensures user truly understands before moving on
- Simpler to implement (no scheduling algorithm needed)

**Future:** Add spaced repetition in Phase 4 for long-term courses

### Decision 4: User-Defined Tagging (not Auto-Detection)
**Rationale:**
- Auto-detection requires additional LLM calls (cost)
- Auto-detection can be wrong (user has to correct anyway)
- User knows the structure better than LLM
- Simpler MVP implementation

**Future:** Add auto-detection in Phase 3 as optional feature

---

## 10. Success Metrics

### MVP v1.0 Success Criteria
1. **Completion Rate:** ≥60% of users who upload materials complete at least 1 chapter
2. **Accuracy:** Check-in evaluation correctly assesses understanding ≥85% of the time
3. **Engagement:** Users return for ≥3 study sessions
4. **Progress Tracking:** Mastery dashboard accurately reflects learning state
5. **User Satisfaction:** "Would you recommend this app?" ≥7/10

### Long-term Success Metrics (Post-MVP)
- **Exam Performance:** Users report improved exam grades vs previous attempts
- **Retention:** Users continue using app across multiple courses
- **Time Efficiency:** Users learn material 30% faster than traditional studying
- **Completion:** Users finish studying entire course before exam

---

## 11. Competitive Analysis

### vs. ChatGPT
**What we do better:**
- ✅ Course-aware (knows YOUR course materials)
- ✅ Tracks YOUR specific progress
- ✅ Adapts to YOUR weak areas
- ✅ Maintains learning state across sessions
- ✅ Structured learning path (not just Q&A)

**What ChatGPT does better:**
- ❌ More general knowledge
- ❌ Better at creative explanations
- ❌ No upload needed
- ❌ More mature product

**Our moat:** Persistent learning state + course-specific adaptation

### vs. Brilliant.org
**What we do better:**
- ✅ Works for ANY course (upload your materials)
- ✅ Uses YOUR professor's notation
- ✅ Adapts to YOUR learning speed
- ✅ Focuses on YOUR exam content

**What Brilliant does better:**
- ❌ Human-designed, polished content
- ❌ Beautiful visualizations
- ❌ Gamification and engagement
- ❌ Established brand

**Our moat:** Dynamic content generation for any course

### vs. Quizlet / Anki
**What we do better:**
- ✅ AI-generated content (no manual card creation)
- ✅ Adaptive learning path
- ✅ Full explanations (not just flashcards)
- ✅ Problem-solving practice

**What they do better:**
- ❌ Established user base
- ❌ Simpler UX
- ❌ Mobile-first

**Our moat:** Full learning journey, not just memorization

---

## 12. Risk Assessment

### Technical Risks
1. **LLM Costs**
   - **Risk:** Full-context API calls are expensive
   - **Mitigation:** Start with small user base, monitor costs, optimize prompts
   - **Backup:** Fall back to chunking if costs exceed budget

2. **LLM Accuracy**
   - **Risk:** Check-in evaluation might be inaccurate
   - **Mitigation:** Test evaluation accuracy on real student answers, tune prompts
   - **Backup:** Allow manual override ("I think my answer was correct")

3. **Content Extraction Quality**
   - **Risk:** PDFs might have poor text extraction (images, formulas)
   - **Mitigation:** Warn users about PDFs with poor extraction quality
   - **Backup:** Allow manual text editing/correction

### Product Risks
1. **User Upload Friction**
   - **Risk:** Users abandon during upload/tagging
   - **Mitigation:** Make tagging optional, provide defaults
   - **Backup:** Add "quick start" with example course

2. **Value Proposition Not Clear**
   - **Risk:** Users don't see why this is better than ChatGPT
   - **Mitigation:** Strong onboarding, show progress tracking immediately
   - **Backup:** Focus on one killer feature (e.g., problem mastery)

3. **Time-to-Value Too Long**
   - **Risk:** Users expect instant value, but need to upload everything first
   - **Mitigation:** Allow "start learning" with partial uploads
   - **Backup:** Provide sample course for immediate trial

### Market Risks
1. **ChatGPT Adds This Feature**
   - **Risk:** OpenAI adds persistent learning state to ChatGPT
   - **Mitigation:** Move fast, build moat through user data and specialization
   - **Backup:** Pivot to B2B (sell to universities)

2. **User Privacy Concerns**
   - **Risk:** Users don't want to upload copyrighted course materials
   - **Mitigation:** Clear privacy policy, encrypt uploads, allow deletion
   - **Backup:** Support URL imports (YouTube lectures, open courseware)

---

## 13. Development Guidelines for Future Devs

### When Reading This Document
1. **Start here:** Understand the core user story (Section 1)
2. **Check current status:** See what's built vs what needs to change (Section 8)
3. **Reference API design:** Use Section 5 as source of truth for endpoints
4. **Follow data model:** Section 3.3 defines the database schema
5. **Understand decisions:** Section 9 explains why we made key choices

### When Building Features
1. **Always ask:** "Does this help the user learn faster or understand better?"
2. **Default to simple:** If a feature adds complexity, justify it
3. **Test with real course materials:** Use actual textbooks/exams, not dummy data
4. **Optimize for the struggling student:** Our user hasn't attended lectures and is overwhelmed

### When Making Changes
1. **Update this document first:** Design before coding
2. **Get user feedback:** Talk to actual students before big changes
3. **Maintain backward compatibility:** Old uploads should still work
4. **Log everything:** User interactions are valuable for improving prompts

### Code Organization
```
backend/
├── src/
│   ├── routes/
│   │   ├── documents.js    # Upload, tagging, metadata
│   │   ├── lessons.js      # Lesson generation (NEW)
│   │   ├── check-ins.js    # Check-in Q&A (NEW)
│   │   ├── problems.js     # Problem generation (NEW)
│   │   └── progress.js     # Mastery tracking (NEW)
│   ├── services/
│   │   ├── lesson-generator.js
│   │   ├── mastery-tracker.js
│   │   └── problem-generator.js
│   ├── db/
│   │   ├── models/
│   │   │   ├── concepts.js
│   │   │   └── problem-types.js
│   │   └── migrations/
│   │       └── 20251104_remove_rag.sql
│   └── prompts/
│       ├── lesson-generation.txt
│       ├── check-in-evaluation.txt
│       └── problem-generation.txt

frontend/
├── src/
│   ├── components/
│   │   ├── LessonView.tsx      # Interactive lesson UI
│   │   ├── CheckInModal.tsx    # Check-in questions
│   │   ├── ProgressDashboard.tsx
│   │   └── ProblemWorkspace.tsx
│   ├── pages/
│   │   ├── upload.tsx
│   │   ├── study.tsx
│   │   └── progress.tsx
│   └── lib/
│       └── api.ts  # API client with new endpoints
```

---

## 14. Frequently Asked Questions

**Q: Why not use spaced repetition like Anki?**
A: MVP targets students cramming for exams (2 weeks out). Spaced repetition is for long-term retention. We'll add it in Phase 4 for semester-long use.

**Q: Why remove RAG if it's already built?**
A: RAG adds complexity without value for course-sized materials. Full-context is simpler, preserves structure, and works better with Gemini 2.0's 1M token window.

**Q: How do you prevent users from uploading copyrighted textbooks?**
A: We don't host or redistribute. User uploads are private, encrypted, and deletable. Similar to Dropbox/Google Drive. Include clear ToS.

**Q: What if PDF extraction is poor (formulas, diagrams)?**
A: MVP focuses on text-heavy courses. Future: Add OCR, allow manual text editing, support image understanding via multimodal models.

**Q: How do you make money?**
A: MVP is free (validation phase). Future: Freemium (1 course free, unlimited paid), university licensing, B2B API.

**Q: Why Gemini instead of OpenAI?**
A: 1M token context window, cheaper per token, JSON mode support. OpenAI's context window is smaller (128k for GPT-4).

**Q: What if users just paste materials into ChatGPT instead?**
A: They can. Our moat is persistent learning state, progress tracking, adaptive practice, and course-specific problem generation. ChatGPT is stateless.

---

## 15. Conclusion & Next Actions

### Vision Summary
Ultudy helps students who haven't attended lectures pass their exams by transforming overwhelming course materials into an adaptive, encouraging learning journey. We track what they know, identify what they struggle with, and help them practice until mastery.

### Immediate Next Steps (MVP v1.0)
1. **Database Migration** - Remove RAG, add mastery tracking tables
2. **Refactor Lesson Generation** - Use full-chapter context
3. **Build Check-in System** - Question generation + evaluation
4. **Create Interactive UI** - Lesson view with "Test Yourself" button
5. **Build Progress Dashboard** - Concept + problem mastery visualization

### Long-term Vision
A comprehensive AI study companion that:
- Auto-organizes any course materials
- Generates personalized study plans
- Provides interactive problem-solving practice
- Visualizes concepts dynamically
- Adapts to each student's learning style
- Proves students learn 30% faster than traditional methods

---

**Document Status:** Living document - update as product evolves
**Owner:** Product team
**Last Reviewed:** November 3, 2025
**Next Review:** After MVP v1.0 launch
