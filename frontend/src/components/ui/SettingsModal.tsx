'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from '@clerk/nextjs';
import { useModal } from '@/contexts/ModalContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'account' | 'notifications';

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [mounted, setMounted] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const themeDropdownRef = useRef<HTMLDivElement>(null);

  // Register this modal with the global modal context
  useModal(isOpen, 'settings-modal');

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target as Node)) {
        setThemeDropdownOpen(false);
      }
    };

    if (themeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [themeDropdownOpen]);

  const handleThemeChange = (newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme);
    setThemeDropdownOpen(false);

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
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: '🔔' },
  ];

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm -z-10"
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

                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    Appearance
                  </h4>
                  <div className="relative" ref={themeDropdownRef}>
                    <button
                      onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
                      className="px-4 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-neutral-100 hover:border-neutral-400 dark:hover:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all cursor-pointer flex items-center gap-2 min-w-[120px] justify-between"
                    >
                      <span className="capitalize">{theme}</span>
                      <svg className={`w-4 h-4 transition-transform ${themeDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {themeDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg shadow-lg overflow-hidden z-10">
                        {['system', 'light', 'dark'].map((option) => (
                          <button
                            key={option}
                            onClick={() => handleThemeChange(option as 'system' | 'light' | 'dark')}
                            className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                              theme === option
                                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                                : 'text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                            }`}
                          >
                            <span className="capitalize">{option}</span>
                          </button>
                        ))}
                      </div>
                    )}
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
