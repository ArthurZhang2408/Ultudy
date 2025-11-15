# Async Job Queue System

## Overview

This document describes the async job queue system implemented in Ultudy. All long-running operations (material upload, lesson generation, check-in evaluation) are now non-blocking and run asynchronously in the background.

## Architecture

### Backend Components

#### 1. Job Queue (Bull + Redis)
- **Location**: `backend/src/jobs/queue.js`
- **Technology**: Bull (Redis-based job queue)
- **Queues**:
  - `material-upload`: PDF processing and content extraction
  - `lesson-generation`: LLM-based lesson generation
  - `check-in-evaluation`: Answer evaluation and mastery tracking

#### 2. Database Schema
- **Migration**: `backend/db/migrations/20251115000000_add_jobs_table.cjs`
- **Table**: `jobs`
- **Fields**:
  - `id`: UUID, primary key
  - `owner_id`: User ID (with RLS)
  - `type`: Job type enum
  - `status`: pending | processing | completed | failed
  - `progress`: 0-100 percentage
  - `progress_message`: Human-readable status
  - `input_data`: Job parameters (JSONB)
  - `result_data`: Job result (JSONB)
  - `error_message`: Error description
  - `created_at`, `started_at`, `completed_at`: Timestamps

#### 3. Job Processors
- **Material Upload**: `backend/src/jobs/processors/materialUpload.js`
  - Saves PDF to storage
  - Extracts content with Gemini Vision
  - Stores document and sections in database

- **Lesson Generation**: `backend/src/jobs/processors/lessonGeneration.js`
  - Checks for cached lessons
  - Generates content with LLM
  - Persists concepts and mastery data

- **Check-in Evaluation**: `backend/src/jobs/processors/checkInEvaluation.js`
  - Evaluates answers (LLM or MCQ)
  - Updates concept mastery

#### 4. Worker Process
- **Location**: `backend/src/jobs/worker.js`
- **Runs**: Separately from web server
- **Command**: `npm run worker` or `npm run dev:worker`

#### 5. API Routes

**Async Endpoints (Non-blocking)**:
- `POST /upload/pdf-structured-async` - Returns job ID immediately
- `POST /lessons/generate-async` - Returns job ID immediately
- `POST /check-ins/submit-async` - Returns job ID immediately

**Sync Endpoints (Backward compatibility)**:
- `POST /upload/pdf-structured` - Blocks until complete
- `POST /lessons/generate` - Blocks until complete
- `POST /check-ins/submit` - Blocks until complete

**Job Management**:
- `GET /jobs/:jobId` - Get job status and result
- `GET /jobs` - List user jobs (with filters)
- `GET /jobs/health/queues` - Queue health status

### Frontend Components

#### 1. Custom Hooks
- **Location**: `frontend/src/lib/hooks/useJob.ts`
- **Hooks**:
  - `useJob(jobId)`: Polls job status with auto-refresh
  - `useJobList()`: Fetches and auto-refreshes job list

#### 2. UI Components

**JobProgress** (`frontend/src/components/JobProgress.tsx`)
- Progress bar with percentage
- Status messages
- Error handling
- Auto-complete callbacks

**JobProgressModal** (`frontend/src/components/JobProgress.tsx`)
- Full-screen overlay during processing
- Auto-closes on completion

**JobNotification** (`frontend/src/components/JobNotification.tsx`)
- Toast notification for job completion/failure
- Auto-dismiss after 5 seconds
- Container for multiple notifications

**JobQueue** (`frontend/src/components/JobQueue.tsx`)
- List of all user jobs
- Real-time status updates
- Filterable by type/status

**JobQueuePanel** (`frontend/src/components/JobQueue.tsx`)
- Slide-out panel showing all jobs
- Accessible from any page

## Usage

### Backend Setup

1. **Install Redis** (required for job queue):
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:alpine
```

2. **Set Environment Variables**:
```bash
# .env
REDIS_URL=redis://localhost:6379  # Optional, defaults to localhost
```

3. **Run Database Migration**:
```bash
cd backend
npm run migrate:pg
```

4. **Start Services**:
```bash
# Terminal 1: Web server
npm run dev

# Terminal 2: Job worker
npm run dev:worker
```

### Frontend Usage

#### Using Async Operations

**Example: Material Upload**
```tsx
import { useState } from 'react';
import { JobProgressModal } from '@/components/JobProgress';

function UploadPage() {
  const [jobId, setJobId] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('http://localhost:3001/upload/pdf-structured-async', {
      method: 'POST',
      headers: { 'x-user-id': userId },
      body: formData
    });

    const data = await response.json();
    setJobId(data.job_id);
  };

  return (
    <>
      <input type="file" onChange={(e) => handleUpload(e.target.files[0])} />

      <JobProgressModal
        jobId={jobId}
        onClose={() => setJobId(null)}
        onComplete={(result) => {
          console.log('Upload complete:', result);
          // Navigate to document page or refresh list
        }}
        onError={(error) => {
          console.error('Upload failed:', error);
        }}
        title="Uploading Material"
      />
    </>
  );
}
```

**Example: Lesson Generation**
```tsx
import { useJob } from '@/lib/hooks/useJob';
import { JobProgress } from '@/components/JobProgress';

function LearnPage() {
  const [jobId, setJobId] = useState<string | null>(null);

  const generateLesson = async () => {
    const response = await fetch('http://localhost:3001/lessons/generate-async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({
        document_id: documentId,
        section_id: sectionId
      })
    });

    const data = await response.json();
    setJobId(data.job_id);
  };

  return (
    <div>
      <button onClick={generateLesson}>Generate Lesson</button>

      {jobId && (
        <JobProgress
          jobId={jobId}
          onComplete={(result) => {
            // Display lesson
            setLesson(result);
          }}
        />
      )}
    </div>
  );
}
```

**Example: Job Queue Panel**
```tsx
import { JobQueuePanel } from '@/components/JobQueue';

function Layout() {
  const [showJobs, setShowJobs] = useState(false);

  return (
    <>
      <button onClick={() => setShowJobs(true)}>
        View Jobs
      </button>

      <JobQueuePanel
        isOpen={showJobs}
        onClose={() => setShowJobs(false)}
      />
    </>
  );
}
```

## Benefits

1. **Non-blocking UI**: Users can continue working while jobs process
2. **Progress Tracking**: Real-time progress updates with meaningful messages
3. **Error Handling**: Graceful error handling with retry capabilities
4. **Scalability**: Can process multiple jobs concurrently
5. **Reliability**: Jobs persist across server restarts
6. **Queue Management**: View and monitor all jobs in one place

## Monitoring

### Check Queue Health
```bash
curl http://localhost:3001/jobs/health/queues
```

### View User Jobs
```bash
curl -H "x-user-id: dev-user-001" \
  http://localhost:3001/jobs?status=processing
```

### Bull Board (Optional)
For advanced queue monitoring, you can add Bull Board:
```bash
npm install @bull-board/api @bull-board/express
```

## Migration Strategy

### For Existing Code

1. **Keep sync endpoints** for backward compatibility
2. **Add async endpoints** alongside sync ones
3. **Gradually migrate** frontend to use async endpoints
4. **Monitor performance** and adjust polling intervals

### Rollback Plan

If issues occur:
1. Stop the worker process
2. Use sync endpoints (still available)
3. Jobs in queue will remain until worker restarts

## Performance Tuning

### Polling Interval
Adjust in `useJob` hook:
```tsx
useJob({ jobId, pollingInterval: 2000 }) // 2 seconds
```

### Concurrent Jobs
Configure in worker:
```js
materialUploadQueue.process(5, async (job) => {
  // Process up to 5 jobs concurrently
});
```

### Job Retention
Configure in queue.js:
```js
removeOnComplete: {
  age: 24 * 3600, // Keep for 24 hours
  count: 1000 // Keep last 1000 jobs
}
```

## Troubleshooting

### Worker Not Processing Jobs
1. Check Redis is running: `redis-cli ping`
2. Check worker logs: `npm run dev:worker`
3. Verify worker is connected to same Redis as web server

### Jobs Stuck in Pending
1. Ensure worker process is running
2. Check for errors in worker logs
3. Verify job data is valid

### High Memory Usage
1. Reduce job retention settings
2. Increase cleanup frequency
3. Process fewer concurrent jobs

## Future Enhancements

- [ ] WebSocket support for real-time updates (eliminate polling)
- [ ] Job prioritization
- [ ] Job cancellation
- [ ] Scheduled/delayed jobs
- [ ] Job dependencies (wait for another job)
- [ ] Enhanced monitoring dashboard
- [ ] Email notifications for long-running jobs
