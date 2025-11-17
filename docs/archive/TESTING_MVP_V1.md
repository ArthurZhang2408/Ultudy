# Testing MVP v1.0 Features

This guide shows you how to test the new full-context learning features implemented in Sessions 1-3.

## Prerequisites

1. Backend running: `cd backend && npm run dev`
2. Frontend running: `cd frontend && npm run dev`
3. Database running: `docker compose up -d`
4. You need a Clerk auth token (can get from browser DevTools after logging into frontend)

## What's New?

The backend now:
1. **Stores full document text** (not just chunks)
2. **Supports document metadata** (material type, chapter, tags)
3. **Generates interactive lessons** with concepts, check-ins, analogies, and examples
4. **Has new database tables** for mastery tracking (concepts, problem_types, study_sessions)

The frontend **hasn't been updated yet** - that's Sessions 4-5!

## Testing with curl (Backend API)

### Setup: Get Your Auth Token

1. Open frontend in browser: http://localhost:3000
2. Log in with Clerk
3. Open DevTools → Network tab
4. Make any request (upload, search, etc.)
5. Copy the `Authorization: Bearer <token>` header value
6. Set it as an environment variable:

```bash
export AUTH_TOKEN="your-token-here"
```

### Test 1: Upload a Document (Now Stores Full Text!)

```bash
# Create a test PDF or use an existing one
curl -X POST http://localhost:3001/upload/pdf \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "file=@/path/to/your.pdf"
```

**What's new:** The response includes `document_id`, and behind the scenes the full text is now stored in `documents.full_text`!

Save the `document_id` from the response:
```bash
export DOC_ID="the-uuid-from-response"
```

### Test 2: Tag Your Document with Metadata (NEW!)

```bash
curl -X POST http://localhost:3001/documents/$DOC_ID/metadata \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "material_type": "textbook",
    "chapter": "3",
    "title": "Introduction to Signals",
    "user_tags": ["signals", "important", "exam-topic"]
  }'
```

**What's new:** You can now organize your documents by type, chapter, and custom tags!

Valid `material_type` values:
- `textbook`
- `lecture`
- `tutorial`
- `exam`

### Test 3: List Documents with Metadata (NEW!)

```bash
curl -X GET http://localhost:3001/documents \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

**What's new:** The response now includes `material_type`, `chapter`, and `user_tags` for each document!

### Test 4: Generate Interactive Lesson with Full Context (NEW! 🎉)

This is the big one - the core of MVP v1.0!

```bash
curl -X POST http://localhost:3001/lessons/generate \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"document_id\": \"$DOC_ID\",
    \"include_check_ins\": true
  }"
```

**What's new:** Instead of using RAG chunks, this:
1. Loads the **FULL document text** (using Gemini's 1M token window)
2. Extracts 3-5 **key concepts** from the material
3. For each concept, provides:
   - Clear **explanation**
   - Multiple **analogies**
   - Worked **examples** with step-by-step solutions
4. Generates **check-in questions** with hints and expected answers

**Response structure:**
```json
{
  "topic": "The main topic of this lesson",
  "summary": "An engaging overview...",
  "concepts": [
    {
      "name": "Fourier Transform",
      "explanation": "Clear explanation of the concept...",
      "analogies": ["Like translating a book...", "Similar to..."],
      "examples": [
        {
          "setup": "Consider this scenario...",
          "steps": ["Step 1...", "Step 2...", "Step 3..."]
        }
      ]
    }
  ],
  "checkins": [
    {
      "concept": "Fourier Transform",
      "question": "What is the main purpose of the Fourier Transform?",
      "hint": "Think about converting between domains...",
      "expected_answer": "To convert signals from time domain to frequency domain"
    }
  ],
  "document_id": "uuid"
}
```

### Test 5: Old RAG-Based Lesson Still Works (Backward Compatible)

```bash
curl -X POST http://localhost:3001/study/lesson \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "signals",
    "k": 6
  }'
```

**What's new:** Nothing! This still works exactly as before. We kept backward compatibility.

## Verify Database Changes

If you want to see the new database schema:

```bash
# Connect to your database
docker exec -it ultudy-db-1 psql -U postgres -d study_app

# Check documents table has new columns
\d documents

# Should show: full_text, material_type, chapter, user_tags

# Check new tables exist
\dt

# Should show: concepts, problem_types, study_sessions

# View concepts table structure
\d concepts

# Exit
\q
```

## What You Should See

### Old System (RAG-based):
- Upload → Chunks created → Search chunks → Generate summary from chunks
- Limited context (only 6 chunks ~3600 words)
- Generic summaries

### New System (Full-Context):
- Upload → **Full text stored** → Load full document → Generate **interactive lesson**
- Full context (entire document, up to 1M tokens)
- **Structured learning** with concepts, check-ins, analogies, examples
- **Foundation for mastery tracking** (coming in Session 4!)

## Why Frontend Looks the Same

The frontend still uses the old endpoints! Here's what needs to be built (Sessions 4-5):

**Session 4 - Check-in System:**
- Interactive modal for check-in questions
- Answer evaluation with AI feedback
- Mastery state updates (not_learned → understood → mastered)

**Session 5 - Progress Dashboard:**
- Chapter-by-chapter progress view
- Concept mastery indicators
- Weak areas highlighted
- Session tracking

## Next Steps for Development

To make this visible in the UI, we need to:

1. **Create new frontend pages:**
   - `/documents` - List documents with metadata tagging
   - `/learn/[documentId]` - Interactive lesson view
   - `/progress` - Mastery dashboard

2. **Build UI components:**
   - Document tagging form
   - Concept card with check-ins
   - Check-in modal with hints
   - Progress charts

3. **Implement Session 4:**
   - `POST /check-ins/submit` endpoint
   - Answer evaluation service
   - Mastery tracking logic

Would you like me to start building the frontend for these features?

## Quick Demo Script

Want to see it all in action? Run this:

```bash
# 1. Set your auth token
export AUTH_TOKEN="your-bearer-token"

# 2. Upload a document
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:3001/upload/pdf \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "file=@your-file.pdf")

echo "Upload response: $UPLOAD_RESPONSE"

# 3. Extract document ID
DOC_ID=$(echo $UPLOAD_RESPONSE | jq -r '.documentId')
echo "Document ID: $DOC_ID"

# 4. Tag the document
curl -X POST http://localhost:3001/documents/$DOC_ID/metadata \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "material_type": "textbook",
    "chapter": "1",
    "title": "Introduction"
  }'

# 5. Generate interactive lesson (THE BIG ONE!)
curl -X POST http://localhost:3001/lessons/generate \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"document_id\": \"$DOC_ID\", \"include_check_ins\": true}" \
  | jq '.'

echo "✅ Interactive lesson generated with concepts and check-ins!"
```

## Understanding the Architecture Shift

**Before (RAG System):**
```
Upload PDF → Extract text → Split into chunks → Create embeddings
            ↓
User asks question → Embed query → Find similar chunks
            ↓
Send chunks to LLM → Generate summary
```

**After (Full-Context System):**
```
Upload PDF → Extract text → Store FULL text + Create chunks (for search)
            ↓
User selects document → Load FULL text
            ↓
Send full text to LLM → Extract concepts → Generate interactive lesson
            ↓
[Future] User answers check-ins → Track mastery → Adaptive learning
```

The key innovation: We're not summarizing search results anymore. We're creating structured, interactive lessons from complete course materials!
