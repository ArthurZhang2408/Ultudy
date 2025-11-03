import type { Metadata } from 'next';
import './globals.css';
import UserIdBar from '../components/UserIdBar';
import { UserIdProvider } from '../lib/useUserId';

export const metadata: Metadata = {
  title: 'Ultudy — Frontend MVP',
  description: 'Upload, search, and study your documents.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <UserIdProvider>
          <div className="flex min-h-screen flex-col">
            <header className="border-b border-slate-200 shadow-sm">
              <UserIdBar />
            </header>
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
            <footer className="border-t border-slate-200 bg-white py-4 text-center text-sm text-slate-500">
              Built for Milestone 5 Frontend MVP.
            </footer>
          </div>
        </UserIdProvider>
      </body>
    </html>
  );
}
