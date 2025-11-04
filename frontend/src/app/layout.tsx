import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'Ultudy — AI Study Guide',
  description: 'Upload, search, and study your documents with AI-powered learning tools.'
};

type LayoutShellProps = {
  children: React.ReactNode;
  authEnabled: boolean;
};

function LayoutShell({ children, authEnabled }: LayoutShellProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white shadow-sm">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
              <div className="flex items-center gap-6">
                <Link href="/" className="text-xl font-bold text-slate-900">
                  Ultudy
                </Link>
                {authEnabled && (
                  <nav className="hidden gap-4 md:flex">
                    <SignedIn>
                      <Link href="/courses" className="text-sm text-slate-600 hover:text-slate-900">
                        Courses
                      </Link>
                      <Link href="/upload" className="text-sm text-slate-600 hover:text-slate-900">
                        Upload
                      </Link>
                      <Link href="/search" className="text-sm text-slate-600 hover:text-slate-900">
                        Search
                      </Link>
                    </SignedIn>
                  </nav>
                )}
              </div>
              <div className="flex items-center gap-3">
                {authEnabled ? (
                  <>
                    <SignedOut>
                      <SignInButton mode="modal">
                        <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Sign in
                        </button>
                      </SignInButton>
                      <SignUpButton mode="modal">
                        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                          Sign up
                        </button>
                      </SignUpButton>
                    </SignedOut>
                    <SignedIn>
                      <UserButton />
                    </SignedIn>
                  </>
                ) : (
                  <span className="text-sm text-slate-500">Authentication unavailable</span>
                )}
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t border-slate-200 bg-white py-4 text-center text-sm text-slate-500">
            {authEnabled ? 'Powered by AI • Secured with Clerk' : 'Powered by AI'}
          </footer>
        </div>
      </body>
    </html>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const authEnabled = Boolean(publishableKey);

  if (!authEnabled) {
    console.warn(
      'Clerk publishable key is not configured. Rendering layout without authentication provider.'
    );
    return <LayoutShell authEnabled={false}>{children}</LayoutShell>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <LayoutShell authEnabled>{children}</LayoutShell>
    </ClerkProvider>
  );
}
