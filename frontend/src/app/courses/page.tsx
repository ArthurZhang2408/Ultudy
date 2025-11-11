'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Course = {
  id: string;
  name: string;
  code: string | null;
  term: string | null;
  exam_date: string | null;
  created_at: string;
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    term: '',
    exam_date: ''
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetchCourses();
  }, []);

  async function fetchCourses() {
    try {
      const res = await fetch('/api/courses');
      if (res.ok) {
        const data = await res.json();
        setCourses(data.courses || []);
      }
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setFormData({ name: '', code: '', term: '', exam_date: '' });
        setShowCreateForm(false);
        setCreateError(null);
        fetchCourses();
      } else {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }));
        setCreateError(error.error || 'Failed to create course');
      }
    } catch (error) {
      console.error('Failed to create course:', error);
      setCreateError(error instanceof Error ? error.message : 'Network error. Please check your connection.');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading courses...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-slate-900">My Courses</h1>
        <button
          onClick={() => {
            setShowCreateForm(!showCreateForm);
            setCreateError(null);
          }}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showCreateForm ? 'Cancel' : 'Create Course'}
        </button>
      </div>

      {showCreateForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Create New Course</h2>
          {createError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {createError}
            </div>
          )}
          <form onSubmit={handleCreateCourse} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Course Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Signals and Systems"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Course Code</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., ECE 358"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Term</label>
                <input
                  type="text"
                  value={formData.term}
                  onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                  placeholder="e.g., Fall 2025"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Exam Date</label>
              <input
                type="date"
                value={formData.exam_date}
                onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError(null);
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Course'}
              </button>
            </div>
          </form>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <h3 className="text-lg font-medium text-slate-900">No courses yet</h3>
          <p className="mt-2 text-sm text-slate-600">
            Create your first course to start organizing your study materials.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create Your First Course
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="group rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 group-hover:text-slate-700">
                    {course.name}
                  </h3>
                  {course.code && (
                    <p className="mt-1 text-sm text-slate-600">{course.code}</p>
                  )}
                  {course.term && (
                    <p className="mt-1 text-xs text-slate-500">{course.term}</p>
                  )}
                </div>
              </div>
              {course.exam_date && (
                <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Exam: {new Date(course.exam_date).toLocaleDateString()}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
