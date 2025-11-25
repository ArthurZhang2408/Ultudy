# Ultudy Deployment Guide to ultudy.com

**Last Updated:** 2025-01-17
**Purpose:** Complete guide to deploy Ultudy to production on ultudy.com

---

## Overview

This guide walks you through deploying Ultudy with:
- **Frontend**: Vercel (Next.js) - Free tier available
- **Backend**: Railway or Render - ~$5-10/month
- **Database**: Neon (PostgreSQL) - Free tier available
- **Domain**: ultudy.com (purchased separately)

**Total estimated cost**: $0-15/month to start

---

## Step 1: Purchase Domain (5 minutes)

### Recommended Registrars:
1. **Namecheap** (https://namecheap.com) - ~$9/year
2. **Cloudflare** (https://cloudflare.com) - ~$10/year + free CDN
3. **Google Domains** (https://domains.google) - ~$12/year

### Steps:
1. Go to your chosen registrar
2. Search for "ultudy.com"
3. Add to cart and complete purchase
4. **Don't configure DNS yet** - we'll do that after deployment

---

## Step 2: Set Up Production Database (10 minutes)

We'll use **Neon** - serverless PostgreSQL with a generous free tier.

### Create Database:

1. Go to https://neon.tech
2. Sign up with GitHub/Google
3. Click "Create a project"
4. Configure:
   - **Name**: ultudy-production
   - **Region**: Choose closest to your users (e.g., US East, EU West)
   - **PostgreSQL version**: 15 or 16
5. Click "Create project"
6. **Copy the connection string** - looks like:
   ```
   postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/ultudy?sslmode=require
   ```
7. **Save this securely** - you'll need it for backend deployment

### Alternative: Supabase (also free tier)
- Go to https://supabase.com
- Create new project
- Get connection string from Settings → Database

---

## Step 3: Deploy Backend to Railway (15 minutes)

Railway offers $5 free credit monthly (enough for small apps).

### Deploy Backend:

1. **Go to https://railway.app**
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Authorize Railway to access your GitHub
5. Select your Ultudy repository
6. Configure deployment:
   - **Root Directory**: `/backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

7. **Add Environment Variables** (click "Variables" tab):

```env
# Database
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/ultudy?sslmode=require

# Authentication (we'll configure later)
AUTH_MODE=jwt
AUTH_JWT_ISS=https://your-app.clerk.accounts.dev
AUTH_JWT_AUD=your-audience
AUTH_JWT_JWKS_URL=https://your-app.clerk.accounts.dev/.well-known/jwks.json

# AI Provider - Use Gemini (recommended)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_GEN_MODEL=gemini-1.5-flash

# Node environment
NODE_ENV=production
PORT=3001

# CORS - Update after deploying frontend
ALLOWED_ORIGINS=https://ultudy.com,https://www.ultudy.com

# File upload limits
MAX_FILE_SIZE_MB=50

# Optional: Redis (add later for caching)
# REDIS_URL=redis://default:password@redis-xyz.cloud.redislabs.com:12345

# Optional: S3 Storage (add later for scaling)
# AWS_ACCESS_KEY_ID=AKIA...
# AWS_SECRET_ACCESS_KEY=...
# AWS_S3_BUCKET=ultudy-pdfs
# AWS_REGION=us-east-1
```

8. **Deploy**: Railway will automatically deploy
9. **Copy your backend URL** - looks like: `https://ultudy-backend-production.up.railway.app`

### Get Gemini API Key:
1. Go to https://aistudio.google.com/
2. Sign in with Google
3. Click "Get API Key"
4. Create new key
5. Copy and add to Railway environment variables

### Alternative: Render
- Similar process at https://render.com
- Free tier available (sleeps after inactivity)
- $7/month for always-on

---

## Step 4: Run Database Migrations (5 minutes)

Before deploying frontend, initialize the database.

### Option A: Using Railway CLI

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Login and link project:
```bash
railway login
railway link
```

3. Run migrations:
```bash
railway run node src/db/migrations/run.js
```

### Option B: Using Local Terminal

1. Set environment variable temporarily:
```bash
export DATABASE_URL="postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/ultudy?sslmode=require"
```

2. Run migrations from backend directory:
```bash
cd backend
node src/db/migrations/run.js
```

You should see:
```
[Migrations] Connected successfully
[Migrations] Running 001_add_performance_indexes.sql...
[Migrations] ✓ All migrations completed successfully! 🎉
```

---

## Step 5: Set Up Clerk Authentication (15 minutes)

1. **Go to https://clerk.com**
2. Sign up for free account
3. Create new application:
   - **Name**: Ultudy
   - **Sign-in options**: Email, Google, GitHub (your choice)
4. Click "Create application"

### Configure Clerk:

1. Go to **API Keys** in left sidebar
2. Copy these values:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`

3. Go to **JWT Templates** in left sidebar
4. Click "New template" → "Blank"
5. Name it "ultudy"
6. Click "Apply changes"

7. Go to **Domains** (for production URLs):
   - Add production domain: `ultudy.com`
   - Add www domain: `www.ultudy.com`

8. **Update Railway backend** environment variables:
   - `AUTH_JWT_ISS`: Copy from JWT template (looks like: `https://your-app.clerk.accounts.dev`)
   - `AUTH_JWT_AUD`: Your Clerk frontend API
   - `AUTH_JWT_JWKS_URL`: `https://your-app.clerk.accounts.dev/.well-known/jwks.json`

---

## Step 6: Deploy Frontend to Vercel (10 minutes)

1. **Go to https://vercel.com**
2. Sign up with GitHub
3. Click "Add New" → "Project"
4. Import your Ultudy repository
5. Configure project:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next` (auto)

6. **Add Environment Variables**:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Backend API URL (from Railway)
NEXT_PUBLIC_BACKEND_URL=https://ultudy-backend-production.up.railway.app

# Clerk Frontend API
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/courses
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/courses
```

7. Click "Deploy"
8. Wait for deployment (2-3 minutes)
9. **Copy your Vercel URL** - looks like: `https://ultudy-abc123.vercel.app`

---

## Step 7: Configure Custom Domain (10 minutes)

### In Vercel:

1. Go to your project → Settings → Domains
2. Add domain:
   - Add `ultudy.com`
   - Add `www.ultudy.com` (optional)
3. Vercel will show DNS records you need to add

### In Your Domain Registrar:

#### If using Namecheap:
1. Go to Domain List → Manage
2. Advanced DNS
3. Add records as shown by Vercel:
   - **Type**: A Record
   - **Host**: `@`
   - **Value**: `76.76.21.21` (Vercel's IP)
   - **TTL**: Automatic

   - **Type**: CNAME
   - **Host**: `www`
   - **Value**: `cname.vercel-dns.com`
   - **TTL**: Automatic

#### If using Cloudflare:
1. Go to DNS → Records
2. Add same records
3. **Important**: Set proxy status to "DNS only" (gray cloud)

### Verify Domain:
- Wait 5-10 minutes for DNS propagation
- Visit https://ultudy.com
- Should see your app!

---

## Step 8: Configure Backend CORS (5 minutes)

Update Railway backend environment variable:

```env
ALLOWED_ORIGINS=https://ultudy.com,https://www.ultudy.com,https://ultudy-abc123.vercel.app
```

Save and redeploy.

---

## Step 9: Test Production Deployment (10 minutes)

### Test Checklist:

1. **Visit https://ultudy.com**
   - [ ] Site loads correctly
   - [ ] No console errors (press F12)

2. **Test Authentication**:
   - [ ] Click "Sign In"
   - [ ] Create new account
   - [ ] Verify email works
   - [ ] Can sign in successfully

3. **Test Core Features**:
   - [ ] Create a course
   - [ ] Upload a PDF (use small test file first)
   - [ ] Check upload status
   - [ ] Generate a lesson
   - [ ] Complete a check-in
   - [ ] View progress tracking

4. **Check Backend Health**:
   ```bash
   curl https://ultudy-backend-production.up.railway.app/db/health
   ```
   Should return: `{"status":"ok"}`

---

## Step 10: Enable Production Optimizations (Optional)

### A. Add Redis Caching (2x performance)

1. **Create Redis instance**:
   - Railway: Add Redis service to your project
   - Or use Redis Cloud: https://redis.com/try-free/

2. **Add to Railway backend**:
   ```env
   REDIS_URL=redis://default:password@redis-xyz.cloud.redislabs.com:12345
   ```

### B. Enable S3 Storage (for scaling)

1. **Create S3 bucket** (see SCALABILITY_GUIDE.md Step 3)
2. **Add to Railway backend**:
   ```env
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_S3_BUCKET=ultudy-pdfs
   AWS_REGION=us-east-1
   ```

---

## Monitoring & Maintenance

### Check Application Health:
- **Vercel Dashboard**: Monitor frontend deployments, errors
- **Railway Dashboard**: Monitor backend performance, logs
- **Neon Dashboard**: Monitor database usage, connection pool

### View Logs:
```bash
# Railway CLI
railway logs

# Vercel CLI
vercel logs
```

### Database Backups:
- **Neon**: Automatic backups (free tier: 7 days)
- **Supabase**: Automatic backups (free tier: 7 days)

---

## Cost Breakdown

### Free Tier (0-100 users):
- **Domain**: $9-12/year (~$1/month)
- **Frontend (Vercel)**: Free
- **Backend (Railway)**: $5/month credit (free)
- **Database (Neon)**: Free (3GB storage)
- **Total**: ~$1/month

### Paid Tier (100-1000 users):
- **Domain**: $1/month
- **Frontend (Vercel)**: Free or $20/month (Pro)
- **Backend (Railway)**: $5-10/month
- **Database (Neon)**: Free or $19/month (Pro)
- **Redis**: $5/month (optional)
- **Total**: $6-50/month

---

## Troubleshooting

### Frontend shows "Failed to fetch"
- Check `NEXT_PUBLIC_BACKEND_URL` in Vercel
- Verify backend is running on Railway
- Check CORS settings in backend

### Database connection errors
- Verify `DATABASE_URL` is correct
- Check Neon dashboard for connection limits
- Ensure `?sslmode=require` is in connection string

### Authentication not working
- Verify all Clerk environment variables
- Check Clerk dashboard for allowed domains
- Ensure JWT template is configured

### PDF upload fails
- Check `MAX_FILE_SIZE_MB` in backend
- Verify Gemini API key is set
- Check Railway logs for errors

---

## Security Checklist

Before going live:

- [ ] Change `AUTH_MODE=jwt` (not dev)
- [ ] All API keys are in environment variables (not code)
- [ ] CORS is configured with specific domains (not `*`)
- [ ] Database uses SSL (`?sslmode=require`)
- [ ] Clerk production instance (not test keys)
- [ ] HTTPS enabled (Vercel does this automatically)

---

## Next Steps

After successful deployment:

1. **Monitor Usage**: Watch Railway, Vercel, Neon dashboards
2. **Set Up Analytics**: Add Vercel Analytics or Google Analytics
3. **Enable Monitoring**: Set up error tracking (Sentry, LogRocket)
4. **Plan Scaling**: Review SCALABILITY_GUIDE.md when you hit 500+ users
5. **Backup Strategy**: Configure database backups

---

## Quick Reference

### Deployment URLs:
- **Frontend**: https://ultudy.com
- **Backend**: https://ultudy-backend-production.up.railway.app
- **Database**: Neon dashboard

### Important Commands:
```bash
# Redeploy frontend
cd frontend && git push

# Redeploy backend
cd backend && git push

# Run migrations
railway run node src/db/migrations/run.js

# Check health
curl https://ultudy-backend-production.up.railway.app/db/health
```

---

**Your app is now live at https://ultudy.com! 🚀**

For questions or issues, see DOCUMENTATION_INDEX.md or check the Troubleshooting section above.
