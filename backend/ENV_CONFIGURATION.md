# Environment Variable Configuration

## Current Settings (`.env`)

### PDF Upload Strategy

**`PDF_UPLOAD_STRATEGY=vision`** (RECOMMENDED - NEW)

Uses Gemini vision model to extract structured sections directly from PDF.

**How it works:**
1. Frontend calls `/upload/pdf-structured`
2. Backend sends PDF to Gemini vision model
3. LLM returns structured JSON with sections
4. Each section stored with its own markdown

**Advantages:**
- ✅ Single LLM call does everything
- ✅ Faithful conversion (math, tables, formatting)
- ✅ Intelligent section detection
- ✅ No overlapping sections
- ✅ Clean markdown boundaries

**Settings:**
```env
PDF_UPLOAD_STRATEGY=vision
GEMINI_VISION_MODEL=gemini-2.0-flash-exp
GEMINI_VISION_TEMPERATURE=0.4
```

---

**`PDF_UPLOAD_STRATEGY=python`** (OLD - DEPRECATED)

Uses Python PDF extraction → markdown conversion → section splitting.

**How it works:**
1. Frontend calls `/upload/pdf`
2. Backend uses Python to extract text
3. Converts to markdown
4. Later: LLM extracts sections
5. Later: Split markdown by section boundaries

**Settings:**
```env
PDF_UPLOAD_STRATEGY=python
PDF_EXTRACTION_MODE=enhanced  # or 'auto' or 'standard'
SKIP_EMBEDDINGS=true
```

---

## Gemini Configuration

### API Key
```env
GEMINI_API_KEY=your-key-here
```
**Required for all Gemini operations.**

### Vision Model (for PDF extraction)
```env
GEMINI_VISION_MODEL=gemini-2.0-flash-exp
GEMINI_VISION_TEMPERATURE=0.4
```

**Models available:**
- `gemini-2.0-flash-exp` - Fast, cost-effective (recommended)
- `gemini-1.5-pro` - More accurate but slower/expensive
- `gemini-1.5-flash` - Balance of speed and quality

### Generation Model (for concepts)
```env
GEMINI_GEN_MODEL=gemini-2.0-flash-exp
```

Used for lesson/concept generation from section markdown.

### Embeddings Model (legacy RAG)
```env
GEMINI_EMBED_MODEL=gemini-embedding-001
GEMINI_EMBED_DIM=3072
SKIP_EMBEDDINGS=true
```

**Note:** Embeddings are optional with the new architecture. Set `SKIP_EMBEDDINGS=true` to avoid quota issues.

---

## Database Configuration

### Primary Database Connection

**Option 1: Connection String** (Recommended)
```env
DATABASE_URL=postgresql://user:password@host:5432/database
```

**Option 2: Individual Parameters**
```env
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your-password
PGDATABASE=study_app
```

### Read Replica (Optional - For Scaling)

**`DATABASE_REPLICA_URL`** - Routes read queries to a separate database replica

```env
DATABASE_REPLICA_URL=postgresql://user:password@replica-host:5432/database
```

**When to use:**
- 5,000+ concurrent users
- Read-heavy workload (lots of SELECT queries)
- Need to scale beyond single database server

**How it works:**
- All `queryRead()` calls route to replica
- All `queryWrite()` calls route to primary
- Automatic fallback to primary if replica not configured

**Setup with AWS RDS:**
1. AWS Console → RDS → Your database → Actions → Create read replica
2. Wait for replica to sync (10-20 minutes)
3. Copy replica endpoint URL
4. Add to `.env` as `DATABASE_REPLICA_URL`
5. Restart backend

**Benefits:**
- 2-10x more read capacity
- Primary database handles only writes
- Can add multiple replicas for global reach

### Connection Pool Settings

```env
DB_POOL_MAX=100              # Max connections per pool (default: 100)
DB_POOL_MIN=10               # Min connections per pool (default: 10)
DB_IDLE_TIMEOUT=30000        # Close idle connections after 30s
DB_CONNECT_TIMEOUT=10000     # Connection timeout: 10s
DB_STATEMENT_TIMEOUT=60000   # Query timeout: 60s
```

**Capacity guidelines:**
- `DB_POOL_MAX=20` → ~200 concurrent users
- `DB_POOL_MAX=100` → ~1,000 concurrent users (current)
- `DB_POOL_MAX=200` → ~2,000 concurrent users (with replica)

**Note:** If using read replica, both primary and replica pools use these same settings.

---

## Quick Reference

### To use NEW vision-based extraction:
```env
PDF_UPLOAD_STRATEGY=vision
GEMINI_VISION_MODEL=gemini-2.0-flash-exp
GEMINI_VISION_TEMPERATURE=0.4
GEMINI_API_KEY=your-key-here
```

### To use OLD Python extraction:
```env
PDF_UPLOAD_STRATEGY=python
PDF_EXTRACTION_MODE=enhanced
SKIP_EMBEDDINGS=true
GEMINI_API_KEY=your-key-here
```

---

## After Changing `.env`

**IMPORTANT:** Restart the backend for changes to take effect:

```bash
# Stop backend (Ctrl+C)
npm run dev
```

---

## Verifying Configuration

When backend starts, you should see:

```
[server] Starting server...
[server] PDF_UPLOAD_STRATEGY: vision
[server] GEMINI_VISION_MODEL: gemini-2.0-flash-exp
```

When uploading PDF with vision strategy:

```
[upload/pdf-structured] Extracting structured sections with LLM...
[gemini_vision] Using model: gemini-2.0-flash-exp, temperature: 0.4
[gemini_vision] PDF size: X.XX MB
[gemini_vision] Sending PDF to Gemini...
```

---

## Troubleshooting

### "GEMINI_API_KEY is required"
**Fix:** Add `GEMINI_API_KEY=your-key` to `.env`

### "Model not found: gemini-2.0-flash-exp"
**Fix:** Check Gemini API supports this model, or use `gemini-1.5-flash`

### Still using old extraction
**Fix:**
1. Check `.env` has `PDF_UPLOAD_STRATEGY=vision`
2. Restart backend
3. Clear browser cache / hard refresh frontend
4. Verify frontend is calling `/upload/pdf-structured`

### Invalid JSON errors
**Cause:** `responseSchema` not working or model returning malformed JSON

**Fix:**
1. Verify using `gemini-2.0-flash-exp` or newer
2. Check console for actual JSON response
3. May need to adjust temperature (try 0.2 for more structured output)

---

## Cost Estimates

### Vision Strategy
- ~$0.01-0.02 per PDF upload
- Depends on PDF size and complexity

### Python Strategy
- Free (local processing)
- But uses Gemini for section extraction (~$0.002)

**Recommendation:** Vision strategy worth the small cost for much better quality.
