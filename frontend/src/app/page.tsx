'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { Button, Card, Badge } from '@/components/ui';
import { useFetchCourses } from '@/lib/hooks/useFetchCourses';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function CoursesHomePage() {
  const router = useRouter();
  const { courses, loading, refetch } = useFetchCourses();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [newCourseName, setNewCourseName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

  const handleRename = async () => {
    if (!selectedCourse || !newCourseName.trim()) return;

    setIsRenaming(true);
    try {
      const response = await fetch(`/api/courses/${selectedCourse.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCourseName.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to rename course');
      }

      // Refresh courses list
      await refetch();
      setRenameDialogOpen(false);
      setSelectedCourse(null);
      setNewCourseName('');
    } catch (error) {
      console.error('Failed to rename course:', error);
      alert('Failed to rename course. Please try again.');
    } finally {
      setIsRenaming(false);
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

  const openRenameDialog = (course: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedCourse(course);
    setNewCourseName(course.name);
    setRenameDialogOpen(true);
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">My Courses</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-300">
          Select a course to view materials and start learning
        </p>
      </div>

      {courses.length === 0 ? (
        <Card className="text-center py-16 animate-fade-in">
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">No courses yet</h3>
            <p className="text-neutral-600 dark:text-neutral-300">
              Create your first course using the sidebar to start organizing your study materials.
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
                <Card interactive className="h-full group-hover:border-primary-400 dark:group-hover:border-primary-500 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
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
                            <button
                              onClick={(e) => openRenameDialog(course, e)}
                              className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Rename Course
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
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-primary-700 dark:group-hover:text-primary-400 transition-colors">
                    {course.name}
                  </h3>

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

                  {course.exam_date && (
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                      <svg className="w-4 h-4 text-warning-600 dark:text-warning-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm text-neutral-600 dark:text-neutral-300">
                        Exam: {new Date(course.exam_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
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

      {/* Rename Dialog */}
      {renameDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setRenameDialogOpen(false)}
          />
          <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Rename Course
            </h2>
            <input
              type="text"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Enter new course name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setRenameDialogOpen(false);
              }}
            />
            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setRenameDialogOpen(false)}
                disabled={isRenaming}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleRename}
                disabled={isRenaming || !newCourseName.trim()}
                className="flex-1"
              >
                {isRenaming ? 'Renaming...' : 'Rename'}
              </Button>
            </div>
          </div>
        </div>
      )}

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

  // Show loading state
  if (!isLoaded) {
    return null;
  }

  // If signed in, show courses page content directly
  if (isSignedIn) {
    return <CoursesHomePage />;
  }

  // Landing page for non-authenticated users
  return (
    <div className="space-y-20 pb-16">
      {/* Hero Section */}
      <section className="relative py-20 text-center overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-200/30 dark:bg-primary-900/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-success-200/20 dark:bg-success-900/10 rounded-full blur-3xl" />
        </div>

        <div className="space-y-6 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-900/40 border border-primary-200 dark:border-primary-800 rounded-full text-primary-700 dark:text-primary-300 text-sm font-medium">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            AI-Powered Adaptive Learning
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-neutral-900 dark:text-neutral-100 max-w-4xl mx-auto leading-tight">
            Master Any Course with{' '}
            <span className="bg-gradient-to-r from-primary-600 to-primary-800 dark:from-primary-400 dark:to-primary-600 bg-clip-text text-transparent">
              Personalized AI Lessons
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-neutral-600 dark:text-neutral-300 max-w-3xl mx-auto leading-relaxed">
            Transform your course materials into interactive learning experiences.
            Study smarter with AI-generated lessons, instant feedback, and intelligent progress tracking.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 dark:bg-primary-500 text-white text-lg font-semibold rounded-xl hover:bg-primary-700 dark:hover:bg-primary-600 shadow-lg hover:shadow-xl dark:shadow-dark-large dark:hover:shadow-dark-glow transition-all duration-200 hover:-translate-y-0.5"
            >
              Get Started Free
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-lg font-semibold rounded-xl border-2 border-neutral-300 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Materials
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-100">
            Everything you need to succeed
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-2xl mx-auto">
            From course organization to mastery tracking, Ultudy provides all the tools you need for effective learning.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="group bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 p-8 shadow-soft dark:shadow-dark-soft hover:shadow-large dark:hover:shadow-dark-large hover:-translate-y-1 transition-all duration-200">
            <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Organize Your Courses</h3>
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Create courses and upload your textbooks, lecture notes, and materials. Everything organized by chapter and ready to study.
            </p>
          </div>

          <div className="group bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 p-8 shadow-soft dark:shadow-dark-soft hover:shadow-large dark:hover:shadow-dark-large hover:-translate-y-1 transition-all duration-200">
            <div className="w-14 h-14 bg-gradient-to-br from-success-500 to-success-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Interactive Learning</h3>
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Get AI-generated lessons broken down into bite-sized concepts. Answer check-in questions with instant feedback to reinforce learning.
            </p>
          </div>

          <div className="group bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 p-8 shadow-soft dark:shadow-dark-soft hover:shadow-large dark:hover:shadow-dark-large hover:-translate-y-1 transition-all duration-200">
            <div className="w-14 h-14 bg-gradient-to-br from-warning-500 to-warning-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Track Your Mastery</h3>
            <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Visual progress tracking across all concepts. Identify weak areas, see your mastery improve, and stay motivated with clear metrics.
            </p>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="bg-gradient-to-br from-primary-50 to-white dark:from-primary-950/30 dark:to-neutral-900 rounded-3xl border border-primary-100 dark:border-primary-900/50 p-8 md:p-12">
        <div className="space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-100">
              How Ultudy Works
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-300">
              Start learning in minutes with our simple 4-step process
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: '1',
                title: 'Create Courses',
                description: 'Set up courses for each class you\'re taking',
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                ),
              },
              {
                step: '2',
                title: 'Upload Materials',
                description: 'Add your PDFs and tag them by chapter',
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                ),
              },
              {
                step: '3',
                title: 'Start Learning',
                description: 'Click "Study" to begin interactive lessons',
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ),
              },
              {
                step: '4',
                title: 'Track Progress',
                description: 'Answer questions and watch your mastery grow',
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                ),
              },
            ].map((item, index) => (
              <div key={index} className="relative bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-soft dark:shadow-dark-soft">
                <div className="absolute -top-4 -left-4 w-10 h-10 bg-primary-600 dark:bg-primary-500 text-white rounded-full flex items-center justify-center text-lg font-bold shadow-md dark:shadow-dark-medium">
                  {item.step}
                </div>
                <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/40 rounded-lg flex items-center justify-center text-primary-700 dark:text-primary-300 mb-3 mt-2">
                  {item.icon}
                </div>
                <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">{item.title}</h4>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="text-center bg-gradient-to-r from-primary-600 to-primary-800 dark:from-primary-700 dark:to-primary-900 rounded-3xl p-12 md:p-16 text-white shadow-large dark:shadow-dark-glow">
        <div className="space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to transform your learning?
          </h2>
          <p className="text-xl text-primary-100 dark:text-primary-200 max-w-2xl mx-auto">
            Join students who are mastering their courses faster with AI-powered adaptive learning.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white dark:bg-neutral-100 text-primary-700 dark:text-primary-800 text-lg font-semibold rounded-xl hover:bg-primary-50 dark:hover:bg-white shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5"
          >
            Start Learning Today
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  );
}
