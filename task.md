# Dynamic AI Study Guide App — `task.md`

This document is the **single source of truth** for building the AI-powered dynamic study guide app. It consolidates research, implementation plans, MVP milestones, future roadmap, and task breakdowns.

---

## 1. Vision Overview

### Goal
Create an AI-driven study companion that converts **any uploaded course materials** (e.g., lecture notes, slides, tutorials, past exams) into an **interactive, adaptive learning experience**. The app helps students:
- Understand complex content efficiently.
- Practice problem-solving interactively.
- Retain knowledge through active recall and spaced repetition.
- Feel engaged and encouraged while studying.

### Core Principle
> "Turn static, overwhelming course materials into an active learning journey tailored to each student — dynamically, for any subject."

The system is not prebuilt for a specific topic (unlike Brilliant.org) but **dynamically adapts to any subject** via file uploads.

---

## 2. MVP Scope

### MVP Core Features
| Feature | Description |
|----------|--------------|
| **File Upload** | Support PDF uploads (lecture notes, slides, tutorials, past exams). |
| **Text Extraction** | Extract and clean text content from PDFs using PyMuPDF or pdfminer. |
| **Chunking & Embeddings** | Break extracted text into ~900-token overlapping chunks. Embed with `text-embedding-3-large`. Store vectors in pgvector. |
| **Vector Search** | Retrieve most relevant chunks using cosine similarity for user queries. |
| **Study Modes** | Implement 3 core modes: (1) *Lesson Mode* (summaries + guided explanation), (2) *Practice Mode* (MCQs + stepwise hints), (3) *Review Mode* (flashcards + spaced repetition). |
| **Interactive Socratic Tutor** | Model generates hints and questions before giving full answers. Encouraging tone and adaptive difficulty. |
| **Progress Tracking** | Track completed topics, quiz scores, and weak areas. |

### MVP Tech Stack
- **Frontend:** React / Next.js (Vite optional)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL + pgvector extension
- **LLM APIs:** OpenAI Responses API + Embeddings API
- **File Processing:** pdfminer or PyMuPDF
- **Deployment:** Render / Railway / Fly.io (MVP hosting)

---

## 3. System Architecture

```
User ─┬─> Frontend (React/Next.js)
       │        │
       │        └──> Upload PDFs / Chat / Quiz UI
       │
       └─> Backend (Node.js Express)
                 │
                 ├── Text Extraction → Chunking → Embeddings
                 │
                 ├── pgvector (semantic retrieval)
                 │
                 ├── Responses API (LLM Generation)
                 │
                 └── User Progress DB (Postgres)
```

---

## 4. Detailed Component Breakdown

### 4.1 Ingestion Pipeline
- Extract text from PDF (PyMuPDF).
- Chunk text into overlapping 900-token segments.
- Embed each chunk via `text-embedding-3-large`.
- Store: `{id, doc_id, page_range, text, embedding}`.

### 4.2 Retrieval Layer
- Accepts a query or topic.
- Embeds query → vector search (`<=>` cosine similarity) on pgvector.
- Returns top 8 chunks for context.

### 4.3 Lesson Generation (Study Mode 1)
- Input: Retrieved chunks.
- Output: Structured response with
  - TL;DR summary
  - Step-by-step breakdown
  - Intuitive analogy
  - 1–2 check-in questions.

**Prompt Template:**
```
You are a tutor. Teach the user this topic using the following structure:
1. 3-bullet TL;DR summary
2. Intuitive explanation
3. Small analogy/example
4. One check-in question
```

### 4.4 Practice Mode (Study Mode 2)
- Generate MCQs + rationale using retrieved chunks.
- Store each question and track correctness.

**Prompt Template:**
```
Using only Context, generate 5 MCQs (A–D) on {topic}. Mark correct answer with (*). Give a 1-sentence rationale per question.
```

### 4.5 Review Mode (Study Mode 3)
- Auto-generate flashcards from definitions/formulas.
- Use spaced repetition scheduling (SM-2 algorithm).
- Daily reminders for due cards.

### 4.6 Progress Tracking
- Each quiz result updates `mastery(topic, strength)`.
- Weakest topics → more practice.
- Visualization: heatmap or progress bar.

---

## 5. User Experience Principles

| Principle | Implementation |
|------------|----------------|
| **Non-discouraging tone** | Tutor uses positive reinforcement, gives hints first, avoids judgment. |
| **Engaging feedback** | Visual progress, confetti rewards, streaks. |
| **Clear progress path** | Study roadmap generated from uploaded materials. |
| **Active recall** | Regular quizzes, flashcards, mock exams. |
| **Personalization** | Adaptive difficulty and targeted review scheduling. |

---

## 6. Future Feature Roadmap

| Stage | Feature | Description |
|--------|----------|--------------|
| **Phase 2** | Multi-format Upload | Add PowerPoint, Word, image (OCR) support. |
| | Voice Tutor | Real-time verbal explanations via Realtime API. |
| | Visual Learning | AI-generated diagrams and flowcharts. |
| **Phase 3** | Collaborative Study | Share topic sets with friends or groups. |
| | Exam Simulation | Timed full-length mock exams with grading + feedback. |
| | Gamified Leaderboards | Friendly competitions and social achievements. |
| **Phase 4** | Full AI Agent | Auto-plan study schedules, monitor progress, adapt to upcoming exams. |

---

## 7. Integration with OpenAI Tools

| Function | API Used |
|-----------|-----------|
| Text Summaries, Lessons, Quizzes | **Responses API** |
| Chunk Retrieval | **Embeddings API** (text-embedding-3-large) |
| Vector Database | **pgvector** |
| PDF Uploads (optional) | **Files API** |
| Voice Tutoring (future) | **Realtime API** |

---

## 8. Development Roadmap (Task Breakdown)

### **Phase 1: MVP (Core Functionality)**
1. **Setup & Infrastructure**
   - [ ] Create repo, install Node + React.
   - [ ] Setup PostgreSQL + pgvector.
   - [ ] Initialize OpenAI API client.
2. **PDF Upload & Extraction**
   - [ ] Implement upload endpoint.
   - [ ] Extract text using PyMuPDF.
3. **Chunk & Embed**
   - [ ] Write chunking utility.
   - [ ] Store vectors in pgvector.
4. **Semantic Retrieval API**
   - [ ] Implement `/search` endpoint.
5. **Lesson Mode**
   - [ ] Integrate with Responses API.
   - [ ] Prompt tuning for teaching tone.
6. **Practice Mode**
   - [ ] Implement MCQ generator.
   - [ ] Store and evaluate user answers.
7. **Review Mode (Flashcards)**
   - [ ] Generate flashcards.
   - [ ] Implement SM-2 spaced repetition scheduling.
8. **Frontend**
   - [ ] Upload + chat UI.
   - [ ] Study mode switcher.
   - [ ] Progress visualization.
9. **Testing & QA**
   - [ ] Unit tests (Jest).
   - [ ] Integration tests for API routes.
10. **Deployment**
   - [ ] Deploy backend (Render/Fly.io).
   - [ ] Deploy frontend (Vercel).

### **Phase 2: Engagement & Intelligence**
1. **Adaptive Feedback Loop** – Model adjusts question difficulty by performance.
2. **Visual Summaries** – Generate mind maps and diagrams.
3. **Voice Mode** – Add realtime voice tutoring via OpenAI Realtime API.
4. **Multi-file Integration** – Support slides, docs, and images.

### **Phase 3: Social & Personalization**
1. **Collaborative Study Groups.**
2. **Leaderboards & Challenges.**
3. **Exam Simulation Center.**

---

## 9. Codex Integration Plan (Development Automation)

Use **OpenAI Codex** for development tasks:
- **Task generation:** Use Codex `/plan` to scaffold files, write endpoints, or tests.
- **Code review:** Enable code review mode for security + performance checks.
- **Docs generation:** Ask Codex to summarize each module for the repo README.
- **Local integration:** Run Codex CLI in your terminal for pair programming.

Example tasks to assign to Codex:
1. *"Add PDF upload route with Multer, validate size <50MB."*
2. *"Implement embedding pipeline with OpenAI API and pgvector."*
3. *"Write Jest tests for /lesson route, mocking OpenAI API calls."*

---

## 10. Research-Based Design Summary

| Finding | Implementation in App |
|----------|------------------------|
| **Active recall improves retention** | Frequent AI-generated quizzes + flashcards. |
| **Socratic questioning enhances understanding** | Tutor mode that asks before telling. |
| **Immediate feedback accelerates learning** | AI instantly checks answers and explains mistakes. |
| **Gamification sustains motivation** | Streaks, badges, progress maps. |
| **Adaptive difficulty reduces frustration** | Personalized difficulty scaling and check-ins. |

---

## 11. Ethical & Academic Integrity Safeguards
- App never writes direct exam answers.
- Focuses on *understanding* and *practice*, not plagiarism.
- Stores data securely; easy user data deletion.

---

## 12. Deliverables Summary

### **By End of MVP**
- [ ] Functional web app (React + Node backend).
- [ ] PDF ingestion and vector search.
- [ ] Lesson, Practice, Review modes.
- [ ] Progress tracking dashboard.
- [ ] Deployed to public demo domain.

### **By End of v1.0 (Next Milestone)**
- [ ] Adaptive tutor.
- [ ] Visual summaries.
- [ ] Voice tutoring.

---

## 13. Folder Structure (Target)
```
root/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── utils/
│   │   ├── db/
│   │   └── services/
│   ├── tests/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── hooks/
│   └── package.json
├── db/
│   ├── migrations/
│   └── seed/
├── prompts/
│   ├── lesson.txt
│   ├── quiz.txt
│   └── flashcard.txt
└── task.md  ← (this file)
```

---

## 14. Next Steps
1. Confirm MVP scope ✅
2. Generate `repo scaffold` with Codex or manual setup.
3. Implement **Phase 1 tasks** (starting with ingestion + embeddings).
4. Test RAG retrieval quality.
5. Add UI for study modes.
6. Expand gradually toward adaptive learning.

---

> **Reminder:** This `task.md` is the canonical document for the project. Update it with all new decisions, API routes, and prompts as development progresses.

