# Milestones for the Dynamic AI Study Guide App

This file is a **high‑level roadmap**. We’ll use it to keep our bearings while executing micro‑steps.

---

## Milestone 0 — Repo Bootstrap (Today)
- Create foundational files: `README.md`, `LICENSE`, `.gitignore`, `task.md` (already added), and `milestone.md` (this file).
- Configure Git remotes, branch protection (later), and first commit.

**Exit criteria:** Repo has the four docs above, clean ignores, license chosen (MIT), and pushed to `main`.

---

## Milestone 1 — Project Scaffolding
- Backend: Node/Express skeleton, TypeScript optional; env config; health route.
- Frontend: Next.js minimal pages (Upload / Study / Progress).
- Docker/devcontainer and GitHub Actions CI (build + test).

**Exit criteria:** `npm run dev` works for both apps; CI green on PR.

---

## Milestone 2 — Data Layer
- Postgres with `pgvector`.
- Migrations for `documents`, `chunks`, `cards`, `quiz_runs`, `mastery`.

**Exit criteria:** `npm run migrate` creates schema locally and in CI.

---

## Milestone 3 — Ingestion Pipeline
- PDF upload endpoint + storage.
- Text extraction (PyMuPDF worker) → chunking (≈900 tokens, 10% overlap) → embeddings → pgvector insert.

**Exit criteria:** Uploading a PDF produces rows in `documents` and `chunks` with vectors.

---

## Milestone 4 — Retrieval & Study Modes
- `/search` returns top‑K chunks.
- `/study/lesson` (Responses API) and `/practice/mcq` (MCQs + rationales).
- Flashcards generation + SM‑2 scheduler endpoints.

**Exit criteria:** Basic lesson, practice, and review flows functional via simple UI.

---

## Milestone 5 — UX + Progress
- Add mastery tracking, progress view, non‑discouraging tutor tone.

**Exit criteria:** Can study a topic end‑to‑end; progress visibly updates.

---

## Milestone 6 — Codex Automation
- Connect repo to Codex; run Plan → Implement → PR cycles for features.

**Exit criteria:** At least one feature PR created and merged via Codex.

