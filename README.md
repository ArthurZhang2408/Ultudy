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

### Local database & backend
```bash
docker compose up -d db
cp backend/.env.example backend/.env
# (DATABASE_URL already matches compose)
cd backend
npm ci
npm run check:pgvector  # optional: verifies whether IVFFLAT/HNSW indexes support 3072 dimensions
npm run migrate
npm run dev
# check: curl http://localhost:3001/db/health
```

```bash
# Upload a PDF (stored under backend/storage/<uuid>.pdf)
curl -F file=@/path/to/file.pdf http://localhost:3001/upload/pdf
# Search across embedded chunks
curl "http://localhost:3001/search?q=Fourier%20transform"
```

The compatibility probe logs which index type (if any) will be created so you can adjust expectations locally. Once the backend is running with a configured database, you can verify connectivity at [`/db/health`](http://localhost:3001/db/health). If you skip creating a `.env` file, the backend automatically falls back to `postgresql://postgres:postgres@localhost:5432/study_app` in non-production environments, so make sure the Docker Compose database is up before starting the server.

### Embeddings provider configuration
- `EMBEDDINGS_PROVIDER=mock` (default) generates deterministic pseudo-embeddings for local development and automated tests. No external services are required.
- To switch to OpenAI embeddings locally, set `EMBEDDINGS_PROVIDER=openai` and supply an `OPENAI_API_KEY` in `backend/.env`, then restart the backend server. The code path is stubbed so CI never invokes the OpenAI API.

## Contributing / Workflow
This repo will be developed with OpenAI **Codex** (agent) creating PRs from plans.
All merges require human review.

## License
MIT — see [`LICENSE`](./LICENSE)
