import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
} from '@clerk/nextjs';
import { UserMenu } from '@/components/ui';
import ThemeProvider from '@/components/ThemeProvider';
import Script from 'next/script';

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        <ThemeProvider />
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-40 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md shadow-sm dark:shadow-dark-soft">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-2 group">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 shadow-sm group-hover:shadow-md transition-shadow">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-800 dark:from-primary-400 dark:to-primary-600 bg-clip-text text-transparent">
                    Ultudy
                  </span>
                </Link>
                {authEnabled && (
                  <nav className="hidden gap-1 md:flex">
                    <SignedIn>
                      <Link href="/courses" className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-primary-700 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                        Courses
                      </Link>
                      <Link href="/upload" className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-primary-700 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                        Upload
                      </Link>
                    </SignedIn>
                  </nav>
                )}
              </div>
              <div className="flex items-center gap-3">
                {authEnabled ? (
                  <>
                    <SignedOut>
                      <Link href="/sign-in">
                        <button className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 transition-all">
                          Sign in
                        </button>
                      </Link>
                      <Link href="/sign-up">
                        <button className="rounded-lg bg-primary-600 dark:bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 dark:hover:bg-primary-600 shadow-sm hover:shadow-md dark:shadow-dark-soft dark:hover:shadow-dark-medium transition-all">
                          Get Started
                        </button>
                      </Link>
                    </SignedOut>
                    <SignedIn>
                      <UserMenu />
                    </SignedIn>
                  </>
                ) : (
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">Authentication unavailable</span>
                )}
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 py-8">{children}</main>
          <footer className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 py-8">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Ultudy</span>
                </div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {authEnabled ? 'Powered by AI • Your Adaptive Learning Companion' : 'Powered by AI'}
                </p>
              </div>
            </div>
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
