'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import SettingsModal from './SettingsModal';
import UpgradeModal from './UpgradeModal';
import CreateCourseModal from './CreateCourseModal';
import { useFetchCourses } from '@/lib/hooks/useFetchCourses';

interface MainSidebarProps {
  onUploadClick: () => void;
  onCollapseChange?: (collapsed: boolean) => void;
}

export default function MainSidebar({ onUploadClick, onCollapseChange }: MainSidebarProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const pathname = usePathname();
  const { courses, loading } = useFetchCourses();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [isCreateCourseOpen, setIsCreateCourseOpen] = useState(false);
  const [isHoveringCollapsed, setIsHoveringCollapsed] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Check if we're on learn page with sidebar=main (user switched from concept nav)
  const isLearnPage = pathname === '/learn';

  // Notify parent when collapsed state changes
  useEffect(() => {
    onCollapseChange?.(isCollapsed);
  }, [isCollapsed, onCollapseChange]);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isUserMenuOpen]);

  // Close user menu on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    }

    if (isUserMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isUserMenuOpen]);

  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() || 'U';

  const userName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.emailAddresses[0]?.emailAddress || 'User';

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  const handleSettingsClick = () => {
    setIsUserMenuOpen(false);
    setIsSettingsOpen(true);
  };

  const handleUpgradeClick = () => {
    setIsUserMenuOpen(false);
    setIsUpgradeOpen(true);
  };

  const handleBackToNavigation = () => {
    // Remove sidebar=main query param to go back to concept navigation
    const url = new URL(window.location.href);
    url.searchParams.delete('sidebar');
    router.push(url.pathname + (url.search || ''));
  };

  return (
    <>
    <div
      className={`fixed left-0 top-0 h-full bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col transition-all duration-300 z-50 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
      onMouseEnter={() => setIsHoveringCollapsed(true)}
      onMouseLeave={() => setIsHoveringCollapsed(false)}
    >
      {/* Logo and Toggle */}
      <div className="flex items-center justify-center p-4 border-b border-neutral-200 dark:border-neutral-800">
        {isCollapsed ? (
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex items-center justify-center w-10 h-10 transition-all"
          >
            {isHoveringCollapsed ? (
              <div className="flex items-center justify-center w-10 h-10">
                <svg
                  className="w-6 h-6 text-neutral-600 dark:text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </div>
            ) : (
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 shadow-sm hover:shadow-md transition-shadow">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            )}
          </button>
        ) : (
          <>
            <Link href="/" className="flex items-center gap-2 group flex-1">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 shadow-sm group-hover:shadow-md transition-shadow">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-800 dark:from-primary-400 dark:to-primary-600 bg-clip-text text-transparent">
                Ultudy
              </span>
            </Link>
            {/* Back to Navigation or Collapse button */}
            {isLearnPage ? (
              <button
                onClick={handleBackToNavigation}
                className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-md transition-colors"
                aria-label="Back to navigation"
                title="Back to navigation"
              >
                <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-md transition-colors"
                aria-label="Collapse sidebar"
              >
                <svg
                  className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {/* New Course Button */}
        {isCollapsed ? (
          <button
            onClick={() => setIsCreateCourseOpen(true)}
            className="w-full flex items-center justify-center mb-4"
            title="Create new course"
          >
            <div className="w-10 h-10 flex items-center justify-center rounded-lg text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </button>
        ) : (
          <button
            onClick={() => setIsCreateCourseOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 transition-colors mb-4"
            title="Create new course"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Course</span>
          </button>
        )}

        {/* Courses Section */}
        {!isCollapsed && <div className="mb-2">
          {!isCollapsed && (
            <div className="px-3 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Courses
              </span>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-10 bg-neutral-200 dark:bg-neutral-800 rounded-lg animate-pulse ${
                    isCollapsed ? 'mx-1' : ''
                  }`}
                />
              ))}
            </div>
          ) : courses.length === 0 ? (
            !isCollapsed && (
              <div className="px-3 py-4 text-center">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No courses yet</p>
              </div>
            )
          ) : (
            <div className="space-y-1">
              {courses.map((course) => {
                const isActive = pathname.startsWith(`/courses/${course.id}`);
                return (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-900 dark:text-primary-100 font-medium'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                    }`}
                    title={course.name}
                  >
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center flex-shrink-0 ${isCollapsed ? 'mx-auto' : ''}`}>
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    {!isCollapsed && (
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{course.code || course.name}</div>
                        {course.code && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                            {course.name}
                          </div>
                        )}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>}
      </div>

      {/* User Section at Bottom */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-3">
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={`w-full flex items-center rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors ${
              isCollapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2.5'
            }`}
          >
            <div className={`flex items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-semibold text-xs flex-shrink-0 ${
              isCollapsed ? 'w-10 h-10' : 'w-8 h-8'
            }`}>
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt={userName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                userInitials
              )}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {userName}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {user?.emailAddresses[0]?.emailAddress}
                </div>
              </div>
            )}
          </button>

          {/* User Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute bottom-full mb-2 left-0 right-0 origin-bottom">
              <div className="rounded-lg bg-white dark:bg-neutral-800 shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-neutral-700 overflow-hidden">
                {/* Menu Items */}
                <div className="py-1">
                  <button
                    onClick={handleSettingsClick}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Settings</span>
                  </button>

                  <button
                    onClick={handleUpgradeClick}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Upgrade</span>
                  </button>

                  <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />

                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Modals */}
    <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    <UpgradeModal isOpen={isUpgradeOpen} onClose={() => setIsUpgradeOpen(false)} />
    <CreateCourseModal
      isOpen={isCreateCourseOpen}
      onClose={() => setIsCreateCourseOpen(false)}
      onSuccess={() => {
        fetchCourses();
      }}
    />
    </>
  );
}
