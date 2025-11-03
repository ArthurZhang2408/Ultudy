# Clerk Authentication Setup Guide

This guide explains how to integrate Clerk authentication with the Ultudy application.

## Overview

Ultudy uses [Clerk](https://clerk.com) for user authentication and session management. Clerk provides:
- Secure sign-up and sign-in flows
- Session management with JWT tokens
- User profile management
- Pre-built UI components

## Prerequisites

- Node.js 20+
- A Clerk account (free tier available at https://clerk.com)
- Backend and frontend repositories cloned locally

## Step 1: Create a Clerk Application

1. Go to https://clerk.com and sign up or sign in
2. Click "Add application" in the Clerk Dashboard
3. Choose a name for your application (e.g., "Ultudy")
4. Select your preferred authentication methods:
   - Email + Password (recommended for MVP)
   - Social providers (Google, GitHub, etc.) - optional
5. Click "Create application"

## Step 2: Get Your Clerk Keys

After creating your application, you'll see your API keys:

1. **Frontend Keys** (found on the Dashboard):
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Safe to expose in frontend code

2. **Backend Keys** (click "API Keys" in sidebar):
   - `CLERK_SECRET_KEY` - Keep this secret, never commit to git

3. **JWT Configuration** (click "API Keys" → "Advanced" → "JWT public key"):
   - JWT Issuer URL (looks like `https://your-app-name.clerk.accounts.dev`)
   - JWKS URL (looks like `https://your-app-name.clerk.accounts.dev/.well-known/jwks.json`)

## Step 3: Configure Frontend Environment

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Copy the example environment file:
   ```bash
   cp .env.local.example .env.local
   ```

3. Edit `.env.local` and add your Clerk keys:
   ```bash
   NEXT_PUBLIC_BACKEND_URL=http://localhost:3001

   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
   CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
   ```

4. **Important**: Never commit `.env.local` to git (already in `.gitignore`)

## Step 4: Configure Backend Environment

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. If you haven't already, copy the example file:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and configure JWT authentication:
   ```bash
   # Set authentication mode to JWT
   AUTH_MODE=jwt

   # Add your Clerk JWT configuration
   AUTH_JWT_ISS=https://your-app-name.clerk.accounts.dev
   AUTH_JWT_JWKS_URL=https://your-app-name.clerk.accounts.dev/.well-known/jwks.json

   # Audience is optional - leave empty unless you've configured it in Clerk
   AUTH_JWT_AUD=
   ```

4. **Important**: Never commit `.env` to git (already in `.gitignore`)

## Step 5: Start the Application

1. **Start the database** (if not already running):
   ```bash
   docker compose up -d db
   ```

2. **Start the backend**:
   ```bash
   cd backend
   npm run dev
   ```

   You should see:
   ```
   Backend listening on http://localhost:3001
   ```

3. **Start the frontend** (in a new terminal):
   ```bash
   cd frontend
   npm run dev
   ```

   You should see:
   ```
   ▲ Next.js 14.2.5
   - Local:        http://localhost:3000
   ```

## Step 6: Test Authentication

1. Open your browser to http://localhost:3000
2. You should see the Ultudy homepage with "Sign in" and "Sign up" buttons
3. Click "Sign up" and create an account using your email
4. Complete the sign-up flow (you may need to verify your email)
5. Once signed in, you should see:
   - Your profile picture/avatar in the top right
   - Navigation links to Upload, Search, and Study pages
6. Try uploading a PDF document to verify the integration works

## Authentication Flow

### How it works:

1. **User signs in** → Clerk creates a session and issues a JWT token
2. **Frontend makes API request** → Calls `getToken()` from Clerk's `useAuth` hook
3. **Token sent to backend** → Added as `Authorization: Bearer <token>` header
4. **Backend verifies token** → Uses Clerk's JWKS to validate the JWT signature
5. **User ID extracted** → The `sub` claim from the JWT becomes the user's ID
6. **Database isolation** → Row-Level Security (RLS) ensures users only see their own data

### Token Refresh

Clerk automatically handles token refresh. Tokens expire after a short period (default: 1 minute) and are refreshed silently in the background.

## Development Mode (Optional)

For backend-only testing without setting up Clerk, you can use development mode:

1. Edit `backend/.env`:
   ```bash
   AUTH_MODE=dev
   ```

2. Send requests with an `X-User-Id` header:
   ```bash
   curl -H "X-User-Id: 00000000-0000-0000-0000-000000000001" \
        http://localhost:3001/search?q=test
   ```

**Note**: Development mode bypasses authentication and should **never** be used in production.

## Troubleshooting

### "Missing bearer token" error

- **Cause**: Frontend Clerk keys are not configured
- **Fix**: Check that `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set in `frontend/.env.local`

### "Invalid bearer token" error

- **Cause**: Backend JWT configuration doesn't match Clerk
- **Fix**:
  1. Verify `AUTH_JWT_ISS` matches your Clerk domain exactly
  2. Verify `AUTH_JWT_JWKS_URL` is correct
  3. Check Clerk Dashboard → API Keys → Advanced for the correct URLs

### "Token missing subject claim" error

- **Cause**: JWT doesn't contain a `sub` claim (should never happen with Clerk)
- **Fix**: Contact Clerk support or check for custom JWT templates

### User can't access their documents after sign-in

- **Cause**: User ID from JWT doesn't match documents in database
- **Fix**: Check that documents were created with the correct `owner_id`

### CORS errors when calling backend

- **Cause**: Backend CORS configuration
- **Fix**: Backend should already allow all origins in development. For production, configure allowed origins in `backend/src/app.js`

## Security Notes

1. **Never commit secrets**: `.env` and `.env.local` files contain sensitive keys
2. **Use environment variables**: Never hardcode API keys in source code
3. **HTTPS in production**: Always use HTTPS in production to protect tokens in transit
4. **Row-Level Security**: Database RLS provides defense-in-depth security
5. **Token validation**: Backend verifies every JWT signature using Clerk's public keys

## Production Deployment

When deploying to production:

1. **Frontend** (Vercel recommended):
   - Add environment variables in Vercel dashboard
   - Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
   - Set `NEXT_PUBLIC_BACKEND_URL` to your production backend URL

2. **Backend** (Render/Fly.io recommended):
   - Add environment variables in hosting platform dashboard
   - Set `AUTH_MODE=jwt`
   - Set all `AUTH_JWT_*` variables from Clerk
   - Set `DATABASE_URL` to production database
   - Consider using Clerk's production keys (not test keys)

3. **Update Clerk settings**:
   - Add your production frontend URL to Clerk's allowed origins
   - Configure production redirect URLs

## Additional Resources

- [Clerk Documentation](https://clerk.com/docs)
- [Clerk Next.js Quickstart](https://clerk.com/docs/quickstarts/nextjs)
- [Clerk JWT Claims](https://clerk.com/docs/backend-requests/handling/manual-jwt)
- [Postgres Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

## Support

For issues related to:
- **Clerk authentication**: Visit https://clerk.com/support
- **Ultudy application**: Open an issue on GitHub
- **Database/RLS**: Check the backend documentation in `backend/README.md`
