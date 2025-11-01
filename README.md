# Dynamic AI Study Guide App

An AI-powered study companion that transforms uploaded course PDFs into:
- **Lessons** — clear summaries, analogies, and quick check‑ins
- **Practice** — MCQs with hints and rationales
- **Review** — flashcards with spaced repetition (SM‑2)

## Quick Links
- 📜 Project spec & roadmap: [`task.md`](./task.md)
- 🧭 High-level milestones: [`milestone.md`](./milestone.md)

## MVP Tech
- **Frontend:** React / Next.js
- **Backend:** Node.js / Express
- **Database:** PostgreSQL + pgvector
- **AI:** OpenAI Responses + Embeddings

## Getting Started
> This section will be filled in Milestone 1 when we scaffold the apps.
```bash
# coming soon
```

### Local run (backend)
```bash
cd backend
cp .env.example .env
npm ci
npm run dev
```

### Run database locally
```bash
docker compose up -d db
```

### Run migrations
```bash
cp backend/.env.example backend/.env
# Update backend/.env if needed
cd backend
npm run migrate
```

Once the backend is running with a configured database, you can verify connectivity at [`/db/health`](http://localhost:3001/db/health).

## Contributing / Workflow
This repo will be developed with OpenAI **Codex** (agent) creating PRs from plans.
All merges require human review.

## License
MIT — see [`LICENSE`](./LICENSE)
