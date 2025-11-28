# Pipeline Setup Guide - Quick Start

**Last Updated:** 2025-01-18
**Purpose:** Step-by-step instructions to implement the development pipeline described in DEVELOPMENT_PIPELINE.md

---

## 🎯 Goal

Transform from current state:
```
main → Working code
deploy-ultudy-domain → Production (ultudy.com)
```

To proper pipeline:
```
production → ultudy.com (live site)
staging → staging.ultudy.com (pre-production testing)
main → development (Claude creates PRs here)
feature/* → preview deployments (Claude creates these)
```

---

## 📋 Prerequisites

- [ ] Access to Vercel dashboard (frontend deployment)
- [ ] Access to Railway dashboard (backend deployment)
- [ ] Access to domain DNS settings (for staging subdomain)
- [ ] Git repository admin access
- [ ] Backup of current production (tag created)

---

## 🚀 Implementation Steps

### Phase 1: Git Branch Reorganization (15 minutes)

**Step 1: Create production branch from current deployment**

```bash
# Navigate to your repository
cd /home/user/Ultudy

# Ensure you're on the deployment branch
git checkout claude/deploy-ultudy-domain-01TxuoY8kJHnN7DRLAHf5pR9

# Tag current production state
git tag production-v1.0.0
git push origin production-v1.0.0

# Create and push production branch
git checkout -b production
git push -u origin production
```

**Step 2: Create Staging Branch from Main**

```bash
# Main stays as development - just create staging from it
git checkout main
git checkout -b staging
git push -u origin staging
```

**Step 3: Main Stays as Development (No Changes Needed)**

```bash
# main branch stays as-is - it's your active development branch
# Claude Code will create feature branches from main
# Claude Code will create PRs to main
# No action needed for main
```

**Result:**
```
✅ production branch → Ready for ultudy.com
✅ staging branch → Ready for staging.ultudy.com
✅ main branch → Active development (unchanged)
```

---

### Phase 2: Vercel Configuration (20 minutes)

**Step 1: Update Production Branch**

```
1. Go to Vercel Dashboard → ultudy project
2. Settings → Git → Production Branch
3. Change from current branch to: production
4. Save
```

**Step 2: Set Up Staging Environment**

```
Option A: Separate Vercel Project (Recommended)
1. Vercel Dashboard → Add New Project
2. Import from Git → Select your repository
3. Configure:
   - Project Name: ultudy-staging
   - Framework: Next.js
   - Root Directory: frontend
   - Build Command: npm run build
   - Branch: staging
4. Environment Variables → Copy from production, update:
   - NEXT_PUBLIC_BACKEND_URL=https://ultudy-backend-staging.up.railway.app
   - CLERK_* (use staging/test keys)
5. Deploy

Option B: Same Project, Custom Domain
1. Settings → Domains → Add Domain
2. staging.ultudy.com
3. Settings → Git → Deploy Hooks
4. Create deploy hook for staging branch
```

**Step 3: Configure DNS for Staging**

```
Go to your domain registrar (Namecheap, GoDaddy, etc.)

Add CNAME record:
  Type: CNAME
  Name: staging
  Value: cname.vercel-dns.com
  TTL: 3600

Wait 5-10 minutes for propagation
```

**Step 4: Enable Preview Deployments**

```
Vercel Dashboard → Settings → Git
✅ Automatic deployments for all branches
✅ Preview deployments
✅ Comments on Pull Requests
```

---

### Phase 3: Railway Configuration (25 minutes)

**Step 1: Duplicate Production Service for Staging**

```
Option A: Manual Setup
1. Railway Dashboard → New Project
2. Name: ultudy-backend-staging
3. Add service → GitHub Repo → Select branch: staging
4. Configure:
   - Root Directory: /backend
   - Build Command: npm install
   - Start Command: npm start

Option B: From Template
1. Current production service → Settings
2. Duplicate service (if available)
3. Update branch to staging
```

**Step 2: Set Up Staging Database**

```
Railway → ultudy-backend-staging → Add Database → PostgreSQL

OR use separate Neon database:
1. Neon Dashboard → Create Database → ultudy_staging
2. Copy DATABASE_URL
3. Add to Railway staging service
```

**Step 3: Set Up Staging Redis**

```
Railway → ultudy-backend-staging → Add Database → Redis

This creates staging-specific Redis instance
```

**Step 4: Configure Environment Variables**

```
Railway → ultudy-backend-staging → Variables

Copy from production, update:
- DATABASE_URL=postgresql://...neon-staging.../ultudy_staging
- REDIS_URL=redis://staging-redis.railway.internal:6379
- AUTH_JWT_ISS=https://your-staging-clerk.clerk.accounts.dev
- AUTH_JWT_JWKS_URL=https://your-staging-clerk.../.well-known/jwks.json
- ALLOWED_ORIGINS=https://staging.ultudy.com
- NODE_ENV=staging
```

**Step 5: Development Service (Optional)**

```
Only needed if you want deployed backend for main branch
Otherwise, use local backend during development

If creating:
- Branch: main
- Database: ultudy_development or local database
- Domain: Railway auto-generated
```

---

### Phase 4: Database Setup (15 minutes)

**Step 1: Create Staging Database**

```bash
# Option A: Neon Dashboard
1. Go to Neon console
2. Create new project: ultudy-staging
3. Copy connection string
4. Add to Railway staging service

# Option B: Use dump-schema to replicate structure
cd backend
node scripts/dump-schema.cjs > production-schema.sql

# Connect to staging database
DATABASE_URL="postgresql://...staging..." node scripts/run-schema.js
```

**Step 2: Seed Staging Data (Optional)**

```bash
# Create seed script for staging
cd backend/scripts
# Add test data for staging environment
```

---

### Phase 5: Clerk Staging Setup (10 minutes)

**Option A: Separate Clerk Application (Recommended)**

```
1. Clerk Dashboard → Create Application
2. Name: Ultudy Staging
3. Copy:
   - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   - CLERK_SECRET_KEY
4. Add to Vercel staging environment variables
5. Configure OAuth providers for staging
6. Update JWT settings in Railway staging backend
```

**Option B: Same Clerk App, Development Instance**

```
Clerk Dashboard → Development → Enable
Use test keys for staging/development
```

---

### Phase 6: Branch Protection Rules (5 minutes)

**GitHub Repository Settings:**

```
Settings → Branches → Add rule

For 'production' branch:
✅ Require pull request reviews (1 reviewer)
✅ Require status checks to pass
✅ Require branches to be up to date
✅ Include administrators
✅ Restrict who can push (admins only)

For 'staging' branch:
✅ Require pull request reviews
✅ Require status checks to pass

For 'develop' branch:
✅ Require status checks to pass
```

---

### Phase 7: Create Landing Page (30 minutes)

**Option A: Simple Next.js Landing Page**

**File:** `frontend/src/app/page.tsx`

```typescript
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100">
      {/* Header */}
      <header className="p-6">
        <nav className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-900">Ultudy</h1>
          <Link
            href="/sign-in"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Sign In
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            AI-Powered Learning Platform
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Transform your PDFs into personalized study materials with
            AI-generated lessons, concept tracking, and mastery monitoring.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/sign-up"
              className="px-8 py-3 bg-primary-600 text-white text-lg rounded-lg hover:bg-primary-700"
            >
              Get Started Free
            </Link>
            <Link
              href="/courses"
              className="px-8 py-3 bg-white text-primary-600 text-lg rounded-lg border-2 border-primary-600 hover:bg-primary-50"
            >
              View Demo
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-20 grid md:grid-cols-3 gap-8">
          <div className="p-6 bg-white rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-3">📚 PDF Upload</h3>
            <p className="text-gray-600">
              Upload textbooks, lecture notes, or any study material
            </p>
          </div>
          <div className="p-6 bg-white rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-3">🤖 AI Lessons</h3>
            <p className="text-gray-600">
              Get personalized lessons generated from your materials
            </p>
          </div>
          <div className="p-6 bg-white rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-3">📊 Progress Tracking</h3>
            <p className="text-gray-600">
              Monitor your mastery with concept-level tracking
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-20 py-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-600">
          <p>© 2025 Ultudy. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
```

**Option B: Redirect to App (Temporary)**

```typescript
// frontend/src/app/page.tsx
import { redirect } from 'next/navigation';

export default function LandingPage() {
  redirect('/courses');
}
```

**Deploy:**
```bash
git checkout production
# Edit frontend/src/app/page.tsx
git add frontend/src/app/page.tsx
git commit -m "Add landing page for production"
git push origin production
# Vercel auto-deploys to ultudy.com
```

---

### Phase 8: Testing & Verification (15 minutes)

**Test Production:**
```
1. Visit https://ultudy.com
   ✅ Landing page loads
   ✅ Sign up/sign in work
   ✅ App functionality intact

2. Check Railway logs
   ✅ Backend responds
   ✅ Database connected
   ✅ Redis connected
```

**Test Staging:**
```
1. Visit https://staging.ultudy.com
   ✅ Staging environment loads
   ✅ Uses staging backend
   ✅ Separate database

2. Test deployment flow:
   git checkout staging
   git commit --allow-empty -m "Test deployment"
   git push origin staging
   ✅ Vercel auto-deploys
   ✅ Railway auto-deploys
```

**Test Claude Workflow:**
```
1. Ask Claude to create a feature
   User: "Claude, add a test feature"

2. Claude creates feature branch
   Claude: git checkout -b feature/test-pipeline
   Claude: [develops feature]
   Claude: git push -u origin feature/test-pipeline
   Claude: gh pr create --base main

3. Check GitHub & Vercel
   ✅ PR created to main branch
   ✅ Vercel preview deployment created
   ✅ Unique URL generated

4. Merge PR
   ✅ Feature branch auto-deleted
   ✅ Changes in main branch
```

---

## 📊 Final Checklist

- [ ] Production branch created and protected
- [ ] Staging branch created
- [ ] Main branch kept as development (no changes)
- [ ] Vercel production points to production branch
- [ ] Vercel staging deployed (staging.ultudy.com)
- [ ] Railway production service configured
- [ ] Railway staging service configured
- [ ] Staging database created and configured
- [ ] Staging Redis configured
- [ ] Clerk staging app created (or dev mode enabled)
- [ ] Branch protection rules enabled
- [ ] Landing page deployed to production
- [ ] All environments tested and verified
- [ ] Claude Code workflow tested
- [ ] Team documentation updated

---

## 🔄 Next Steps

1. **Start using Claude Code:**
   - Share DEVELOPMENT_PIPELINE.md with team
   - Request features: "Claude, add X feature"
   - Claude creates feature branches → PRs to main
   - Review and merge PRs
   - Promote main → staging → production when ready

2. **Set up monitoring:**
   - Vercel Analytics for all environments
   - Railway monitoring for all services
   - Error tracking (Sentry, LogRocket, etc.)

3. **Automate testing:**
   - Add GitHub Actions for CI/CD
   - Run tests on PR creation
   - Automated deployment notifications

4. **Document processes:**
   - Create PR templates
   - Add commit message guidelines
   - Document release process

---

## 🚨 Rollback Plan

If something goes wrong:

```bash
# Revert to pre-pipeline state
git checkout production
git reset --hard production-v1.0.0
git push --force origin production

# Vercel will auto-deploy the rollback
# Railway will auto-deploy the rollback

# Or manually rollback in Vercel/Railway dashboards
```

---

## 📞 Support

If you encounter issues:

1. Check logs:
   - Vercel: Deployment logs in dashboard
   - Railway: Service logs in dashboard

2. Verify environment variables:
   - Vercel: Settings → Environment Variables
   - Railway: Service → Variables

3. Test database connectivity:
   ```bash
   node backend/scripts/dump-schema.cjs
   ```

4. Refer to:
   - `PRODUCTION_FIXES.md` for common issues
   - `DEPLOYMENT_GUIDE.md` for deployment troubleshooting

---

**Estimated Total Time:** 2-3 hours

**Best Practice:** Implement during low-traffic period, test thoroughly in staging before production release.
