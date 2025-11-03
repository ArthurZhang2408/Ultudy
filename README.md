# Dynamic AI Study Guide App

An AI-powered study companion that transforms uploaded course PDFs into:
- **Lessons** — clear summaries, analogies, and quick check‑ins
- **Practice** — MCQs with hints and rationales
- **Review** — flashcards with spaced repetition (SM‑2)

- 🔐 Authentication setup: [`CLERK_SETUP.md`](./CLERK_SETUP.md)
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
# Upload a PDF (stored under backend/storage/<user_id>/<uuid>.pdf)
curl -H "X-User-Id: 00000000-0000-0000-0000-000000000001" -F file=@/path/to/file.pdf http://localhost:3001/upload/pdf
# Search across embedded chunks
curl -H "X-User-Id: 00000000-0000-0000-0000-000000000001" "http://localhost:3001/search?q=Fourier%20transform"
```

### Authentication & multi-tenant request scoping
- `AUTH_MODE=dev` (default) keeps the existing `X-User-Id` header workflow. Supply a UUID per request; when it is omitted the shared dev ID `00000000-0000-0000-0000-000000000001` is applied automatically for local testing.
- `AUTH_MODE=jwt` enables bearer token authentication. The backend verifies signatures via the configured JWKS (`AUTH_JWT_JWKS_URL`) and, if provided, enforces the issuer (`AUTH_JWT_ISS`) and audience (`AUTH_JWT_AUD`) claims. The verified token’s `sub` claim becomes the effective user id.

Example requests:

```bash
# dev header mode
U1=00000000-0000-0000-0000-000000000001
curl -H "X-User-Id: $U1" -F file=@/path/to/file1.pdf http://localhost:3001/upload/pdf
curl -H "X-User-Id: $U1" "http://localhost:3001/search?q=introduction&k=5"

# JWT mode
TOKEN="$(cat /path/to/token.jwt)"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/search?q=introduction&k=5"
```

Configure JWT mode by setting the env vars in `backend/.env`:

```bash
AUTH_MODE=jwt
AUTH_JWT_ISS=https://<your-issuer>/
AUTH_JWT_AUD=<expected-audience>
AUTH_JWT_JWKS_URL=https://<your-issuer>/.well-known/jwks.json
```

#### Database enforcement with RLS
- Every request that touches tenant data runs inside `withTenant(userId, fn)` (`backend/src/db/tenant.js`). The helper opens a transaction, sets the Postgres session GUC `app.user_id`, and ensures all queries use the same client.
- Postgres row-level security is enabled on the `documents` and `chunks` tables. Policies only expose rows where `owner_id::text = current_setting('app.user_id', true)` and reject inserts/updates with mismatched owners.
- Application-level filters remain for redundancy, but the database is now the source of truth for isolation. When adding new queries, always wrap them with `withTenant()` (or its `runAs` shortcut) so the RLS policies can evaluate the correct tenant context.

The compatibility probe logs which index type (if any) will be created so you can adjust expectations locally. Once the backend is running with a configured database, you can verify connectivity at [`/db/health`](http://localhost:3001/db/health). If you skip creating a `.env` file, the backend automatically falls back to `postgresql://postgres:postgres@localhost:5432/study_app` in non-production environments, so make sure the Docker Compose database is up before starting the server.

### Study endpoints
Turn retrieved chunks into lessons or multiple-choice practice scoped to the requesting user. The mock LLM provider is enabled by default so responses are deterministic in development.

```bash
# Lesson (scoped to user)
U=00000000-0000-0000-0000-000000000001
curl -s -H "X-User-Id: $U" -H "Content-Type: application/json" \
  -d '{"query":"Fourier transform basics","k":6}' \
  http://localhost:3001/study/lesson | jq .

# MCQs
curl -s -H "X-User-Id: $U" -H "Content-Type: application/json" \
  -d '{"topic":"signals","n":5,"difficulty":"med"}' \
  http://localhost:3001/practice/mcq | jq .
```

### Frontend MVP

The Milestone 5 frontend lives in [`frontend/`](./frontend) and provides upload, search, and study flows against the existing backend APIs.

#### Prerequisites

- Node.js 20+
- Backend running locally at `http://localhost:3001`

#### Setup & development server

```bash
cd frontend
cp -n .env.local.example .env.local
# (optional) adjust NEXT_PUBLIC_BACKEND_URL to match your backend origin
npm ci
npm run dev
# visit http://localhost:3000
```

When the dev server loads:

1. Enter a UUID in the header bar and press **Save**. This value is stored in `localStorage` and sent as the `X-User-Id` header on every request (defaults to the shared dev user ID).
2. Use the navigation links to upload PDFs, run searches, and generate lessons or MCQs. Responses display inline as structured text.

> **Upload size limit:** the frontend respects the backend's `multer` configuration. Large PDFs above the backend limit will fail with a 413 response.

#### Building for production

```bash
cd frontend
npm run typecheck
npm run build
```

### Embeddings provider configuration
- `EMBEDDINGS_PROVIDER=mock` (default) generates deterministic pseudo-embeddings for local development and automated tests. No external services are required.
- To switch to OpenAI embeddings locally, set `EMBEDDINGS_PROVIDER=openai` and supply an `OPENAI_API_KEY` in `backend/.env`, then restart the backend server. The code path is stubbed so CI never invokes the OpenAI API.
- `LLM_PROVIDER=mock` (default) keeps lesson and MCQ generation offline. Set `LLM_PROVIDER=openai` with a valid `OPENAI_API_KEY` to enable OpenAI-powered outputs outside CI.

## Contributing / Workflow
This repo will be developed with OpenAI **Codex** (agent) creating PRs from plans.
All merges require human review.

## License
MIT — see [`LICENSE`](./LICENSE)
