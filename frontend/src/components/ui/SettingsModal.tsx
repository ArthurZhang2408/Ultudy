'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from '@clerk/nextjs';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'account' | 'appearance' | 'notifications';

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setTheme(savedTheme);
    } else {
      setTheme('system');
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen, onClose]);

  const handleThemeChange = (newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme);

    if (newTheme === 'system') {
      localStorage.removeItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else if (newTheme === 'dark') {
      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
    }
  };

  if (!isOpen || !mounted) return null;

  const tabs = [
    { id: 'general' as SettingsTab, label: 'General', icon: '⚙️' },
    { id: 'account' as SettingsTab, label: 'Account', icon: '👤' },
    { id: 'appearance' as SettingsTab, label: 'Appearance', icon: '🎨' },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: '🔔' },
  ];

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl min-h-[500px] max-h-[85vh] my-auto bg-white dark:bg-neutral-900 rounded-xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-neutral-50 dark:bg-neutral-800/50 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-700 p-4 flex flex-col shrink-0">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4 px-2">
            Settings
          </h2>

          <nav className="flex-1 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-white/50 dark:hover:bg-neutral-700/50'
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {tabs.find(t => t.id === activeTab)?.label}
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              aria-label="Close settings"
            >
              <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                    Profile
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        value={user?.fullName || ''}
                        readOnly
                        className="w-full px-3 py-2 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={user?.emailAddresses[0]?.emailAddress || ''}
                        readOnly
                        className="w-full px-3 py-2 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                    Account Information
                  </h4>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Manage your account settings and preferences.
                  </p>
                </div>
                <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Additional account settings coming soon...
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                    Theme
                  </h4>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                    Choose how Ultudy looks to you. Select a single theme, or sync with your system.
                  </p>

                  <div className="space-y-2">
                    {[
                      { value: 'system', label: 'System', description: 'Use system setting' },
                      { value: 'light', label: 'Light', description: 'Light mode' },
                      { value: 'dark', label: 'Dark', description: 'Dark mode' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleThemeChange(option.value as 'system' | 'light' | 'dark')}
                        className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                          theme === option.value
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            theme === option.value
                              ? 'border-primary-500'
                              : 'border-neutral-400 dark:border-neutral-600'
                          }`}>
                            {theme === option.value && (
                              <div className="w-2 h-2 rounded-full bg-primary-500" />
                            )}
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              {option.label}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                              {option.description}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                    Notification Preferences
                  </h4>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Choose what notifications you want to receive.
                  </p>
                </div>
                <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Notification settings coming soon...
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
