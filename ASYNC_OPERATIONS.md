# Async Operations - Non-Blocking UI Implementation

## Overview

This document describes the async operations system that transforms blocking PDF upload and lesson generation operations into non-blocking, real-time UI experiences.

## Features

### 1. **Non-Blocking Upload**
- Upload PDF → Instant redirect to course page
- Document appears with "Processing..." badge
- Real-time progress updates
- Auto-refresh when processing complete
- No manual refresh needed

### 2. **Non-Blocking Lesson Generation**
- Click section → Generation starts immediately
- UI remains responsive
- Can queue multiple sections
- Progress tracked per section
- Persists across page navigation

### 3. **Real-Time Status Updates**
- Polls backend every 2 seconds
- Updates progress bars in real-time
- Handles failures gracefully
- Automatic cleanup of completed jobs

## Architecture

### Backend Components

#### 1. Job Queue System (`/backend/src/jobs/`)
```
jobs/
├── queue.js              # Bull queue configuration
├── tracking.js           # Database job tracking
├── worker.js             # Worker process setup
└── processors/
    ├── upload.processor.js   # Upload job handler
    └── lesson.processor.js   # Lesson generation handler
```

#### 2. Database Schema
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'upload_pdf' | 'generate_lesson'
  status TEXT NOT NULL,         -- 'queued' | 'processing' | 'completed' | 'failed'
  progress INTEGER DEFAULT 0,   -- 0-100
  data JSONB,                   -- Job input data
  result JSONB,                 -- Job output data
  error TEXT,                   -- Error message if failed
  created_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

#### 3. API Endpoints

**Upload Endpoint** - `/upload/pdf-structured`
- Returns immediately with `job_id` and `document_id`
- Queues processing in background
- Response:
  ```json
  {
    "job_id": "uuid",
    "document_id": "uuid",
    "status": "queued",
    "message": "Upload queued for processing"
  }
  ```

**Lesson Generation Endpoint** - `/lessons/generate`
- Returns immediately with `job_id` if new generation
- Returns `lesson_id` if already exists
- Response (new generation):
  ```json
  {
    "job_id": "uuid",
    "status": "queued",
    "message": "Lesson generation queued"
  }
  ```
- Response (cached):
  ```json
  {
    "lesson_id": "uuid",
    "status": "completed",
    "message": "Lesson already generated"
  }
  ```

**Job Status Endpoint** - `/jobs/:id`
- Returns current job status
- Response:
  ```json
  {
    "id": "uuid",
    "type": "upload_pdf",
    "status": "processing",
    "progress": 75,
    "data": { ... },
    "result": { ... },
    "error": null,
    "created_at": "2025-11-15T...",
    "started_at": "2025-11-15T...",
    "completed_at": null
  }
  ```

**Job Polling Endpoint** - `/jobs/poll`
- Poll multiple jobs at once (efficient)
- POST body:
  ```json
  {
    "job_ids": ["uuid1", "uuid2", ...]
  }
  ```
- Response:
  ```json
  {
    "jobs": [
      { "id": "uuid1", "status": "completed", ... },
      { "id": "uuid2", "status": "processing", ... }
    ]
  }
  ```

### Frontend Components

#### 1. Job Polling Library (`/frontend/src/lib/jobs.ts`)

**Functions:**
- `pollJobStatus(jobId, options)` - Poll single job
- `pollMultipleJobs(jobIds, options)` - Poll multiple jobs
- `createJobPoller(jobId, options)` - Hook-friendly polling with cancellation

**Example Usage:**
```typescript
import { createJobPoller } from '@/lib/jobs';

const cancelPoller = createJobPoller(jobId, {
  interval: 2000,
  onProgress: (job) => {
    console.log('Progress:', job.progress);
    updateUI(job.progress);
  },
  onComplete: (job) => {
    console.log('Completed:', job.result);
    refreshData();
  },
  onError: (error) => {
    console.error('Error:', error);
    showError(error);
  }
});

// Cleanup on unmount
return () => cancelPoller();
```

#### 2. Upload Flow (`/frontend/src/app/upload/page.tsx`)

1. User selects PDF and clicks upload
2. PDF uploaded immediately (just file storage)
3. Job created and stored in sessionStorage
4. **Instant redirect** to course page with `?upload_job_id=xxx`
5. Course page starts polling
6. UI shows "Processing..." card with progress
7. Auto-refresh when complete

#### 3. Course Page (`/frontend/src/app/courses/[id]/page.tsx`)

**Processing Document UI:**
- Shows above regular documents
- Animated pulsing icon
- Progress bar (0-100%)
- Status badge: "Processing...", "queued", etc.
- Auto-removes when complete

**Example:**
```tsx
{processingJobs.map((job) => (
  <Card key={job.job_id} className="bg-primary-50">
    <div className="animate-pulse">
      <h4>{job.title}</h4>
      <Badge>Processing...</Badge>
      <span>{job.progress}%</span>
    </div>
    <ProgressBar value={job.progress} />
  </Card>
))}
```

#### 4. Learn Page (`/frontend/src/app/learn/page.tsx`)

**Section Generation:**
- Click section → Starts generation immediately
- Section marked with `generating: true`
- Progress tracked: `generation_progress: 0-100`
- **UI remains responsive** - can click other sections
- Auto-updates when complete
- Persists state across navigation

**Example:**
```tsx
<Section
  generating={section.generating}
  progress={section.generation_progress}
  onClick={() => loadOrGenerateLesson(section)}
>
  {section.name}
  {section.generating && (
    <Badge>Generating... {section.generation_progress}%</Badge>
  )}
</Section>
```

## Dependencies

### Backend
- `bull` - Redis-based job queue
- `redis` - Required by Bull
- Existing: `express`, `pg`, etc.

### Frontend
- No new dependencies (uses native fetch)

## Environment Requirements

### Backend
```env
# Existing variables
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379  # NEW - Required for Bull

# LLM Configuration (existing)
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
```

### Redis Setup
The job queue requires Redis to be running:

```bash
# Docker
docker run -d -p 6379:6379 redis:7-alpine

# macOS
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo systemctl start redis
```

## Database Migration

Run the migration to create the `jobs` table:

```bash
cd backend
npm run migrate
```

Or manually:
```sql
-- See backend/db/migrations/20251115000000_add_jobs_table.cjs
```

## Testing

### 1. Test Upload Flow

1. Navigate to `/upload`
2. Select a PDF file
3. Fill in course details
4. Click "Upload and Process PDF"
5. **Should redirect immediately** to course page
6. **Should see processing document** with progress bar
7. Wait for completion (progress updates every 2s)
8. **Document appears automatically** when done

### 2. Test Generation Flow

1. Navigate to a course with documents
2. Click "Start Studying"
3. Click on a section (without lesson)
4. **Should NOT block UI** - shows "Generating..." badge
5. **Click another section** - should queue that too
6. Navigate away and back - **state persists**
7. Wait for completion - **auto-updates** when done

### 3. Test Error Handling

1. Stop Redis: `redis-cli shutdown`
2. Try upload - should show error
3. Start Redis: `redis-server`
4. Retry - should work

### 4. Test Multiple Users

1. Open two browser windows (different users)
2. Upload PDFs simultaneously
3. Each should see only their own jobs
4. Jobs should not interfere

## Monitoring

### Job Status
```bash
# Check Redis queue
redis-cli
> KEYS bull:*
> HGETALL bull:upload-processing:1
```

### Database
```sql
-- Check active jobs
SELECT * FROM jobs WHERE status IN ('queued', 'processing');

-- Check failed jobs
SELECT * FROM jobs WHERE status = 'failed' ORDER BY created_at DESC;

-- Job statistics
SELECT
  type,
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds
FROM jobs
WHERE completed_at IS NOT NULL
GROUP BY type, status;
```

### Logs
```bash
# Backend logs
cd backend
npm run dev

# Look for:
[Worker] Processing upload job ...
[UploadProcessor] Starting job ...
[UploadProcessor] ✅ Job ... complete
```

## Troubleshooting

### Issue: Jobs stuck in "queued" status
**Cause:** Worker not running or crashed
**Solution:**
```bash
cd backend
npm run dev  # Restart server (workers start automatically)
```

### Issue: "Job not found" error
**Cause:** Job was cleaned up (>24 hours old)
**Solution:** This is expected behavior. Jobs auto-cleanup after 24 hours.

### Issue: Progress not updating
**Cause:** Frontend polling stopped
**Solution:** Check browser console for errors. Polling should show:
```
[learn] Generation progress: 50
[learn] Generation progress: 75
[learn] Generation completed: {...}
```

### Issue: Redis connection refused
**Cause:** Redis not running
**Solution:**
```bash
redis-server  # Start Redis
```

### Issue: Multiple jobs for same section
**Cause:** User clicked section multiple times
**Solution:** This is prevented - check for existing lesson before creating job (backend/src/routes/study.js:324-346)

## Performance Considerations

### Polling Interval
- **Current:** 2 seconds
- **Pros:** Good balance of responsiveness vs. load
- **Tuning:** Increase for lower load, decrease for faster updates

### Job Retention
- **Current:** 24 hours
- **Cleanup:** Automatic every hour
- **Tuning:** Adjust in `backend/src/jobs/queue.js`

### Concurrent Workers
- **Current:** 1 worker per queue
- **Scaling:** Can add more workers by starting multiple backend instances
- **Note:** All workers share same Redis queue

### Database Impact
- Jobs table grows over time
- Cleaned automatically (24h retention)
- Indexes on `owner_id`, `status`, `type` for fast queries
- RLS policies ensure user isolation

## Future Enhancements

### Potential Improvements

1. **WebSocket Support**
   - Replace polling with WebSocket push
   - Lower latency, less bandwidth
   - More complex to implement

2. **Progress Streaming**
   - Stream LLM generation in real-time
   - Show partial results as they're generated
   - Better UX for long operations

3. **Batch Operations**
   - "Generate all sections" button
   - Queue multiple operations at once
   - Show overall progress

4. **Retry Logic**
   - Automatic retry on transient failures
   - Exponential backoff
   - User-visible retry button

5. **Job History**
   - View past jobs
   - Re-run failed jobs
   - Export logs

6. **Priority Queues**
   - User-initiated operations have higher priority
   - Background tasks run at lower priority
   - Fair scheduling

## Code Organization

### Backend
```
backend/src/
├── jobs/
│   ├── queue.js           # Bull queue setup
│   ├── tracking.js        # DB job tracking
│   ├── worker.js          # Worker initialization
│   └── processors/
│       ├── upload.processor.js
│       └── lesson.processor.js
├── routes/
│   ├── upload.js          # Modified for async
│   ├── study.js           # Modified for async
│   └── jobs.js            # NEW - Job status API
└── app.js                 # Modified - initialize workers
```

### Frontend
```
frontend/src/
├── lib/
│   └── jobs.ts            # NEW - Polling utilities
├── app/
│   ├── api/
│   │   └── jobs/          # NEW - Job API routes
│   │       ├── [id]/route.ts
│   │       └── poll/route.ts
│   ├── upload/
│   │   └── page.tsx       # Modified - async upload
│   ├── courses/
│   │   └── [id]/page.tsx  # Modified - processing UI
│   └── learn/
│       └── page.tsx       # Modified - async generation
```

## Summary

This async operations system provides:

✅ **Non-blocking UI** - Operations don't freeze the interface
✅ **Real-time updates** - See progress as it happens
✅ **Multi-tasking** - Queue multiple operations
✅ **Persistence** - State survives page navigation
✅ **Error handling** - Graceful degradation
✅ **Scalability** - Redis-backed queue handles load
✅ **User experience** - Instant feedback, no waiting

The implementation follows best practices for async job processing and provides a foundation for future enhancements.
