# Development Pipeline & Environment Strategy

**Last Updated:** 2025-01-18
**Status:** Current
**Purpose:** Define the complete development workflow from feature development to production deployment

---

## 🎯 Environment Overview

| Environment | Purpose | Domain | Branch | Auto-Deploy |
|-------------|---------|--------|--------|-------------|
| **Production** | Live app for users | `ultudy.com` | `production` | ✅ Yes |
| **Staging** | Pre-production testing | `staging.ultudy.com` or Vercel preview | `staging` | ✅ Yes |
| **Development** | Active development (Claude PRs here) | Vercel preview | `main` | ✅ Yes |
| **Feature Branches** | Individual features | Vercel preview | `feature/*` | ⚠️ Preview only |

---

## 📊 Current State & Migration Plan

### Current Setup (As of 2025-01-18)

```
main branch → Contains working code (keep as development)
deploy-ultudy-domain branch → Production fixes (will become production)
ultudy.com → Deployed from deploy-ultudy-domain branch
```

### Migration Steps

**Step 1: Create Production Branch**
```bash
# Tag current production state
git tag production-v1.0.0

# Create production branch from current deployment
git checkout deploy-ultudy-domain
git checkout -b production
git push -u origin production
```

**Step 2: Create Staging Branch**
```bash
# Create staging from main (current working code)
git checkout main
git checkout -b staging
git push -u origin staging
```

**Step 3: Main Stays as Development**
```bash
# main branch stays as-is (active development)
# Claude Code will create feature branches and PR to main
# No changes needed to main
```

**Step 4: Update Deployment Targets**
- Vercel: Point ultudy.com to `production` branch
- Vercel: Point staging.ultudy.com to `staging` branch
- Vercel: Point development preview to `main` branch
- Railway: Create separate services for production/staging/main

---

## 🌳 Git Branching Strategy (Simplified)

### Branch Hierarchy

```
production (live site at ultudy.com)
  ↑
  └─── staging (pre-production testing)
         ↑
         └─── main (active development - Claude PRs here)
                ↑
                └─── feature/* (Claude creates these)
                └─── bugfix/* (bug fixes)
                └─── hotfix/* (urgent fixes)
```

### Branch Purposes

#### `production` - Live Production
- **Purpose:** Production-ready code deployed to ultudy.com
- **Protection:** ✅ Require pull request reviews, CI/CD checks, admin-only
- **Deploy to:** Production (ultudy.com)
- **Merge from:** `staging` only (after thorough testing)
- **Who updates:** Team lead / Admin only

#### `staging` - Pre-Production
- **Purpose:** Final testing before production release
- **Protection:** ✅ Require pull request reviews
- **Deploy to:** staging.ultudy.com or Vercel preview
- **Merge from:** `main` (after features are complete)
- **Who updates:** Developer after testing in main

#### `main` - Active Development (Claude works here!)
- **Purpose:** Primary development branch where all features land
- **Protection:** ⚠️ Optional - basic CI/CD checks
- **Deploy to:** Vercel preview (auto-generated URL)
- **Merge from:** `feature/*` branches via pull request
- **Who updates:** **Claude Code creates PRs to main**

#### `feature/*` - Feature Development (Claude creates these)
- **Purpose:** Individual feature development
- **Naming:** `feature/user-profile`, `feature/payment-integration`
- **Created by:** **Claude Code when you request a new feature**
- **Deploy to:** Vercel preview URLs (optional)
- **Merge to:** `main` via pull request (created by Claude)
- **Lifecycle:** Created → Developed → PR to main → Merged → Deleted

#### `bugfix/*` - Bug Fixes
- **Purpose:** Non-urgent bug fixes
- **Naming:** `bugfix/upload-progress-animation`
- **Merge to:** `main`

#### `hotfix/*` - Urgent Production Fixes
- **Purpose:** Critical production bugs that can't wait for release cycle
- **Naming:** `hotfix/security-patch`, `hotfix/auth-failure`
- **Merge to:** `production` AND `main` (keep in sync)

---

## 🚀 Deployment Workflow

### Claude Code Workflow (Your Primary Workflow)

```
1. You request a feature
   User: "Add user profile page"

2. Claude creates feature branch from main
   git checkout main
   git pull origin main
   git checkout -b feature/user-profile

3. Claude develops the feature
   [Claude writes code, tests locally]
   git add .
   git commit -m "Add user profile page with avatar upload"

4. Claude pushes and creates PR to main
   git push -u origin feature/user-profile
   gh pr create --base main --title "Add user profile page"
   [Auto-deploys to Vercel preview for testing]

5. You review and merge PR
   [Review code in GitHub]
   [Click "Merge pull request"]
   [Feature branch auto-deleted]
   [Changes auto-deploy to main's Vercel preview]

6. When ready, promote main → staging (manual)
   git checkout staging
   git merge main
   git push origin staging
   [Auto-deploys to staging.ultudy.com]

7. Final testing in staging
   [Test at staging.ultudy.com]
   [Stakeholder approval]

8. Release to production (manual)
   git checkout production
   git merge staging
   git tag v1.1.0
   git push origin production --tags
   [Auto-deploys to ultudy.com]
```

### Summary: Your Workflow

**Daily development:**
- Claude creates `feature/*` branches
- Claude creates PRs to `main`
- You merge PRs to `main`
- `main` is always your latest development code

**Weekly/bi-weekly releases:**
- Promote `main` → `staging` (test)
- Promote `staging` → `production` (release)

### Hotfix Workflow (Urgent Production Fix)

```
1. Create hotfix branch from production
   git checkout production
   git checkout -b hotfix/critical-bug

2. Fix the bug (or ask Claude to fix it)
   User: "There's a critical auth bug in production"
   [Claude creates hotfix branch, fixes bug]
   git commit -m "hotfix: Fix critical authentication bug"

3. Merge to production (urgent release)
   git checkout production
   git merge hotfix/critical-bug
   git tag v1.0.1
   git push origin production --tags
   [Auto-deploys to ultudy.com immediately]

4. Merge back to main (keep in sync)
   git checkout main
   git merge hotfix/critical-bug
   git push origin main
   [Prevents regression in future releases]

5. Delete hotfix branch
   git branch -d hotfix/critical-bug
```

---

## 🔧 Environment Configuration

### Vercel Setup (Frontend)

**Production Environment:**
```
Project: ultudy-production
Domain: ultudy.com, www.ultudy.com
Branch: production
Environment Variables:
  - NEXT_PUBLIC_BACKEND_URL=https://ultudy-backend-production.up.railway.app
  - CLERK_* (production keys)
  - NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/courses
```

**Staging Environment:**
```
Project: ultudy-staging (or same project, different branch)
Domain: staging.ultudy.com or auto-generated
Branch: staging
Environment Variables:
  - NEXT_PUBLIC_BACKEND_URL=https://ultudy-backend-staging.up.railway.app
  - CLERK_* (test/staging keys)
```

**Development:**
```
Branch: main
Environment Variables: Same as staging
Deploy: Automatic preview URL (e.g., ultudy-main.vercel.app)
```

**Feature Branches:**
```
Branch: feature/*
Environment Variables: Inherits from main
Deploy: Automatic preview URLs (e.g., ultudy-git-feature-xyz.vercel.app)
```

**Vercel Configuration:**

1. **Go to Vercel Dashboard → Project Settings → Git**
   - Production Branch: `production`
   - Automatic deployments for all branches: Enabled
   - Preview deployments: Enabled

2. **Environment Variables by Environment:**
   ```
   Production: production branch only
   Preview: staging, main, feature/* branches
   Development: Local .env files
   ```

3. **Custom Domains:**
   ```
   ultudy.com → production branch
   staging.ultudy.com → staging branch
   # main and feature/* use auto-generated preview URLs
   ```

---

### Railway Setup (Backend)

**Production Service:**
```
Service: ultudy-backend-production
Branch: production
Environment Variables:
  - DATABASE_URL=postgresql://...@neon-production.tech/ultudy
  - REDIS_URL=redis://...@redis-production.railway.internal:6379
  - AUTH_MODE=jwt
  - AUTH_JWT_ISS=https://your-production-clerk.clerk.accounts.dev
  - LLM_PROVIDER=gemini
  - GEMINI_API_KEY=production-key
  - NODE_ENV=production
  - ALLOWED_ORIGINS=https://ultudy.com,https://www.ultudy.com
```

**Staging Service:**
```
Service: ultudy-backend-staging
Branch: staging
Environment Variables:
  - DATABASE_URL=postgresql://...@neon-staging.tech/ultudy_staging
  - REDIS_URL=redis://...@redis-staging.railway.internal:6379
  - AUTH_MODE=jwt (staging Clerk keys)
  - ALLOWED_ORIGINS=https://staging.ultudy.com
```

**Development Service (Optional):**
```
Service: ultudy-backend-development
Branch: main
Environment Variables: Similar to staging
Note: You may not need this if main uses local backend during development
```

**Database Strategy:**
- **Production:** Dedicated Neon database (real user data)
- **Staging:** Separate Neon database (copy of production structure, test data)
- **Testing/Dev:** Separate database or local PostgreSQL

---

## 📦 Environment Variables Management

### Strategy: Separate .env Files per Environment

```
backend/.env.production       # Production secrets
backend/.env.staging          # Staging configuration
backend/.env.development      # Local development
backend/.env.test             # Testing/CI

frontend/.env.production      # Production frontend
frontend/.env.staging         # Staging frontend
frontend/.env.local           # Local development
```

### Security Rules

1. **Never commit .env files** (add to .gitignore)
2. **Use .env.example files** for documentation
3. **Store secrets in platform vaults:**
   - Vercel: Environment Variables dashboard
   - Railway: Service Variables
   - GitHub: Secrets (for CI/CD)

### Syncing Environment Variables

```bash
# Use Vercel CLI to sync environments
vercel env pull .env.local                    # Pull for local dev
vercel env add REDIS_URL production           # Add to production
vercel env ls                                 # List all env vars

# Use Railway CLI
railway variables set REDIS_URL=... --environment production
```

---

## 🏗️ Landing Page for Production

Since you want a landing page on ultudy.com initially, here's the approach:

### Option A: Next.js Landing Page (Recommended)

**File:** `frontend/src/app/page.tsx`

```typescript
// Landing page at ultudy.com (root)
export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero section */}
      <section>
        <h1>Welcome to Ultudy</h1>
        <p>AI-powered study platform</p>
        <Link href="/courses">Get Started</Link>
      </section>

      {/* Features, pricing, testimonials, etc. */}
    </div>
  );
}
```

**Benefits:**
- Same Next.js app, just different landing page
- No separate deployment needed
- Easy to add authentication gate later

### Option B: Separate Landing Page Site

**Create:** `landing/` directory with static HTML/React

**Deploy:** Separate Vercel project for landing.ultudy.com

**Redirect:** ultudy.com → landing, app.ultudy.com → main app

**When to use:** If landing page needs completely different tech stack

---

## 🔄 Maintenance Workflow

### Typical Release Cycle

**Daily: Feature Development (with Claude)**
```
1. You request features from Claude
2. Claude creates feature branches from main
3. Claude creates PRs to main
4. You review and merge PRs
5. main always has latest development code
```

**Weekly/Bi-weekly: Staging Promotion**
```
1. Merge main → staging (when features are ready)
2. Test in staging environment (staging.ultudy.com)
3. Stakeholder review
4. Final QA checks
```

**After Approval: Production Release**
```
1. Merge staging → production
2. Tag release (v1.x.0)
3. Monitor production metrics (ultudy.com)
4. Rollback if issues detected
```

### Database Migration Strategy

**Development (on main):**
```bash
# Claude creates migration on feature branch
cd backend
node src/db/migrations/create.js add_user_preferences

# Test locally
npm run migrate:up

# Merge to main via PR
# Test migration works on main's preview environment
```

**Staging:**
```bash
# Manually review migrations before merging to staging
# Run in staging: node src/db/migrations/run.js
# Verify no data loss
```

**Production:**
```bash
# Run migrations during maintenance window
# Use migration script with rollback capability
# Monitor for errors
```

### Rollback Strategy

**Immediate Rollback (< 5 minutes):**
```bash
# Revert Vercel deployment
vercel rollback

# Or redeploy previous version
git checkout production
git reset --hard v1.0.0
git push --force origin production
```

**Database Rollback:**
```bash
# Run down migration
cd backend
node src/db/migrations/run.js down

# Or restore from backup
# (Neon has point-in-time recovery)
```

---

## 📋 Pre-Release Checklist

Before promoting to production:

- [ ] All tests pass in CI/CD
- [ ] Code review completed
- [ ] Tested in staging environment
- [ ] Database migrations tested
- [ ] Environment variables verified
- [ ] Performance benchmarks met
- [ ] Security scan passed
- [ ] Rollback plan documented
- [ ] Stakeholder approval received
- [ ] Monitoring/alerts configured

---

## 🔍 Monitoring & Alerts

### Production Monitoring

**Vercel:**
- Analytics: Track page views, errors
- Web Vitals: Monitor performance (LCP, FID, CLS)
- Logs: Real-time error tracking

**Railway:**
- Metrics: CPU, memory, network usage
- Logs: Backend errors and warnings
- Uptime: Health check monitoring

**Database (Neon):**
- Query performance
- Connection pool usage
- Storage usage

**Set up alerts for:**
- Error rate > 1% (Vercel)
- Response time > 2s (Railway)
- Database connections > 80% (Neon)
- Deployment failures (both platforms)

---

## 🛠️ Development Tools

### Recommended VS Code Extensions
- GitLens (branch visualization)
- Git Graph (visual git history)
- Vercel (deployment from IDE)

### CLI Tools
```bash
# Install Vercel CLI
npm i -g vercel

# Install Railway CLI
npm i -g @railway/cli

# Git aliases for workflow
git config alias.feature 'checkout -b feature/'
git config alias.hotfix 'checkout -b hotfix/'
```

---

## 📚 Related Documentation

- `DEPLOYMENT_GUIDE.md` - Initial deployment setup
- `PRODUCTION_FIXES.md` - Common production issues
- `SCALABILITY_GUIDE.md` - Scaling beyond 10k users
- `backend/ENV_CONFIGURATION.md` - Environment variables reference

---

## 🚦 Quick Command Reference

```bash
# Claude creates feature (you don't run this, Claude does)
git checkout main && git pull
git checkout -b feature/my-feature
# [Claude develops]
git push -u origin feature/my-feature
gh pr create --base main --title "Add my feature"

# You merge PR via GitHub UI
# Click "Merge pull request" button

# Promote main to staging (you run this when ready)
git checkout staging
git merge main
git push origin staging

# Release staging to production (you run this after testing)
git checkout production
git merge staging
git tag v1.1.0
git push origin production --tags

# Urgent hotfix (Claude or you)
git checkout production
git checkout -b hotfix/critical-fix
# [make fix]
git checkout production && git merge hotfix/critical-fix
git tag v1.0.1
git push origin production --tags
git checkout main && git merge hotfix/critical-fix  # Keep main in sync
```

---

## 🎓 Team Onboarding

For new developers joining the team:

1. **Clone repository:**
   ```bash
   git clone https://github.com/your-org/ultudy.git
   cd ultudy
   ```

2. **Set up local environment:**
   ```bash
   # Copy environment files
   cp backend/.env.example backend/.env
   cp frontend/.env.local.example frontend/.env.local

   # Install dependencies
   cd backend && npm install
   cd ../frontend && npm install
   ```

3. **Understand the workflow:**
   - Claude creates feature branches from `main`
   - Claude creates PRs to `main`
   - You review and merge PRs
   - Promote `main` → `staging` → `production` manually

4. **Read documentation:**
   - `README.md` - Project overview
   - `DEVELOPMENT_PIPELINE.md` (this file) - Workflow
   - `DOCUMENTATION_INDEX.md` - All docs

---

**Next Steps:**
1. Implement branching strategy (create production, staging branches)
2. Set up Vercel environments (production, staging domains)
3. Configure Railway services (separate production, staging)
4. Create landing page for ultudy.com
5. Start using Claude Code to develop features!

**Claude Code Workflow:**
- You: "Add user authentication"
- Claude: Creates `feature/user-auth` branch, develops, creates PR to `main`
- You: Review and merge PR
- Claude: Branch auto-deleted after merge
- You: When ready, promote `main` → `staging` → `production`

**Remember:** `main` is your active development branch. Claude always creates PRs to `main`.
