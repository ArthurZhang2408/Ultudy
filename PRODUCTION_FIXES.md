# Production Deployment Fixes

This document addresses two issues discovered after deploying Ultudy to production.

---

## Issue #1: Clerk Deprecation Warning

### Problem
Console warning in production:
```
Clerk: The prop "afterSignInUrl" is deprecated and should be replaced with
the new "fallbackRedirectUrl" or "forceRedirectUrl" props instead.
```

### Root Cause
The environment variables `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` are deprecated in Clerk Core 2.

### Solution

**1. Update Vercel Environment Variables:**

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

**Remove (deprecated):**
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`

**Add (new):**
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` = `/courses`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` = `/courses`

**2. Redeploy Frontend:**
```bash
# Vercel will automatically redeploy if connected to Git
git add .
git commit -m "Fix Clerk deprecated environment variables"
git push origin your-branch
```

Or trigger manual redeploy in Vercel dashboard.

### Understanding the Change

**Old behavior (`AFTER_SIGN_IN_URL`):**
- Redirects to specified URL after sign-in
- Can be overridden by `?redirect_url=` query parameter

**New behavior (`SIGN_IN_FALLBACK_REDIRECT_URL`):**
- **Same behavior** - only used if no `redirect_url` in query
- Better naming: "fallback" makes it clear this is the default, not forced

**Alternative (`SIGN_IN_FORCE_REDIRECT_URL`):**
- **Different behavior** - ALWAYS redirects to this URL
- Ignores `redirect_url` query parameter
- Use with caution - interrupts user flow

**Recommendation:** Use `FALLBACK_REDIRECT_URL` to maintain current behavior.

---

## Issue #2: Upload Progress Animation Not Appearing

### Problem
After uploading a document in production:
- ✅ Upload completes successfully
- ✅ User redirects to course page
- ❌ Progress animation and real-time updates don't appear
- ✅ Works perfectly in local development

### Root Cause

**Redis is not configured in Railway**, causing jobs to process **synchronously** instead of asynchronously.

From `backend/src/jobs/queue.js:14`:
```javascript
const DISABLE_QUEUES = !REDIS_URL;  // No Redis = synchronous mock queues
```

**What happens:**
1. User uploads PDF → Backend creates job → Returns `job_id`
2. **Without Redis:** Job processes INSTANTLY (synchronous)
3. User redirects to `/courses/:id?upload_job_id=123`
4. Frontend starts polling for job status
5. **Job already completed** → No progress animation shows

**What should happen:**
1. User uploads PDF → Backend creates job → Returns `job_id`
2. **With Redis:** Job queued for background processing (asynchronous)
3. User redirects → Frontend polls → Receives updates (10% → 20% → 70% → 100%)
4. Progress bar animates in real-time

### Solution: Set Up Redis in Railway

#### Option A: Railway Redis Plugin (Recommended)

**1. Add Redis to Railway Project:**
```
Railway Dashboard → Your Project → New Service → Database → Add Redis
```

This creates a free Redis instance (up to 25 MB, sufficient for job queue).

**2. Copy Redis Connection URL:**
```
Redis Service → Variables → REDIS_URL
```
Format: `redis://default:password@red-abc123.railway.internal:6379`

**3. Add to Backend Environment Variables:**
```
Backend Service → Variables → Add Variable:
Name: REDIS_URL
Value: redis://default:password@red-abc123.railway.internal:6379
```

**4. Redeploy Backend:**
Railway will automatically redeploy when you add the environment variable.

**5. Verify in Logs:**
```bash
# Railway backend logs should show:
[Queue] Connecting to Redis at redis://default:***@red-abc123.railway.internal:6379
[uploadQueue] Ready to process jobs
[lessonQueue] Ready to process jobs
```

Instead of:
```bash
[Queue] Redis not configured - using mock queues (jobs process synchronously)
[Queue] To enable async processing, set REDIS_URL in .env
```

#### Option B: External Redis (Free Tier Options)

If you prefer external Redis hosting:

**1. Upstash Redis (Free Tier):**
- Sign up: https://upstash.com
- Create Redis database
- Copy `REDIS_URL` (format: `rediss://default:password@host:6379`)
- Add to Railway backend environment variables

**2. Redis Cloud (Free Tier):**
- Sign up: https://redis.com/try-free
- Create database (30 MB free)
- Copy connection URL
- Add to Railway backend environment variables

### Testing the Fix

**1. Upload a PDF in production:**
```
https://ultudy.com → Courses → Upload Document
```

**2. After redirect, you should see:**
```
┌─────────────────────────────────────┐
│ 📄 Document Title                   │
│ ⏳ Processing...                    │
│ [████████░░░░░░░░░░░] 40%          │
│ Extracting sections from PDF...    │
└─────────────────────────────────────┘
```

**3. Backend logs should show:**
```
[uploadQueue] Job abc-123 started
[uploadQueue] Job abc-123 progress: 10% - PDF saved to storage
[uploadQueue] Job abc-123 progress: 20% - Starting extraction
[uploadQueue] Job abc-123 progress: 70% - Extraction complete
[uploadQueue] Job abc-123 progress: 80% - Document created
[uploadQueue] Job abc-123 progress: 95% - Sections inserted (19/20)
[uploadQueue] Job abc-123 completed
```

**4. Frontend polling logs (browser console):**
```javascript
Polling job status... (attempt 1/150)
Job progress: 10%
Job progress: 20%
Job progress: 70%
Job progress: 100% - Complete!
```

### Cost Considerations

**Railway Redis:**
- Free Tier: 25 MB storage (sufficient for job queue)
- Shared CPU: 500 MB RAM
- Cost if exceeded: ~$5-10/month for 100 MB

**Upstash Redis:**
- Free Tier: 10,000 commands/day
- Paid: $0.20 per 100k commands

**For Ultudy's use case:**
- Each upload creates ~5-10 Redis operations (queue, progress updates)
- 1,000 uploads/month = 10,000 operations = FREE

**Recommendation:** Use Railway Redis plugin for simplicity.

---

## Environment Variables Summary

### Frontend (Vercel)

**Updated:**
```env
# Remove these (deprecated)
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/courses
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/courses

# Add these (new)
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/courses
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/courses
```

### Backend (Railway)

**Add:**
```env
# Redis for async job processing
REDIS_URL=redis://default:password@your-redis-host:6379
```

---

## Deployment Checklist

- [ ] Update Clerk environment variables in Vercel
- [ ] Redeploy frontend to apply changes
- [ ] Add Redis to Railway project
- [ ] Add `REDIS_URL` to Railway backend environment variables
- [ ] Verify backend logs show Redis connection
- [ ] Test upload with progress animation
- [ ] Verify no console warnings for Clerk

---

## Troubleshooting

### Clerk Warning Still Appears

**Check:**
1. Are new environment variables set in Vercel? (Settings → Environment Variables)
2. Did you redeploy after adding variables?
3. Hard refresh browser cache: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

### Upload Progress Still Not Showing

**Check Backend Logs:**
```bash
railway logs --service backend
```

**Look for:**
```
✅ GOOD: [Queue] Connecting to Redis at redis://...
❌ BAD:  [Queue] Redis not configured - using mock queues
```

**If Redis connection fails:**
```
[uploadQueue] Queue error: Error: connect ECONNREFUSED
```

**Solutions:**
1. Verify `REDIS_URL` is set correctly in Railway
2. Check Redis service is running in Railway dashboard
3. Ensure backend can reach Redis (internal Railway network)
4. Check Redis host format: `redis://` vs `rediss://` (SSL)

### Jobs Stuck in Queue

**Symptom:** Progress shows 0% forever

**Check:**
1. Are background workers running?
   ```bash
   railway logs --service backend | grep "processor"
   ```
2. Look for worker registration:
   ```
   [uploadQueue] Processor registered (concurrency: 5)
   ```

**Solution:**
- Restart backend service in Railway
- Check for errors in job processor (`backend/src/jobs/processors/upload.processor.js`)

---

## References

- [Clerk Core 2 Upgrade Guide](https://clerk.com/docs/upgrade-guides/core-2/nextjs)
- [Clerk Environment Variables](https://clerk.com/docs/deployments/clerk-environment-variables)
- [Railway Redis Documentation](https://docs.railway.app/databases/redis)
- [Bull Queue Documentation](https://github.com/OptimalBits/bull)

---

**Last Updated:** 2025-01-18
**Status:** Ready for deployment
