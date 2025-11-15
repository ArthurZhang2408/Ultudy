import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Define all routes that require authentication
// Any route not listed here is considered public
const isProtectedRoute = createRouteMatcher([
  '/courses(.*)',      // All course pages
  '/upload(.*)',       // Upload functionality
  '/search(.*)',       // Search functionality
  '/study(.*)',        // Study sessions
  '/learn(.*)',        // Learning/practice mode
])

// Public routes that should always be accessible
const isPublicRoute = createRouteMatcher([
  '/',                 // Landing page
  '/sign-in(.*)',      // Sign in pages
  '/sign-up(.*)',      // Sign up pages
])

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes without authentication
  if (isPublicRoute(req)) {
    return
  }

  // Protect all matched routes - will redirect to /sign-in if not authenticated
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
