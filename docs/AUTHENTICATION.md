# Authentication & Route Protection

This document explains how authentication and route protection work in Ultudy, and how to add new protected routes.

## Overview

Ultudy uses **Clerk** for authentication with **Next.js middleware-based route protection**. This ensures that:
- Unauthenticated users cannot access protected features
- Users are automatically redirected to sign-in when trying to access protected routes
- All future routes can be easily configured as public or protected

## Architecture

### Authentication Provider: Clerk

- **Provider**: `@clerk/nextjs` wraps the entire app in `layout.tsx`
- **Components**: `SignedIn`, `SignedOut`, `UserButton` for conditional UI rendering
- **Pages**: Dedicated `/sign-in` and `/sign-up` pages using Clerk's components

### Route Protection: Next.js Middleware

Route protection is handled in `/frontend/src/middleware.ts` using Clerk's middleware:

```typescript
const isProtectedRoute = createRouteMatcher([
  '/courses(.*)',      // All course pages
  '/upload(.*)',       // Upload functionality
  '/search(.*)',       // Search functionality
  '/study(.*)',        // Study sessions
  '/learn(.*)',        // Learning/practice mode
])

const isPublicRoute = createRouteMatcher([
  '/',                 // Landing page
  '/sign-in(.*)',      // Sign in pages
  '/sign-up(.*)',      // Sign up pages
])
```

**How it works:**
1. Middleware runs on every request before the page renders
2. If a route matches `isProtectedRoute` and user is not authenticated → redirect to `/sign-in`
3. If a route matches `isPublicRoute` → allow access without authentication
4. Routes not in either list → allow access (default behavior)

### Backend Authentication

API routes are protected separately:
- **Location**: `/backend/src/auth/middleware.js`
- **Method**: JWT token verification via Clerk's JWKS endpoint
- **Flow**: Frontend gets JWT → sends as Bearer token → Backend validates → extracts userId

## Current Route Configuration

### Protected Routes (Require Login)
- `/courses` - View all courses
- `/courses/[id]` - Individual course pages
- `/upload` - Upload new documents
- `/search` - Search functionality
- `/study` - Study session pages
- `/learn` - Learning/practice mode

### Public Routes (No Login Required)
- `/` - Landing page
- `/sign-in` - Sign in page
- `/sign-up` - Sign up page

## Adding New Protected Routes

To add a new route that requires authentication:

### 1. Create Your Page
```bash
# Example: Creating a new settings page
frontend/src/app/settings/page.tsx
```

### 2. Add to Protected Routes in Middleware

Edit `/frontend/src/middleware.ts`:

```typescript
const isProtectedRoute = createRouteMatcher([
  '/courses(.*)',
  '/upload(.*)',
  '/search(.*)',
  '/study(.*)',
  '/learn(.*)',
  '/settings(.*)',    // ← Add your new route here
])
```

**That's it!** The route is now protected. Unauthenticated users will be redirected to `/sign-in`.

### Pattern Matching

- `/settings(.*)` - Matches `/settings` and all sub-routes like `/settings/profile`, `/settings/billing`
- `/settings` - Matches only `/settings` exactly (not recommended)
- Use `(.*)` for most routes to protect all nested pages

## Adding New Public Routes

Most routes should be protected by default. Only add routes to `isPublicRoute` if they should be accessible without authentication:

```typescript
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/about',           // ← Example: public about page
  '/pricing',         // ← Example: public pricing page
])
```

## Best Practices

### ✅ DO:
- Add all feature routes to `isProtectedRoute` by default
- Use `(.*)` pattern to protect all sub-routes
- Keep authentication logic in middleware, not in individual pages
- Use `SignedIn` / `SignedOut` components for conditional UI rendering
- Test new routes by trying to access them while logged out

### ❌ DON'T:
- Don't add authentication checks in individual page components
- Don't create public routes unless explicitly required
- Don't forget to update middleware when adding new feature routes
- Don't use modal-based authentication (we use route-based `/sign-in`, `/sign-up`)

## Testing Route Protection

1. **Sign out** from the app
2. **Try to navigate** to your new protected route (e.g., `/settings`)
3. **Expected behavior**: Automatically redirected to `/sign-in`
4. **Sign in** and verify you can access the route

## Debugging

### Route not protected?
1. Check that the route pattern is in `isProtectedRoute`
2. Verify the pattern matches your route (use `(.*)` for sub-routes)
3. Check middleware is running: `middleware.ts` should be at `/frontend/src/middleware.ts`
4. Check browser console for errors

### Infinite redirect loop?
1. Ensure `/sign-in` and `/sign-up` are in `isPublicRoute`
2. Check Clerk environment variables are set correctly

### Users not redirected after sign-in?
1. Clerk automatically redirects to the originally requested page
2. If you need custom redirect logic, use Clerk's `afterSignIn` configuration

## Environment Variables

Required for authentication to work:

```env
# Frontend (.env.local)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001

# Backend (.env)
AUTH_MODE=jwt
AUTH_JWT_ISS=https://clerk.yourapp.com
AUTH_JWT_JWKS_URL=https://clerk.yourapp.com/.well-known/jwks.json
```

## Common Patterns

### Protecting an entire section
```typescript
'/dashboard(.*)',  // Protects /dashboard, /dashboard/analytics, etc.
```

### Protecting specific pages only
```typescript
'/admin',          // Only protects /admin, not /admin/users
'/admin(.*)',      // Protects /admin and all sub-routes
```

### Conditional UI based on auth
```tsx
import { SignedIn, SignedOut } from '@clerk/nextjs';

<SignedIn>
  <p>You are signed in!</p>
</SignedIn>
<SignedOut>
  <p>Please sign in to continue</p>
</SignedOut>
```

## Future Considerations

### Role-Based Access Control (RBAC)
If you need different access levels (admin, user, etc.):
1. Use Clerk's Organizations or custom metadata
2. Add role checks in middleware after authentication
3. Protect API routes based on roles in backend

### API Route Protection
API routes under `/frontend/src/app/api/*` are already protected:
- Middleware checks for Clerk session
- Backend validates JWT tokens
- No additional configuration needed for new API routes

## Reference Links

- [Clerk Next.js Quickstart](https://clerk.com/docs/quickstarts/nextjs)
- [Clerk Middleware Documentation](https://clerk.com/docs/references/nextjs/clerk-middleware)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)

---

**Last Updated**: 2025-11-15
**Maintained By**: Development Team
