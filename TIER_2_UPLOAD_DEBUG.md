# Tier 2 Upload Debug Guide

## Status Update (2025-11-25)

**New comprehensive logging added** to diagnose the tier routing issue.

## Confirmed Working ✅
1. **Frontend tier check**: You see tier 2 UI (upload button, modal)
2. **Database upgrade**: Backend logs show `[subscriptions] User user_34xFihjRc05isVNp2TL0KRSJoax upgraded to tier2 (TEST MODE)`
3. **Subscription endpoint**: Returns `tier: 'tier2'`

## Problem 🔴
- Upload creates sections (tier 1 behavior)
- Document goes to "Uncategorized"
- NO `[UploadProcessor]` logs appear in Railway

## Diagnosis
The job IS processing (because sections are created), but tier routing is going to tier 1 instead of tier 2.

Possible causes:
1. **User ID mismatch**: Upload uses different user ID than subscription
2. **Worker logs not visible**: Logs are being filtered or going elsewhere
3. **Database query issue**: Tier query failing or returning wrong result

## NEW Debug Steps (After Enhanced Logging)

After redeploying Railway with the latest code, upload a test PDF and look for these logs:

### Step 1: Worker Startup (Check Once)

Look for this on Railway deployment:
```
╔════════════════════════════════════════════════════════╗
║  WORKER STARTING: worker-<pid>                        ║
╚════════════════════════════════════════════════════════╝

[Worker:worker-<pid>] Initializing job processors...
[Worker:worker-<pid>] Storage backend: s3 (or local)

✅ [Worker:worker-<pid>] Job processors started successfully
   - Upload queue ready (concurrency: 5)
   - Lesson queue ready (concurrency: 3)
   - Waiting for jobs...
```

**If missing**: Worker isn't running at all → contact Railway support or check deployment status

### Step 2: Upload Initiated

When you click "Upload", look for:
```
[upload/pdf-structured] Upload initiated
[upload/pdf-structured] User ID: user_34xFihjRc05isVNp2TL0KRSJoax
[upload/pdf-structured] Document ID: <uuid>
[upload/pdf-structured] Saving PDF to storage...
[upload/pdf-structured] Storage type: s3
[upload/pdf-structured] Metadata: { courseId: '...', chapter: null, ... }
[upload/pdf-structured] PDF saved: { storageKey: '...', ... }
[upload/pdf-structured] ✅ Job <job-id> queued for document <doc-id>
```

**Key check**: Does "User ID" match your Clerk user ID (`user_34xFihjRc05isVNp2TL0KRSJoax`)?

### Step 3: Worker Picks Up Job

Look for this a few seconds after upload:
```
[Worker:worker-<pid>] ▶ Picked up upload job <job-id>
[Worker:worker-<pid>] Job data: {
  "jobId": "...",
  "ownerId": "user_34xFihjRc05isVNp2TL0KRSJoax",
  "documentId": "...",
  "storageKey": "...",
  ...
}
```

**Key check**: Does "ownerId" in job data match your user ID?

### Step 4: Processor Starts

Immediately after job pickup:
```
[UploadProcessor] ═══════════════════════════════════════
[UploadProcessor] Starting job <job-id> for document <doc-id>
[UploadProcessor] Owner ID: user_34xFihjRc05isVNp2TL0KRSJoax
[UploadProcessor] Metadata: course=..., chapter=null, type=...
[UploadProcessor] Storage: using storage service
```

**Key check**: Does "Owner ID" match your user ID?

### Step 5: Tier Check (CRITICAL)

This is where tier routing happens:
```
[UploadProcessor] Checking tier for user: user_34xFihjRc05isVNp2TL0KRSJoax
[getUserTier] Querying subscription for user: user_34xFihjRc05isVNp2TL0KRSJoax
[getUserTier] Found subscription: tier=tier2
[UploadProcessor] ✓ User tier: tier2
[UploadProcessor] → Routing to Tier 2 processor
```

**OR if tier check fails:**
```
[getUserTier] No subscription found for user <user-id>, defaulting to 'free'
[UploadProcessor] ✓ User tier: free
[UploadProcessor] → Using Tier 1/Free processor
```

**OR if database error:**
```
[getUserTier] ❌ Database error: <error message>
[getUserTier] Stack: <stack trace>
[getUserTier] Defaulting to 'free' due to error
```

### Step 6: Tier 2 Processing

If tier check succeeded, you should see:
```
[Tier2UploadProcessor] Starting tier 2 job <job-id> for document <doc-id>
[Tier2UploadProcessor] Metadata: course=..., type=...
[Tier2UploadProcessor] Downloading PDF from storage: ...
[Tier2UploadProcessor] Detecting chapter structure from ...
[tier2Detection] Calling Gemini Vision API...
[tier2Detection] Received response (12345 chars)
[tier2Detection] Detected SINGLE CHAPTER format
[Tier2UploadProcessor] Detection result: single
[Tier2UploadProcessor] Single chapter detected: Chapter X - Title
[Tier2UploadProcessor] Chapter markdown saved: Chapter X
[Tier2UploadProcessor] ✅ Single chapter job <job-id> complete
```

## Diagnostic Decision Tree

Based on the logs you see, follow this tree:

### 🔍 **Do you see the Worker Startup banner?**

**NO** → Worker not starting
- Check Railway deployment status
- Check for startup errors
- Verify Redis connection is working

**YES** → Worker is running, continue...

### 🔍 **Do you see Upload Initiated logs?**

**NO** → Upload request not reaching backend
- Check NEXT_PUBLIC_BACKEND_URL
- Check network tab for errors
- Verify auth token is valid

**YES** → Upload endpoint working, continue...

### 🔍 **Does the User ID in upload match your Clerk ID?**

**NO** → Auth middleware issue
- Check JWT token
- Verify Clerk configuration
- Check AUTH_JWT_JWKS_URL

**YES** → Auth working, continue...

### 🔍 **Do you see Worker Picked Up Job logs?**

**NO** → Job not reaching queue
- Check Redis connection
- Check queue creation logs
- Check for job creation errors

**YES** → Queue working, continue...

### 🔍 **Does ownerId in job data match User ID?**

**NO** → Bug in job creation (shouldn't happen)
- File bug report

**YES** → Job data correct, continue...

### 🔍 **Do you see UploadProcessor Starting logs?**

**NO** → Processor crashed before logging
- Check for immediate exceptions
- Check worker process health

**YES** → Processor running, continue...

### 🔍 **What does getUserTier say?**

**"No subscription found"** → Database issue
- User ID mismatch between Clerk and subscription
- Run this to check:
  ```sql
  SELECT user_id, tier FROM subscriptions WHERE user_id LIKE '%34xFi%';
  ```

**"Database error"** → Connection issue
- Check database connection
- Check DATABASE_URL
- Look at error stack trace

**"Found subscription: tier=free"** → Upgrade didn't work
- Re-run upgrade via UI
- Check subscription table directly

**"Found subscription: tier=tier2"** → ✅ SHOULD WORK!
- If you see this but still get tier 1 behavior, file a bug report with full logs

## Manual Database Check

If logs show "No subscription found", verify in Railway database:

```sql
-- Check subscription exists
SELECT user_id, tier, status, created_at, updated_at
FROM subscriptions
WHERE user_id = 'user_34xFihjRc05isVNp2TL0KRSJoax';

-- If no results, check for partial match
SELECT user_id, tier, status
FROM subscriptions
WHERE user_id LIKE '%34xFi%';

-- Check all subscriptions (if test database)
SELECT user_id, tier, status FROM subscriptions;
```

## Expected Full Log Sequence (Tier 2)

When uploading as tier 2 user, you should see ALL of these logs in Railway:

```
═══════════════════════════════════════════════════════════
                    UPLOAD INITIATED
═══════════════════════════════════════════════════════════
[upload/pdf-structured] Upload initiated
[upload/pdf-structured] User ID: user_34xFihjRc05isVNp2TL0KRSJoax
[upload/pdf-structured] Document ID: <uuid>
[upload/pdf-structured] Saving PDF to storage...
[upload/pdf-structured] Storage type: s3
[upload/pdf-structured] PDF saved: { storageKey: '...', location: '...', backend: 's3' }
[upload/pdf-structured] ✅ Job <job-id> queued for document <doc-id>

═══════════════════════════════════════════════════════════
                    WORKER PICKS UP JOB
═══════════════════════════════════════════════════════════
[Worker:worker-12345] ▶ Picked up upload job <job-id>
[Worker:worker-12345] Job data: { "ownerId": "user_34xFi...", ... }

═══════════════════════════════════════════════════════════
                    PROCESSOR STARTS
═══════════════════════════════════════════════════════════
[UploadProcessor] ═══════════════════════════════════════
[UploadProcessor] Starting job <job-id> for document <doc-id>
[UploadProcessor] Owner ID: user_34xFihjRc05isVNp2TL0KRSJoax
[UploadProcessor] Metadata: course=<uuid>, chapter=null, type=textbook
[UploadProcessor] Storage: using storage service

═══════════════════════════════════════════════════════════
                    TIER CHECK (CRITICAL!)
═══════════════════════════════════════════════════════════
[UploadProcessor] Checking tier for user: user_34xFihjRc05isVNp2TL0KRSJoax
[getUserTier] Querying subscription for user: user_34xFihjRc05isVNp2TL0KRSJoax
[getUserTier] Found subscription: tier=tier2
[UploadProcessor] ✓ User tier: tier2
[UploadProcessor] → Routing to Tier 2 processor

═══════════════════════════════════════════════════════════
                    TIER 2 PROCESSING
═══════════════════════════════════════════════════════════
[Tier2UploadProcessor] Starting tier 2 job <job-id> for document <doc-id>
[Tier2UploadProcessor] Downloading PDF from storage...
[Tier2UploadProcessor] PDF downloaded to temp file: /tmp/<uuid>.pdf
[Tier2UploadProcessor] Detecting chapter structure from /tmp/<uuid>.pdf
[tier2Detection] Calling Gemini Vision API...
[tier2Detection] Received response (12345 chars)
[tier2Detection] Detected SINGLE CHAPTER format
[Tier2UploadProcessor] Detection result: single
[Tier2UploadProcessor] Single chapter detected: Chapter 1 - Introduction
[Tier2UploadProcessor] Document created: <doc-id>
[Tier2UploadProcessor] Chapter markdown saved: Chapter 1
[Tier2UploadProcessor] ✅ Single chapter job <job-id> complete
```

## Bad Path: Tier 1 Processing

If you see this instead, tier routing failed:

```
[UploadProcessor] ✓ User tier: free  ← WRONG! Should be tier2
[UploadProcessor] → Using Tier 1/Free processor  ← Going to tier 1!
[UploadProcessor] Extracting structured sections from ...
[UploadProcessor] Extracted 3 sections  ← This creates sections!
```

## Next Steps

1. Upload a test PDF
2. Copy ALL Railway logs from the upload (from upload endpoint through processing)
3. Check which of the above 10 log lines appear
4. The first missing log line tells us where it's failing
