import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function SettingsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <div className="py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
          Settings
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-8">
          Manage your account settings and preferences
        </p>

        <div className="space-y-6">
          {/* Profile Section */}
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Profile Settings
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              Profile settings coming soon...
            </p>
          </div>

          {/* Preferences Section */}
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Preferences
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              Preferences settings coming soon...
            </p>
          </div>

          {/* Notifications Section */}
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Notifications
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              Notification settings coming soon...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
