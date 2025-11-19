'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { Button, Card, Badge } from '@/components/ui';
import EditCourseModal from '@/components/ui/EditCourseModal';
import { useFetchCourses } from '@/lib/hooks/useFetchCourses';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// COURSES HOMEPAGE - Authenticated users in app mode
function CoursesHomePage() {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const { courses: allCourses, loading, refetch } = useFetchCourses(true);
  const courses = showArchived ? allCourses.filter(c => c.archived) : allCourses.filter(c => !c.archived);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

  useEffect(() => {
    const handleCoursesUpdated = () => {
      refetch();
    };
    window.addEventListener('coursesUpdated', handleCoursesUpdated);
    return () => window.removeEventListener('coursesUpdated', handleCoursesUpdated);
  }, [refetch]);

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

      window.dispatchEvent(new CustomEvent('coursesUpdated'));
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

      window.dispatchEvent(new CustomEvent('coursesUpdated'));
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
                            const dateStr = course.exam_date.split('T')[0];
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

      <EditCourseModal
        isOpen={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        course={selectedCourse}
        onSuccess={refetch}
      />

      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteDialogOpen(false)}
          />
          <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-large dark:shadow-dark-large p-6 w-full max-w-md">
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
                variant="secondary"
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

  const launchMode = process.env.NEXT_PUBLIC_LAUNCH_MODE || 'app';
  const isLandingMode = launchMode === 'landing';

  if (!isLoaded) {
    return null;
  }

  if (isLandingMode) {
    if (isSignedIn) {
      return <PreLaunchPage />;
    }
    return <LandingPage />;
  }

  if (isSignedIn) {
    return <CoursesHomePage />;
  }

  return <LandingPage />;
}

// Countdown Timer - design system compliant
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
    return null;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-4xl mx-auto">
      {[
        { label: 'Days', value: timeLeft.days },
        { label: 'Hours', value: timeLeft.hours },
        { label: 'Minutes', value: timeLeft.minutes },
        { label: 'Seconds', value: timeLeft.seconds },
      ].map((item) => (
        <div
          key={item.label}
          className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 md:p-8 shadow-soft dark:shadow-dark-soft hover:shadow-medium dark:hover:shadow-dark-medium transition-all duration-200"
        >
          <div className="text-5xl md:text-6xl font-bold text-primary-600 dark:text-primary-400 mb-2">
            {String(item.value).padStart(2, '0')}
          </div>
          <div className="text-xs md:text-sm text-neutral-600 dark:text-neutral-400 font-medium uppercase tracking-wider">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// Pre-launch waitlist page - design system compliant
function PreLaunchPage() {
  const launchDate = process.env.NEXT_PUBLIC_LAUNCH_DATE || '2025-12-31T00:00:00';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-neutral-50 via-primary-50/30 to-neutral-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950" />

      <div className="max-w-5xl mx-auto text-center space-y-12 animate-fade-in">
        {/* Success Badge */}
        <Badge variant="success" size="lg" className="gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          You're on the waitlist!
        </Badge>

        {/* Main heading */}
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-neutral-900 dark:text-neutral-100">
            <span className="bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-400 dark:to-primary-500 bg-clip-text text-transparent">
              Ultudy
            </span>{' '}
            launches in
          </h1>
        </div>

        {/* Countdown Timer */}
        <div className="py-8">
          <CountdownTimer targetDate={launchDate} />
        </div>

        {/* Description */}
        <Card padding="lg" className="max-w-3xl mx-auto">
          <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Thanks for being an early supporter!
          </p>
          <p className="text-lg text-neutral-600 dark:text-neutral-300 mb-3">
            We're building something special just for you. Your AI-powered study companion is almost ready.
          </p>
          <p className="text-base text-neutral-500 dark:text-neutral-400">
            You'll receive an email the moment we launch. Start gathering your course materials—you're about to study smarter, not harder!
          </p>
        </Card>

        {/* What to expect */}
        <div className="grid md:grid-cols-3 gap-6 pt-8 max-w-4xl mx-auto">
          {[
            {
              icon: '📚',
              title: 'Upload Anything',
              description: 'Textbooks, lectures, notes, PDFs',
            },
            {
              icon: '🤖',
              title: 'AI-Powered Lessons',
              description: 'Personalized lessons tailored to you',
            },
            {
              icon: '📊',
              title: 'Master Faster',
              description: 'Track progress with adaptive learning',
            },
          ].map((feature, index) => (
            <Card key={index} hover className="text-center">
              <div className="text-5xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// Landing page - design system compliant
function LandingPage() {
  return (
    <div className="space-y-20 pb-16">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-neutral-50 via-primary-50/30 to-neutral-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950" />

      {/* Hero Section */}
      <section className="relative py-20 text-center animate-fade-in">
        <div className="max-w-5xl mx-auto space-y-8">
          <Badge variant="primary" size="lg" className="gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            AI-Powered Study Companion
          </Badge>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-neutral-900 dark:text-neutral-100 max-w-4xl mx-auto leading-tight">
            Master Any Course with{' '}
            <span className="bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-400 dark:to-primary-500 bg-clip-text text-transparent">
              AI-Powered Lessons
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto leading-relaxed">
            Upload your study materials and get personalized lessons, adaptive practice, and instant feedback tailored to how you learn.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Button variant="primary" size="lg" onClick={() => window.location.href = '/sign-up'}>
              Get Started Free
            </Button>
            <Button variant="outline" size="lg" onClick={() => window.location.href = '/sign-in'}>
              Sign In
            </Button>
          </div>

          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-4">
            No credit card required • Free for students
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Everything you need to study smarter
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-300">
              AI that understands your course and adapts to your learning style
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
                title: 'Upload Materials',
                description: 'Upload textbooks, lecture notes, or any PDF. Our AI extracts and understands key concepts automatically.',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ),
                title: 'Adaptive Lessons',
                description: 'Get personalized lessons that adapt to your understanding, focusing on what you need to learn most.',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ),
                title: 'Track Progress',
                description: 'Monitor your mastery with detailed analytics and adaptive practice that focuses on weak spots.',
              },
            ].map((feature, index) => (
              <Card key={index} className="text-center" hover>
                <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/40 rounded-xl flex items-center justify-center mx-auto mb-4 text-primary-600 dark:text-primary-400">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  {feature.title}
                </h3>
                <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              From overwhelmed to exam-ready
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-300">
              Get started in three simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                step: '1',
                title: 'Upload',
                description: 'Drop your textbooks, lectures, and course materials',
                emoji: '📤',
              },
              {
                step: '2',
                title: 'Learn',
                description: 'AI generates personalized lessons and checks understanding',
                emoji: '🧠',
              },
              {
                step: '3',
                title: 'Master',
                description: 'Track progress, practice weak spots, and ace exams',
                emoji: '🎯',
              },
            ].map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 mx-auto mb-6 bg-primary-600 dark:bg-primary-500 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-soft dark:shadow-dark-soft">
                  {step.step}
                </div>
                <div className="text-5xl mb-4">{step.emoji}</div>
                <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  {step.title}
                </h3>
                <p className="text-neutral-600 dark:text-neutral-300">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 text-center py-12">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl md:text-4xl font-semibold text-neutral-900 dark:text-neutral-100">
            Ready to transform how you study?
          </h2>
          <p className="text-xl text-neutral-600 dark:text-neutral-300">
            Join students who are learning smarter, not harder.
          </p>
          <Button variant="primary" size="lg" onClick={() => window.location.href = '/sign-up'}>
            Start Learning for Free
          </Button>
        </div>
      </section>
    </div>
  );
}
