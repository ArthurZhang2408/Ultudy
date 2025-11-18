'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { Button, Card, Badge } from '@/components/ui';
import EditCourseModal from '@/components/ui/EditCourseModal';
import { useFetchCourses } from '@/lib/hooks/useFetchCourses';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function CoursesHomePage() {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  // Always fetch all courses (including archived)
  const { courses: allCourses, loading, refetch } = useFetchCourses(true);
  // Filter courses based on showArchived state
  const courses = showArchived ? allCourses.filter(c => c.archived) : allCourses.filter(c => !c.archived);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

  // Listen for course updates from other components
  useEffect(() => {
    const handleCoursesUpdated = () => {
      refetch();
    };
    window.addEventListener('coursesUpdated', handleCoursesUpdated);
    return () => window.removeEventListener('coursesUpdated', handleCoursesUpdated);
  }, [refetch]);

  // Automatically switch to active courses when archived view becomes empty
  useEffect(() => {
    const archivedCount = allCourses.filter(c => c.archived).length;
    if (showArchived && archivedCount === 0) {
      setShowArchived(false);
    }
  }, [showArchived, allCourses]);

  const handleArchiveToggle = async (course: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownOpen(null);

    setIsArchiving(true);
    try {
      const response = await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !course.archived }),
      });

      if (!response.ok) {
        throw new Error('Failed to archive course');
      }

      // Notify other components
      window.dispatchEvent(new CustomEvent('coursesUpdated'));

      // Refresh courses list
      await refetch();
    } catch (error) {
      console.error('Failed to archive course:', error);
      alert('Failed to archive course. Please try again.');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCourse) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/courses/${selectedCourse.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete course');
      }

      // Notify other components
      window.dispatchEvent(new CustomEvent('coursesUpdated'));

      // Refresh courses list
      await refetch();
      setDeleteDialogOpen(false);
      setSelectedCourse(null);
    } catch (error) {
      console.error('Failed to delete course:', error);
      alert('Failed to delete course. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditDialog = (course: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedCourse(course);
    setEditDialogOpen(true);
    setDropdownOpen(null);
  };

  const openDeleteDialog = (course: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedCourse(course);
    setDeleteDialogOpen(true);
    setDropdownOpen(null);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-9 w-48 skeleton rounded-lg" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 skeleton rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const archivedCount = allCourses.filter(c => c.archived).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">My Courses</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-300">
            Select a course to view materials and start learning
          </p>
        </div>

        {/* Show Archived Toggle */}
        {archivedCount > 0 && (
          <Button
            variant={showArchived ? 'primary' : 'outline'}
            onClick={() => setShowArchived(!showArchived)}
            size="sm"
          >
            {showArchived ? 'Show Active' : `Show Archived (${archivedCount})`}
          </Button>
        )}
      </div>

      {courses.length === 0 ? (
        <Card className="text-center py-16 animate-fade-in">
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              {showArchived ? 'No archived courses' : 'No courses yet'}
            </h3>
            <p className="text-neutral-600 dark:text-neutral-300">
              {showArchived
                ? 'Courses will appear here after they are archived.'
                : 'Create your first course using the sidebar to start organizing your study materials.'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <div key={course.id} className="relative group">
              <Link
                href={`/courses/${course.id}`}
                className="block"
              >
                <Card interactive className={`h-full transition-all ${course.archived ? 'opacity-60' : 'group-hover:border-primary-400 dark:group-hover:border-primary-500'}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 bg-gradient-to-br rounded-xl flex items-center justify-center transition-transform ${course.archived ? 'from-neutral-400 to-neutral-500' : 'from-primary-500 to-primary-600 group-hover:scale-110'}`}>
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>

                    {/* Dropdown menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDropdownOpen(dropdownOpen === course.id ? null : course.id);
                        }}
                        className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                        aria-label="Course options"
                      >
                        <svg className="w-5 h-5 text-neutral-500 dark:text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>

                      {/* Dropdown content */}
                      {dropdownOpen === course.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDropdownOpen(null);
                            }}
                          />
                          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 z-20">
                            {course.archived ? (
                              // Archived courses: Show only Unarchive and Delete
                              <>
                                <button
                                  onClick={(e) => handleArchiveToggle(course, e)}
                                  disabled={isArchiving}
                                  className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                  </svg>
                                  Unarchive
                                </button>
                                <button
                                  onClick={(e) => openDeleteDialog(course, e)}
                                  className="w-full px-4 py-2 text-left text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Delete Course
                                </button>
                              </>
                            ) : (
                              // Active courses: Show Edit, Archive, and Delete
                              <>
                                <button
                                  onClick={(e) => openEditDialog(course, e)}
                                  className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Edit Course
                                </button>
                                <button
                                  onClick={(e) => handleArchiveToggle(course, e)}
                                  disabled={isArchiving}
                                  className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                  </svg>
                                  Archive
                                </button>
                                <button
                                  onClick={(e) => openDeleteDialog(course, e)}
                                  className="w-full px-4 py-2 text-left text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Delete Course
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-primary-700 dark:group-hover:text-primary-400 transition-colors flex-1">
                        {course.name}
                      </h3>
                      {course.archived && (
                        <Badge variant="neutral" size="sm">
                          Archived
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {course.code && (
                        <Badge variant="primary">
                          {course.code}
                        </Badge>
                      )}
                      {course.term && (
                        <Badge variant="neutral">
                          {course.term}
                        </Badge>
                      )}
                    </div>

                    {course.exam_date && !course.archived && (
                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                        <svg className="w-4 h-4 text-warning-600 dark:text-warning-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm text-neutral-600 dark:text-neutral-300">
                          Exam: {(() => {
                            // Parse date string as local date to avoid timezone issues
                            // Handle both "YYYY-MM-DD" and ISO timestamp formats
                            const dateStr = course.exam_date.split('T')[0]; // Extract date part if ISO timestamp
                            const [year, month, day] = dateStr.split('-').map(Number);
                            const localDate = new Date(year, month - 1, day);
                            return localDate.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            });
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Edit Course Modal */}
      <EditCourseModal
        isOpen={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        course={selectedCourse}
        onSuccess={refetch}
      />

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteDialogOpen(false)}
          />
          <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-danger-100 dark:bg-danger-900/40 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-danger-600 dark:text-danger-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                Delete Course
              </h2>
            </div>
            <p className="text-neutral-600 dark:text-neutral-300 mb-6">
              Are you sure you want to delete <strong>{selectedCourse?.name}</strong>?
              This will permanently delete all materials, sections, and progress associated with this course.
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={isDeleting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1"
              >
                {isDeleting ? 'Deleting...' : 'Delete Course'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const { isSignedIn, isLoaded } = useAuth();

  // Check launch mode from environment variable
  // 'landing' = show landing page to everyone (pre-launch)
  // 'app' = show full application (post-launch)
  const launchMode = process.env.NEXT_PUBLIC_LAUNCH_MODE || 'app';
  const isLandingMode = launchMode === 'landing';

  // Show loading state
  if (!isLoaded) {
    return null;
  }

  // If in landing mode:
  // - Show regular landing page to non-authenticated users (they can sign up)
  // - Show pre-launch waitlist page to authenticated users (they're on the waitlist)
  if (isLandingMode) {
    if (isSignedIn) {
      return <PreLaunchPage />;
    }
    return <LandingPage />;
  }

  // If signed in (and not in landing mode), show courses page
  if (isSignedIn) {
    return <CoursesHomePage />;
  }

  // Landing page for non-authenticated users (app mode)
  return <LandingPage />;
}

// Countdown Timer Component with enhanced design
function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const calculateTimeLeft = () => {
      const difference = +new Date(targetDate) - +new Date();

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  if (!mounted) {
    return null; // Prevent hydration mismatch
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-4xl mx-auto">
      {[
        { label: 'Days', value: timeLeft.days, gradient: 'from-purple-500 to-pink-500' },
        { label: 'Hours', value: timeLeft.hours, gradient: 'from-blue-500 to-cyan-500' },
        { label: 'Minutes', value: timeLeft.minutes, gradient: 'from-green-500 to-emerald-500' },
        { label: 'Seconds', value: timeLeft.seconds, gradient: 'from-orange-500 to-red-500' },
      ].map((item, index) => (
        <div
          key={item.label}
          className="group relative"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          {/* Glow effect */}
          <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-20 blur-xl rounded-3xl group-hover:opacity-30 transition-opacity`}></div>

          {/* Card */}
          <div className="relative bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-neutral-200/50 dark:border-neutral-700/50 shadow-2xl transform group-hover:scale-105 transition-all duration-300">
            <div className={`text-5xl md:text-7xl font-black bg-gradient-to-br ${item.gradient} bg-clip-text text-transparent mb-3 transition-all duration-300`}>
              {String(item.value).padStart(2, '0')}
            </div>
            <div className="text-xs md:text-sm text-neutral-600 dark:text-neutral-400 font-bold uppercase tracking-widest">
              {item.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Pre-launch waitlist page shown to authenticated users when NEXT_PUBLIC_LAUNCH_MODE=landing
function PreLaunchPage() {
  const launchDate = process.env.NEXT_PUBLIC_LAUNCH_DATE || '2025-12-31T00:00:00';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden relative">
      {/* Animated background gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-neutral-950 dark:via-purple-950/20 dark:to-blue-950/20"></div>

      {/* Animated blobs */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full blur-3xl animate-blob"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-gradient-to-br from-blue-400/30 to-cyan-400/30 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-gradient-to-br from-green-400/30 to-emerald-400/30 rounded-full blur-3xl animate-blob animation-delay-4000"></div>
      </div>

      <div className="max-w-6xl mx-auto text-center space-y-12 relative z-10">
        {/* Success Badge with animation */}
        <div className="animate-bounce-slow">
          <div className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full text-white text-base font-bold shadow-2xl shadow-green-500/50">
            <svg className="w-6 h-6 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-shadow">You're on the waitlist!</span>
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
        </div>

        {/* Main heading with gradient animation */}
        <div className="space-y-4">
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-black leading-tight">
            <span className="inline-block bg-gradient-to-r from-purple-600 via-blue-600 to-pink-600 dark:from-purple-400 dark:via-blue-400 dark:to-pink-400 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
              Ultudy
            </span>
          </h1>
          <p className="text-3xl md:text-4xl font-bold text-neutral-700 dark:text-neutral-300">
            launches in
          </p>
        </div>

        {/* Countdown Timer */}
        <div className="py-8">
          <CountdownTimer targetDate={launchDate} />
        </div>

        {/* Description with better styling */}
        <div className="space-y-6 pt-4">
          <div className="max-w-3xl mx-auto bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl rounded-3xl p-8 md:p-12 border border-neutral-200/50 dark:border-neutral-700/50 shadow-2xl">
            <p className="text-xl md:text-2xl font-semibold text-neutral-800 dark:text-neutral-200 mb-4">
              🎉 Thanks for being an early supporter!
            </p>
            <p className="text-lg text-neutral-600 dark:text-neutral-300 mb-3">
              We're building something special just for you. Your AI-powered study companion is almost ready.
            </p>
            <p className="text-base text-neutral-500 dark:text-neutral-400">
              You'll receive an email the moment we launch. Start gathering your course materials—you're about to study smarter, not harder!
            </p>
          </div>
        </div>

        {/* What to expect with enhanced cards */}
        <div className="grid md:grid-cols-3 gap-6 pt-8 max-w-5xl mx-auto">
          {[
            {
              icon: '📚',
              title: 'Upload Anything',
              description: 'Textbooks, lectures, notes, PDFs',
              gradient: 'from-purple-500 to-pink-500',
            },
            {
              icon: '🤖',
              title: 'AI Magic',
              description: 'Personalized lessons tailored to you',
              gradient: 'from-blue-500 to-cyan-500',
            },
            {
              icon: '📊',
              title: 'Master Faster',
              description: 'Track progress with adaptive learning',
              gradient: 'from-green-500 to-emerald-500',
            },
          ].map((feature, index) => (
            <div
              key={index}
              className="group relative transform hover:scale-105 transition-all duration-300"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              {/* Glow effect */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-20 blur-2xl rounded-3xl transition-opacity`}></div>

              {/* Card */}
              <div className="relative bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-3xl p-8 border border-neutral-200/50 dark:border-neutral-700/50 shadow-xl h-full flex flex-col items-center text-center">
                <div className="text-6xl mb-4 transform group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className={`text-xl font-black mb-3 bg-gradient-to-r ${feature.gradient} bg-clip-text text-transparent`}>
                  {feature.title}
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer encouragement */}
        <div className="pt-8 opacity-70">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            💡 Pro tip: Organize your course materials now so you're ready to hit the ground running!
          </p>
        </div>
      </div>

      {/* Add custom animations in global CSS */}
      <style jsx>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// Regular landing page for non-authenticated users (app mode)
function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-neutral-950 dark:via-blue-950/20 dark:to-purple-950/20"></div>

      {/* Animated blobs */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-blob"></div>
        <div className="absolute top-40 right-1/4 w-96 h-96 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-20 left-1/3 w-96 h-96 bg-gradient-to-br from-pink-400/20 to-blue-400/20 rounded-full blur-3xl animate-blob animation-delay-4000"></div>
      </div>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32 text-center px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border border-purple-200 dark:border-purple-800 rounded-full shadow-lg">
            <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="font-bold text-purple-700 dark:text-purple-300">AI-Powered Study Companion</span>
          </div>

          {/* Main Heading */}
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-neutral-900 dark:text-neutral-100 max-w-5xl mx-auto leading-tight">
            Ace Your Exams with{' '}
            <span className="inline-block bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
              AI Tutoring
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-xl md:text-2xl lg:text-3xl text-neutral-600 dark:text-neutral-300 max-w-4xl mx-auto leading-relaxed font-medium">
            Upload your course materials. Get personalized lessons. Master anything faster with AI that adapts to how you learn.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12 items-center">
            <button
              onClick={() => window.location.href = '/sign-up'}
              className="group relative px-10 py-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-bold rounded-2xl shadow-2xl shadow-purple-500/50 transition-all duration-300 transform hover:scale-105"
            >
              <span className="relative z-10">Get Started Free →</span>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur"></div>
            </button>
            <button
              onClick={() => window.location.href = '/sign-in'}
              className="px-10 py-5 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-2 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 text-lg font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
            >
              Sign In
            </button>
          </div>

          {/* Trust indicator */}
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-6">
            ✨ No credit card required • 🎓 Free forever for students
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-neutral-900 dark:text-neutral-100 mb-4">
              Everything you need to <span className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">study smarter</span>
            </h2>
            <p className="text-xl text-neutral-600 dark:text-neutral-300 max-w-2xl mx-auto">
              Stop wasting time. Start learning with AI that understands your course.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '📚',
                title: 'Upload Anything',
                description: 'Textbooks, lecture slides, notes, PDFs—our AI reads it all and understands the context.',
                gradient: 'from-blue-500 to-cyan-500',
              },
              {
                icon: '🤖',
                title: 'Personalized Lessons',
                description: 'Get AI-generated lessons tailored to YOUR course, YOUR professor, YOUR learning style.',
                gradient: 'from-purple-500 to-pink-500',
              },
              {
                icon: '📊',
                title: 'Track Mastery',
                description: 'Know exactly what you know and what you don't. Focus on weak spots with adaptive practice.',
                gradient: 'from-green-500 to-emerald-500',
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="group relative transform hover:scale-105 transition-all duration-300"
              >
                {/* Glow effect */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-20 blur-2xl rounded-3xl transition-opacity`}></div>

                {/* Card */}
                <div className="relative h-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-3xl p-8 md:p-10 border border-neutral-200/50 dark:border-neutral-700/50 shadow-xl">
                  <div className="text-6xl mb-6 transform group-hover:scale-110 transition-transform">
                    {feature.icon}
                  </div>
                  <h3 className={`text-2xl font-black mb-4 bg-gradient-to-r ${feature.gradient} bg-clip-text text-transparent`}>
                    {feature.title}
                  </h3>
                  <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed text-lg">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-neutral-900 dark:text-neutral-100 mb-4">
              From overwhelmed to <span className="bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">exam-ready</span> in 3 steps
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                step: '1',
                title: 'Upload',
                description: 'Drop all your course materials—textbooks, lectures, everything.',
                emoji: '📤',
              },
              {
                step: '2',
                title: 'Learn',
                description: 'AI generates personalized lessons and checks your understanding.',
                emoji: '🧠',
              },
              {
                step: '3',
                title: 'Master',
                description: 'Track progress, practice weak spots, and ace your exams.',
                emoji: '🎯',
              },
            ].map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-3xl font-black shadow-2xl shadow-purple-500/50">
                  {step.step}
                </div>
                <div className="text-5xl mb-4">{step.emoji}</div>
                <h3 className="text-2xl font-black text-neutral-900 dark:text-neutral-100 mb-3">
                  {step.title}
                </h3>
                <p className="text-lg text-neutral-600 dark:text-neutral-300">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-4 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <h2 className="text-5xl md:text-6xl font-black text-neutral-900 dark:text-neutral-100">
            Ready to transform how you study?
          </h2>
          <p className="text-2xl text-neutral-600 dark:text-neutral-300">
            Join students who are studying smarter, not harder.
          </p>
          <button
            onClick={() => window.location.href = '/sign-up'}
            className="group relative px-12 py-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-xl font-black rounded-2xl shadow-2xl shadow-purple-500/50 transition-all duration-300 transform hover:scale-105"
          >
            <span className="relative z-10">Start Learning for Free →</span>
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur"></div>
          </button>
        </div>
      </section>

      {/* Animations */}
      <style jsx>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
}

