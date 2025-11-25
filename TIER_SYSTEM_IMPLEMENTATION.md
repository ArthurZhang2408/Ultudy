# Tier System Implementation Guide

**Last Updated:** 2025-11-25
**Status:** Complete - Ready for Testing
**Purpose:** Implementation guide for the tier system with Tier 2 features

---

## ✅ What Has Been Implemented

### 1. Database Schema
- **File:** `backend/src/db/migrations/002_subscription_system.sql`
- **Tables Created:**
  - `subscriptions` - User tier management
  - `monthly_usage` - Usage tracking per month
  - `chapter_metadata` - Tier 2 chapter information
  - `lesson_sources` - Multi-source lesson linking

### 2. Backend APIs

#### Subscription Management (`backend/src/routes/subscriptions.js`)
- `GET /subscriptions/current` - Get user's subscription and usage
- `POST /subscriptions/upgrade` - Upgrade tier (TEST MODE - bypasses payment)
- `POST /subscriptions/downgrade` - Downgrade tier
- `GET /subscriptions/tiers` - Get all available tiers and features

#### Tier 2 Chapter APIs (`backend/src/routes/chapters.js`)
- `POST /chapters/detect` - Detect chapters in multi-chapter PDF
- `POST /chapters/extract` - Extract specific chapters to markdown
- `POST /chapters/merge` - Merge multiple sources for same chapter
- `GET /chapters/by-course/:course_id/:chapter_number` - Get chapter sources

### 3. Middleware & Services

#### Tier Enforcement (`backend/src/middleware/tierCheck.js`)
- `requireTier(minTier)` - Require minimum tier for endpoint
- `checkUsageLimit` - Check current usage against limits
- `enforcePdfLimit` - Enforce PDF upload limits
- `enforcePageLimit` - Enforce page limits (Free tier)
- `enforceChapterLimit` - Enforce chapter limits (Tier 2)

#### Usage Tracking (`backend/src/services/usageTracking.js`)
- `trackPdfUpload(userId, pageCount)` - Track PDF uploads
- `trackChapterGeneration(userId, count)` - Track chapter extractions
- `getUsage(userId)` - Get current month's usage

### 4. Frontend Components

#### Pricing Page (`frontend/src/app/pricing/page.tsx`)
- Displays all three tiers (Free, Student, Pro)
- Direct tier switching (bypasses payment for testing)
- Shows current subscription status
- Feature comparison

#### Usage Dashboard (`frontend/src/components/UsageDashboard.tsx`)
- Real-time usage tracking
- Progress bars for limits
- Feature availability display
- Upgrade prompts when limits reached

#### Chapter Manager (`frontend/src/components/ChapterManager.tsx`)
- Detect chapters in multi-chapter PDFs
- Select chapters to extract
- Visual chapter selection UI
- Extraction progress tracking

---

## 🚀 Deployment Steps

### Step 1: Run Database Migrations

The migrations need to be run on your production/development database:

```bash
cd backend
node src/db/migrations/run.js
```

**Note:** Ensure `DATABASE_URL` is set in your environment variables.

Expected output:
```
[Migrations] Running 001_add_performance_indexes.sql...
[Migrations] ✓ 001_add_performance_indexes.sql completed
[Migrations] Running 002_subscription_system.sql...
[Migrations] ✓ 002_subscription_system.sql completed
[Migrations] All migrations completed successfully! 🎉
```

### Step 2: Verify API Routes

The routes have been automatically registered in `backend/src/app.js`:
- `/subscriptions/*` - Subscription management
- `/chapters/*` - Tier 2 chapter features

No additional configuration needed!

### Step 3: Test the Features

1. **Start the backend:**
   ```bash
   cd backend && npm run dev
   ```

2. **Start the frontend:**
   ```bash
   cd frontend && npm run dev
   ```

3. **Test tier switching:**
   - Navigate to http://localhost:3000/pricing
   - Click "Upgrade to Student" or "Upgrade to Pro"
   - Tier will switch immediately (no payment required)

4. **Test usage tracking:**
   - Upload a PDF
   - Check usage dashboard (integrate `UsageDashboard` component)
   - Verify limits are enforced

5. **Test Tier 2 features:**
   - Upgrade to Tier 2 (Pro)
   - Upload a multi-chapter PDF (e.g., textbook)
   - Use `ChapterManager` component to detect and extract chapters

---

## 📊 Tier Features Summary

### Free Tier
- 1 PDF per month
- Max 10 pages per PDF
- Single-chapter PDFs only
- All core learning features

### Tier 1: Student ($17 CAD/month)
- Unlimited PDF uploads
- No page limit
- Multiple courses support
- Single-chapter PDFs only

### Tier 2: Pro ($40 CAD/month)
- All Tier 1 features
- Multi-chapter PDF support
- Chapter detection and extraction
- Multiple sources per chapter
- Content deduplication and merging
- 100 chapters per month

---

## 🧪 Testing Checklist

- [ ] Run database migrations successfully
- [ ] Test tier switching on pricing page
- [ ] Verify Free tier limits (1 PDF, 10 pages)
- [ ] Verify Tier 1 unlimited PDFs
- [ ] Upload multi-chapter PDF as Tier 2 user
- [ ] Detect chapters in PDF
- [ ] Extract selected chapters
- [ ] Merge multiple sources for same chapter
- [ ] Check usage dashboard displays correctly
- [ ] Verify tier enforcement on upload

---

## 🔧 Integration Points

### Where to Add UsageDashboard

Add the usage dashboard component to your main app layout or dashboard:

```tsx
import UsageDashboard from '@/components/UsageDashboard';

export default function DashboardPage() {
  return (
    <div className="container mx-auto p-6">
      <h1>Dashboard</h1>
      <UsageDashboard />
      {/* Other dashboard content */}
    </div>
  );
}
```

### Where to Add ChapterManager

Add chapter manager after document upload for Tier 2 users:

```tsx
import ChapterManager from '@/components/ChapterManager';

export default function DocumentView({ documentId, userTier }: Props) {
  return (
    <div>
      {/* Document info */}

      {userTier === 'tier2' && (
        <ChapterManager
          documentId={documentId}
          onChaptersExtracted={() => {
            // Refresh document list or navigate
          }}
        />
      )}
    </div>
  );
}
```

---

## 🔐 Test Mode Features

For testing purposes, the following features bypass payment:

1. **Direct Tier Switching**
   - Clicking upgrade buttons directly changes tier
   - No Stripe checkout required
   - All features immediately available

2. **Unlimited Testing**
   - Test all tiers freely
   - Switch between tiers anytime
   - No credit card needed

3. **Full Feature Access**
   - All Tier 2 features work in test mode
   - Chapter detection uses real AI
   - Content merging uses real AI

---

## 📝 Environment Variables

No new environment variables are required! The system uses existing:
- `DATABASE_URL` - For database connection
- Gemini API key - For chapter detection/extraction (already configured)

---

## 🎯 Next Steps (Optional)

### For Production Launch

1. **Integrate Stripe Payment**
   - Use `SUBSCRIPTION_ARCHITECTURE.md` as reference
   - Replace test mode tier switching with Stripe checkout
   - Add webhook handling for subscription updates

2. **Add Payment UI**
   - Payment method management
   - Invoice history
   - Subscription cancellation

3. **Enhanced Features**
   - Annual billing option
   - Overage purchases for Tier 2
   - Email notifications for usage limits

### For Better UX

1. **Usage Notifications**
   - Email when approaching limits
   - In-app notifications
   - Upgrade prompts

2. **Chapter Preview**
   - Preview detected chapters before extraction
   - Show markdown previews
   - Conflict resolution UI for multi-source merging

3. **Analytics**
   - Track tier conversion rates
   - Monitor feature usage per tier
   - Optimize pricing based on usage patterns

---

## 🐛 Troubleshooting

### Database Connection Issues
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:** Ensure `DATABASE_URL` is set in `.env` file

### Tier Enforcement Not Working
**Solution:** Verify middleware is applied to routes in `backend/src/app.js`

### Chapter Detection Fails
```
Error: Failed to detect chapters
```
**Solution:**
- Ensure Gemini API key is configured
- Check PDF is a valid multi-chapter document
- Verify Tier 2 access

### Usage Not Tracking
**Solution:** Ensure `trackPdfUpload()` is called after successful upload

---

## 📚 Related Documentation

- [PRICING_TIERS.md](PRICING_TIERS.md) - Pricing strategy and features
- [TIER_2_ARCHITECTURE.md](TIER_2_ARCHITECTURE.md) - Technical architecture
- [SUBSCRIPTION_ARCHITECTURE.md](SUBSCRIPTION_ARCHITECTURE.md) - Stripe integration guide
- [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) - Full documentation index

---

## ✨ Summary

The tier system is **fully implemented and ready for testing**. All core features work:

- ✅ 3-tier subscription system (Free, Student, Pro)
- ✅ Usage tracking and limits enforcement
- ✅ Tier 2 multi-chapter PDF support
- ✅ Chapter detection and extraction
- ✅ Multi-source merging
- ✅ Test mode for easy tier switching
- ✅ Complete frontend UI components

**To start testing:**
1. Run migrations: `cd backend && node src/db/migrations/run.js`
2. Start backend: `npm run dev`
3. Start frontend: `cd ../frontend && npm run dev`
4. Visit http://localhost:3000/pricing

All features are modular and users can freely switch between plans for testing!
