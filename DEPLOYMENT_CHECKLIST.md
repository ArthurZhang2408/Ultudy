# Ultudy Production Deployment Checklist

**Last Updated:** 2025-01-17

Use this checklist to ensure a smooth deployment to production.

---

## Pre-Deployment Checklist

### 1. Domain & DNS
- [ ] Domain ultudy.com purchased
- [ ] Domain registrar account accessible
- [ ] DNS management access confirmed

### 2. Accounts Created
- [ ] Vercel account (https://vercel.com) - Free
- [ ] Railway account (https://railway.app) - $5 credit
- [ ] Neon/Supabase account (database) - Free tier
- [ ] Clerk account (auth) - Free tier
- [ ] Google AI Studio (Gemini API) - Free tier

### 3. Code Ready
- [ ] Latest code committed to GitHub
- [ ] All tests passing (if applicable)
- [ ] Environment variable examples reviewed
- [ ] Dependencies up to date

---

## Deployment Steps

### Phase 1: Database Setup (10 min)
- [ ] Neon/Supabase project created
- [ ] Database connection string saved securely
- [ ] Database accessible (test connection)

### Phase 2: Backend Deployment (20 min)
- [ ] Railway project created
- [ ] GitHub repository connected
- [ ] Environment variables configured:
  - [ ] `DATABASE_URL`
  - [ ] `GEMINI_API_KEY`
  - [ ] `AUTH_MODE=jwt`
  - [ ] `AUTH_JWT_ISS`, `AUTH_JWT_AUD`, `AUTH_JWT_JWKS_URL`
  - [ ] `NODE_ENV=production`
  - [ ] `ALLOWED_ORIGINS`
- [ ] Backend deployed successfully
- [ ] Backend URL saved (e.g., `https://xxx.up.railway.app`)
- [ ] Health check passing: `/db/health` returns `{"status":"ok"}`

### Phase 3: Database Migrations (5 min)
- [ ] Railway CLI installed (or using local terminal)
- [ ] Database migrations executed successfully
- [ ] Performance indexes created
- [ ] Database schema verified

### Phase 4: Authentication Setup (15 min)
- [ ] Clerk application created
- [ ] Sign-in methods configured (email, Google, etc.)
- [ ] JWT template created
- [ ] API keys copied:
  - [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - [ ] `CLERK_SECRET_KEY`
- [ ] Clerk JWT settings copied to Railway backend
- [ ] Production domains added to Clerk (ultudy.com)

### Phase 5: Frontend Deployment (15 min)
- [ ] Vercel project created
- [ ] GitHub repository connected
- [ ] Root directory set to `frontend`
- [ ] Environment variables configured:
  - [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - [ ] `CLERK_SECRET_KEY`
  - [ ] `NEXT_PUBLIC_API_URL`
  - [ ] Clerk redirect URLs
- [ ] Frontend deployed successfully
- [ ] Vercel URL accessible (e.g., `https://ultudy-xxx.vercel.app`)

### Phase 6: Domain Configuration (15 min)
- [ ] Custom domain added in Vercel (`ultudy.com`)
- [ ] www subdomain added (`www.ultudy.com`) - optional
- [ ] DNS records obtained from Vercel
- [ ] DNS records added to domain registrar:
  - [ ] A record for `@` → Vercel IP
  - [ ] CNAME record for `www` → `cname.vercel-dns.com`
- [ ] DNS propagation verified (5-30 min)
- [ ] HTTPS certificate issued by Vercel (automatic)
- [ ] Domain accessible at https://ultudy.com

### Phase 7: CORS Update (5 min)
- [ ] Backend `ALLOWED_ORIGINS` updated with production domain
- [ ] Railway backend redeployed
- [ ] CORS working (test from frontend)

---

## Post-Deployment Testing

### Authentication Tests
- [ ] Visit https://ultudy.com
- [ ] Sign up flow works
- [ ] Email verification works
- [ ] Sign in works
- [ ] Sign out works
- [ ] Protected routes require auth

### Core Feature Tests
- [ ] Create a course
- [ ] Upload a PDF (small test file < 5MB)
- [ ] PDF processing completes
- [ ] Sections appear correctly
- [ ] Generate a lesson
- [ ] Lesson displays properly
- [ ] Answer check-in questions
- [ ] Progress tracking updates
- [ ] Navigate between courses

### Performance Tests
- [ ] Page load time < 3 seconds
- [ ] No console errors (F12 dev tools)
- [ ] Backend health endpoint responding
- [ ] Database queries completing quickly

### Mobile Tests
- [ ] Site loads on mobile browser
- [ ] Navigation works on mobile
- [ ] Forms are usable on mobile

---

## Security Checklist

- [ ] All API keys in environment variables (not in code)
- [ ] `AUTH_MODE=jwt` (not dev mode)
- [ ] CORS configured with specific domains (not `*`)
- [ ] Database connection uses SSL (`?sslmode=require`)
- [ ] Clerk production keys (not test keys)
- [ ] HTTPS enabled (automatic with Vercel)
- [ ] No sensitive data in logs
- [ ] Rate limiting considered (if high traffic expected)

---

## Monitoring Setup

### Immediate
- [ ] Vercel dashboard bookmarked
- [ ] Railway dashboard bookmarked
- [ ] Neon/Supabase dashboard bookmarked
- [ ] Clerk dashboard bookmarked

### Recommended (Optional)
- [ ] Error tracking (Sentry, LogRocket)
- [ ] Analytics (Vercel Analytics, Google Analytics)
- [ ] Uptime monitoring (UptimeRobot, Pingdom)
- [ ] Database backup verification

---

## Cost Tracking

### Current Setup (Month 1)
- Domain: $_______ /year ÷ 12 = $_______ /month
- Vercel: $0 (free tier)
- Railway: $0-5 (free credit)
- Database: $0 (free tier)
- Clerk: $0 (free tier)
- **Total: $_______ /month**

### Projected (at 100 users)
- Domain: $_______
- Vercel: $_______
- Railway: $_______
- Database: $_______
- Clerk: $_______
- Redis (optional): $_______
- **Total: $_______ /month**

---

## Rollback Plan

If something goes wrong:

### Rollback Frontend
1. Go to Vercel dashboard → Deployments
2. Find last working deployment
3. Click "..." → "Redeploy"

### Rollback Backend
1. Go to Railway dashboard → Deployments
2. Find last working deployment
3. Click "Redeploy"

### Emergency Contacts
- Railway Support: https://railway.app/help
- Vercel Support: https://vercel.com/help
- Neon Support: https://neon.tech/docs/introduction/support
- Clerk Support: https://clerk.com/support

---

## Next Steps After Deployment

### Week 1: Monitor
- [ ] Check error logs daily
- [ ] Monitor user signups
- [ ] Verify all features working
- [ ] Collect user feedback

### Week 2: Optimize
- [ ] Review SCALABILITY_GUIDE.md
- [ ] Consider adding Redis if >100 users
- [ ] Set up automated backups
- [ ] Configure monitoring alerts

### Month 1: Scale
- [ ] Analyze usage patterns
- [ ] Plan for scaling (see SCALABILITY_GUIDE.md)
- [ ] Consider S3 storage if >100 PDFs
- [ ] Review costs and optimize

---

## Troubleshooting Quick Reference

| Issue | Check | Fix |
|-------|-------|-----|
| Frontend won't load | DNS settings | Verify A/CNAME records |
| API calls fail | CORS | Update `ALLOWED_ORIGINS` |
| Auth broken | Clerk config | Verify JWT settings |
| DB connection error | Connection string | Check `DATABASE_URL` |
| PDF upload fails | File size | Check `MAX_FILE_SIZE_MB` |
| Slow performance | Database | Run migrations for indexes |

---

## Success Criteria

Your deployment is successful when:

✅ https://ultudy.com loads without errors
✅ Users can sign up and sign in
✅ PDFs can be uploaded and processed
✅ Lessons can be generated and viewed
✅ Progress tracking works correctly
✅ All backend health checks pass
✅ No critical errors in logs
✅ Mobile experience is functional

---

**Deployment Date:** _____________
**Deployed By:** _____________
**Production URL:** https://ultudy.com
**Backend URL:** _____________
**Database:** _____________

**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Completed ✅

---

For detailed instructions, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
