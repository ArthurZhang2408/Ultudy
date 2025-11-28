# Launch Mode Configuration Guide

**Last Updated:** 2025-11-18
**Purpose:** Guide for switching between landing page (pre-launch) and full application (post-launch)
**Status:** Current

---

## Overview

The Launch Mode feature allows you to easily switch between displaying a landing page and the full application without code changes. This is useful for:

- Working on the product locally while production shows a coming-soon landing page
- Switching to the full app on launch day with a single environment variable change
- A/B testing or temporarily reverting to landing page if needed

---

## How It Works

The application checks the `NEXT_PUBLIC_LAUNCH_MODE` environment variable to determine what to display:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `landing` | Shows "Coming Soon" pre-launch page to **all users** (including authenticated), no sidebar | Pre-launch, maintenance mode |
| `app` | Shows full application (regular landing page only for non-authenticated users) | Post-launch, normal operation |

**Default:** If not set, defaults to `app` mode (full application)

---

## Configuration

### 1. Local Development

**File:** `frontend/.env.local`

```env
# Set to 'app' to work on the full product
NEXT_PUBLIC_LAUNCH_MODE=app
```

This allows you to develop and test the full application locally.

### 2. Production (Pre-Launch)

**In your deployment platform (Vercel, AWS, etc.):**

```env
# Set to 'landing' to show landing page to everyone
NEXT_PUBLIC_LAUNCH_MODE=landing
```

All users (even those who sign in) will see the landing page.

### 3. Production (Post-Launch)

**On launch day, update the environment variable:**

```env
# Set to 'app' to enable full application
NEXT_PUBLIC_LAUNCH_MODE=app
```

Now authenticated users see the full app, non-authenticated users see the landing page.

---

## Deployment Platform Instructions

### Vercel

1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add/Edit `NEXT_PUBLIC_LAUNCH_MODE`
4. Set value to `landing` (pre-launch) or `app` (post-launch)
5. **Important:** Redeploy or the change won't take effect
   - Option A: Push a new commit (triggers automatic deployment)
   - Option B: Manual redeploy from Vercel dashboard

### AWS / Other Platforms

1. Access your environment configuration (ECS, Elastic Beanstalk, etc.)
2. Set environment variable `NEXT_PUBLIC_LAUNCH_MODE=landing` or `app`
3. Restart/redeploy the application

### Docker

**In your `docker-compose.yml` or Dockerfile:**

```yaml
environment:
  - NEXT_PUBLIC_LAUNCH_MODE=landing  # or 'app'
```

Or pass it at runtime:

```bash
docker run -e NEXT_PUBLIC_LAUNCH_MODE=landing your-image
```

---

## Launch Day Checklist

### Pre-Launch Setup (Days/Weeks Before)

- [ ] Verify `frontend/.env.local` is set to `app` for local development
- [ ] Set production environment variable to `NEXT_PUBLIC_LAUNCH_MODE=landing`
- [ ] Deploy to production - confirm landing page is showing
- [ ] Continue developing features locally (they won't appear in production yet)

### On Launch Day

- [ ] **Stop all ongoing development** (or coordinate with team)
- [ ] Verify all features are ready and tested in staging
- [ ] Change production environment variable to `NEXT_PUBLIC_LAUNCH_MODE=app`
- [ ] Trigger a redeploy (or push a small commit to trigger auto-deploy)
- [ ] Wait for deployment to complete (~2-5 minutes)
- [ ] Test the live site:
  - [ ] Landing page still shows for non-authenticated users
  - [ ] Sign up flow works
  - [ ] Authenticated users see the full application
  - [ ] All core features are functional
- [ ] Monitor error logs and user feedback

### Rollback (If Needed)

If issues arise post-launch:

1. Change `NEXT_PUBLIC_LAUNCH_MODE` back to `landing`
2. Redeploy
3. Everyone sees landing page again (safe mode)
4. Fix issues and re-launch when ready

---

## Testing Both Modes Locally

### Test Landing Mode

```bash
# In frontend/.env.local
NEXT_PUBLIC_LAUNCH_MODE=landing

# Restart dev server
cd frontend
npm run dev
```

Visit `http://localhost:3000` - you should see the "Coming Soon" pre-launch page even if signed in, with no sidebar.

### Test App Mode

```bash
# In frontend/.env.local
NEXT_PUBLIC_LAUNCH_MODE=app

# Restart dev server
cd frontend
npm run dev
```

Visit `http://localhost:3000`:
- Signed out: Landing page
- Signed in: Full application (courses dashboard)

---

## Code Implementation

### Locations

The launch mode check is implemented in two places for complete protection:

#### 1. Layout Level Protection
**File:** `frontend/src/app/layout-client.tsx`

**Key Logic:**

```typescript
const launchMode = process.env.NEXT_PUBLIC_LAUNCH_MODE || 'app';
const isLandingMode = launchMode === 'landing';

useEffect(() => {
  // Redirect any authenticated route to homepage in landing mode
  if (isLandingMode && pathname !== '/') {
    router.push('/');
  }
}, [isLandingMode, pathname, router]);

// Don't render authenticated layout in landing mode - just return children
if (isLandingMode) {
  return <>{children}</>;
}
```

This protects ALL routes (`/learn`, `/courses/[id]`, etc.) - users cannot bypass the landing page by direct navigation.

#### 2. Homepage Display
**File:** `frontend/src/app/page.tsx`

**Key Logic:**

```typescript
const launchMode = process.env.NEXT_PUBLIC_LAUNCH_MODE || 'app';
const isLandingMode = launchMode === 'landing';

if (isLandingMode) {
  return <PreLaunchPage />;  // Everyone sees "Coming Soon" page
}

if (isSignedIn) {
  return <CoursesHomePage />;  // Authenticated users see app
}

return <LandingPage />;  // Non-authenticated users see regular landing page
```

This determines what content to show on the homepage:
- **PreLaunchPage**: "Ultudy is launching soon" with coming soon message
- **LandingPage**: Regular marketing page with "Get Started" buttons
- **CoursesHomePage**: Full authenticated app with courses

---

## Troubleshooting

### Issue: Changed environment variable but still seeing old mode

**Solution:** You must restart the Next.js dev server or redeploy for `NEXT_PUBLIC_*` variables to take effect.

```bash
# Stop server (Ctrl+C)
# Start again
npm run dev
```

### Issue: Environment variable not working in production

**Solutions:**
1. Verify the variable name is exactly `NEXT_PUBLIC_LAUNCH_MODE` (case-sensitive)
2. Ensure you redeployed after changing the variable
3. Check your platform's environment variable syntax
4. Clear build cache and redeploy

### Issue: Users still see landing page after switching to 'app' mode

**Solutions:**
1. Verify users are actually signed in (check auth status)
2. Clear browser cache or try incognito mode
3. Check if there's a CDN cache (Vercel Edge, CloudFlare) that needs purging
4. Verify the environment variable is correctly set to `app`

### Issue: Users can access deep links like /learn or /courses/[id] in landing mode

**Solution:** This should NOT be possible with the current implementation. The `LayoutClient` component automatically redirects all non-homepage routes to `/` in landing mode. If this is happening:
1. Verify `layout-client.tsx` includes the launch mode check
2. Check browser console for errors preventing the redirect
3. Clear Next.js cache: `rm -rf .next && npm run dev`

---

## Best Practices

### Development Workflow

1. **Always keep local `.env.local` in `app` mode** - this lets you work on features
2. **Keep production in `landing` mode until launch** - prevents accidental early access
3. **Use staging environment** - test `app` mode in a staging environment before launch
4. **Coordinate with team** - ensure no one is mid-deployment during the switch

### Security Considerations

- The landing page is public and doesn't require authentication
- In `landing` mode, ALL routes (including deep links) redirect to homepage - no bypass possible
- The layout guard ensures authenticated content never renders in landing mode
- API endpoints still validate authentication regardless of launch mode (backend protection)
- This is a frontend UX control - backend should always verify permissions independently

### Performance

- This check happens on every page load, but it's extremely fast (reading env variable)
- No database queries or API calls involved
- No performance impact on either mode

---

## Future Enhancements

Potential improvements to consider:

- **Scheduled Launch:** Auto-switch at a specific date/time
- **Gradual Rollout:** Show app to 10%, then 50%, then 100% of users
- **Admin Override:** Allow admins to see app even in landing mode
- **Analytics:** Track conversion from landing page signups
- **Maintenance Mode:** Third mode for "temporarily unavailable" messaging

---

## Related Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Full deployment instructions
- [DEVELOPMENT_PIPELINE.md](./DEVELOPMENT_PIPELINE.md) - Development workflow
- [README.md](./README.md) - Project overview

---

## Quick Reference

### Common Commands

```bash
# Local development - see full app
NEXT_PUBLIC_LAUNCH_MODE=app npm run dev

# Local development - test landing page
NEXT_PUBLIC_LAUNCH_MODE=landing npm run dev

# Build production with app mode
NEXT_PUBLIC_LAUNCH_MODE=app npm run build

# Build production with landing mode
NEXT_PUBLIC_LAUNCH_MODE=landing npm run build
```

### Environment Variable Values

| Value | What Users See |
|-------|----------------|
| `landing` | Landing page (everyone) |
| `app` | App (signed in) / Landing (signed out) |
| Not set | Same as `app` (default) |
| Any other value | Same as `app` (fallback) |

---

**Remember:** This is a frontend-only switch. Backend APIs and authentication still work normally in both modes. Always test thoroughly before launch day!
