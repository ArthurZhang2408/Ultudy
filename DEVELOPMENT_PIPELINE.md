# Development Pipeline & Environment Strategy

**Last Updated:** 2025-01-18
**Status:** Current
**Purpose:** Define the complete development workflow from feature development to production deployment

---

## 🎯 Environment Overview

| Environment | Purpose | Domain | Branch | Auto-Deploy |
|-------------|---------|--------|--------|-------------|
| **Production** | Live app for users | `ultudy.com` | `main` | ✅ Yes |
| **Staging** | Pre-production testing | `staging.ultudy.com` or Vercel preview | `staging` | ✅ Yes |
| **Testing** | Integration testing | `testing.ultudy.com` or Vercel preview | `develop` | ✅ Yes |
| **Development** | Feature development | Local or Vercel preview | `feature/*` | ⚠️ Preview only |

---

## 📊 Current State & Migration Plan

### Current Setup (As of 2025-01-18)

```
main branch → Contains working code (should be staging)
deploy-ultudy-domain branch → Production fixes (should merge to main)
ultudy.com → Deployed from deploy-ultudy-domain branch
```

### Migration Steps

**Step 1: Preserve Current Production**
```bash
# Tag current production state
git tag production-v1.0.0

# Create production branch from current deploy branch
git checkout deploy-ultudy-domain
git checkout -b production
git push -u origin production
```

**Step 2: Reorganize Branches**
```bash
# Merge deploy fixes into main (becomes staging)
git checkout main
git merge deploy-ultudy-domain

# Create develop branch from main
git checkout -b develop
git push -u origin develop

# Update main to be production-ready
git checkout main
# Add landing page (see below)
```

**Step 3: Update Deployment Targets**
- Vercel: Point ultudy.com to `production` branch
- Vercel: Create staging.ultudy.com preview from `staging` branch
- Railway: Create separate projects for each environment

---

## 🌳 Git Branching Strategy (Git Flow)

### Branch Hierarchy

```
main (production)
  ↑
  └─── staging (pre-production)
         ↑
         └─── develop (integration)
                ↑
                └─── feature/* (new features)
                └─── bugfix/* (bug fixes)
                └─── hotfix/* (urgent production fixes)
```

### Branch Purposes

#### `main` - Production
- **Purpose:** Production-ready code deployed to ultudy.com
- **Protection:** Require pull request reviews, CI/CD checks
- **Deploy to:** Production (ultudy.com)
- **Merge from:** `staging` only (after thorough testing)

#### `staging` - Pre-Production
- **Purpose:** Final testing before production release
- **Protection:** Require pull request reviews
- **Deploy to:** staging.ultudy.com or Vercel preview
- **Merge from:** `develop` (after integration testing passes)

#### `develop` - Integration Testing
- **Purpose:** Integrate all feature branches for testing
- **Protection:** Basic CI/CD checks
- **Deploy to:** testing.ultudy.com or Vercel preview
- **Merge from:** `feature/*`, `bugfix/*`

#### `feature/*` - Feature Development
- **Purpose:** Individual feature development
- **Naming:** `feature/user-profile`, `feature/payment-integration`
- **Deploy to:** Vercel preview URLs (optional)
- **Merge to:** `develop` via pull request

#### `bugfix/*` - Bug Fixes
- **Purpose:** Non-urgent bug fixes
- **Naming:** `bugfix/upload-progress-animation`
- **Merge to:** `develop`

#### `hotfix/*` - Urgent Production Fixes
- **Purpose:** Critical production bugs that can't wait for release cycle
- **Naming:** `hotfix/security-patch`, `hotfix/auth-failure`
- **Merge to:** `main` AND `develop` (keep in sync)

---

## 🚀 Deployment Workflow

### Feature Development → Production

```
1. Create feature branch from develop
   git checkout develop
   git pull origin develop
   git checkout -b feature/new-feature

2. Develop and commit
   [Make changes]
   git add .
   git commit -m "Add new feature"

3. Push and create PR to develop
   git push -u origin feature/new-feature
   [Create PR: feature/new-feature → develop]

4. Merge to develop (after code review)
   [PR merged, auto-deploys to testing environment]

5. Test in testing environment
   [QA team tests at testing.ultudy.com]

6. Promote to staging
   git checkout staging
   git merge develop
   git push origin staging
   [Auto-deploys to staging.ultudy.com]

7. Final testing in staging
   [Stakeholder review at staging.ultudy.com]

8. Release to production
   git checkout main
   git merge staging
   git tag v1.1.0
   git push origin main --tags
   [Auto-deploys to ultudy.com]
```

### Hotfix Workflow (Urgent Production Fix)

```
1. Create hotfix branch from main
   git checkout main
   git checkout -b hotfix/critical-bug

2. Fix the bug
   [Make minimal changes to fix critical issue]
   git commit -m "hotfix: Fix critical authentication bug"

3. Merge to main (production)
   git checkout main
   git merge hotfix/critical-bug
   git tag v1.0.1
   git push origin main --tags
   [Auto-deploys to production]

4. Merge back to develop (keep in sync)
   git checkout develop
   git merge hotfix/critical-bug
   git push origin develop

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
Branch: main
Environment Variables:
  - NEXT_PUBLIC_API_URL=https://ultudy-backend-production.up.railway.app
  - CLERK_* (production keys)
  - NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/courses
```

**Staging Environment:**
```
Project: ultudy-staging (or same project, different branch)
Domain: staging.ultudy.com or auto-generated
Branch: staging
Environment Variables:
  - NEXT_PUBLIC_API_URL=https://ultudy-backend-staging.up.railway.app
  - CLERK_* (test/staging keys)
```

**Testing/Development:**
```
Branch: develop or feature/*
Environment Variables: Same as staging
Deploy: Automatic preview URLs
```

**Vercel Configuration:**

1. **Go to Vercel Dashboard → Project Settings → Git**
   - Production Branch: `main`
   - Automatic deployments for all branches: Enabled
   - Preview deployments: Enabled

2. **Environment Variables by Environment:**
   ```
   Production: main branch only
   Preview: staging, develop, feature/* branches
   Development: Local .env files
   ```

3. **Custom Domains:**
   ```
   ultudy.com → main branch (production)
   staging.ultudy.com → staging branch
   # testing uses auto-generated URLs
   ```

---

### Railway Setup (Backend)

**Production Service:**
```
Service: ultudy-backend-production
Branch: main
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

**Testing/Development Service:**
```
Service: ultudy-backend-testing
Branch: develop
Environment Variables: Similar to staging
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

### Weekly Release Cycle

**Monday-Thursday: Development**
```
1. Developers create feature branches
2. PRs merged to develop
3. Testing team tests in testing environment
```

**Friday: Staging Promotion**
```
1. Merge develop → staging
2. Stakeholder review in staging environment
3. Final QA checks
```

**Following Monday: Production Release**
```
1. Merge staging → main
2. Tag release (v1.x.0)
3. Monitor production metrics
4. Rollback if issues detected
```

### Database Migration Strategy

**Development:**
```bash
# Create migration on feature branch
cd backend
node src/db/migrations/create.js add_user_preferences

# Test locally
npm run migrate:up
```

**Testing:**
```bash
# Migrations auto-run on develop branch deployment
# Railway runs migrations via start script or separate service
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
git checkout main
git reset --hard v1.0.0
git push --force origin main
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
# Start new feature
git checkout develop && git pull
git checkout -b feature/my-feature

# Merge feature to develop
git checkout develop
git merge feature/my-feature
git push origin develop

# Promote develop to staging
git checkout staging
git merge develop
git push origin staging

# Release to production
git checkout main
git merge staging
git tag v1.1.0
git push origin main --tags

# Urgent hotfix
git checkout main
git checkout -b hotfix/critical-fix
# [make fix]
git checkout main && git merge hotfix/critical-fix
git tag v1.0.1
git push origin main --tags
git checkout develop && git merge hotfix/critical-fix
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

3. **Create first feature branch:**
   ```bash
   git checkout develop
   git checkout -b feature/my-first-feature
   ```

4. **Read documentation:**
   - `README.md` - Project overview
   - `DEVELOPMENT_PIPELINE.md` (this file) - Workflow
   - `DOCUMENTATION_INDEX.md` - All docs

---

**Next Steps:**
1. Implement branching strategy (create staging, develop branches)
2. Set up Vercel environments (production, staging domains)
3. Configure Railway services (separate production, staging, testing)
4. Create landing page for ultudy.com
5. Update team documentation

**Remember:** This pipeline grows with your team. Start simple, add complexity as needed.
