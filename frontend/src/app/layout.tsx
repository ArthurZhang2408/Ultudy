import type { Metadata } from 'next';
import './globals.css';
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
} from '@clerk/nextjs';
import { MainSidebar, UploadModal } from '@/components/ui';
import ThemeProvider from '@/components/ThemeProvider';
import Script from 'next/script';
import LayoutClient from './layout-client';

export const metadata: Metadata = {
  title: 'Ultudy — AI Study Guide',
  description: 'Upload, search, and study your documents with AI-powered learning tools.'
};

type LayoutShellProps = {
  children: React.ReactNode;
  authEnabled: boolean;
};

function LayoutShell({ children, authEnabled }: LayoutShellProps) {
  // Check if we're in landing mode to adjust layout
  const launchMode = process.env.NEXT_PUBLIC_LAUNCH_MODE || 'app';
  const isLandingMode = launchMode === 'landing';

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen relative">
        <ThemeProvider />
        {isLandingMode && (
          <>
            {/* Elegant layered background - full viewport coverage */}
            <div className="fixed inset-0 -z-10 bg-neutral-50 dark:bg-neutral-950" />
            <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-100/40 via-transparent to-transparent dark:from-primary-900/20" />
            <div className="fixed bottom-0 right-0 -z-10 w-[800px] h-[800px] bg-primary-200/30 dark:bg-primary-800/10 rounded-full blur-3xl" />
            <div className="fixed top-0 left-0 -z-10 w-[800px] h-[800px] bg-primary-100/20 dark:bg-primary-900/10 rounded-full blur-3xl" />
          </>
        )}
        {authEnabled ? (
          <>
            <SignedIn>
              <LayoutClient>{children}</LayoutClient>
            </SignedIn>
            <SignedOut>
              {isLandingMode ? (
                // Landing mode: full-width, no padding/constraints
                children
              ) : (
                // App mode: constrained layout
                <div className="flex min-h-screen flex-col">
                  <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 py-8">{children}</main>
                </div>
              )}
            </SignedOut>
          </>
        ) : (
          isLandingMode ? (
            // Landing mode: full-width, no padding/constraints
            children
          ) : (
            // App mode: constrained layout
            <div className="flex min-h-screen flex-col">
              <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 py-8">{children}</main>
            </div>
          )
        )}
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
