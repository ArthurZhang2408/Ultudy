'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

type Course = {
  id: string;
  name: string;
  code: string | null;
  term: string | null;
  exam_date: string | null;
};

type Document = {
  id: string;
  title: string;
  material_type: string | null;
  chapter: string | null;
  pages: number;
  uploaded_at: string;
};

export default function CoursePage() {
  const params = useParams();
  const courseId = params.id as string;
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (courseId) {
      fetchCourseData();
    }
  }, [courseId]);

  async function fetchCourseData() {
    try {
      // Fetch course details
      const courseRes = await fetch(`/api/courses/${courseId}`);
      if (courseRes.ok) {
        const courseData = await courseRes.json();
        setCourse(courseData);
      }

      // Fetch documents for this course
      const docsRes = await fetch(`/api/documents?course_id=${courseId}`);
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        setDocuments(docsData.documents || []);
      }
    } catch (error) {
      console.error('Failed to fetch course data:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleStartStudy(documentId: string, chapter: string | null) {
    router.push(`/learn?document_id=${documentId}&chapter=${encodeURIComponent(chapter || '')}`);
  }

  async function handleDeleteDocument(documentId: string, title: string) {
    if (!confirm(`Are you sure you want to delete "${title}"?\n\nThis will permanently delete:\n• The document\n• All sections\n• All generated lessons\n• The PDF file\n\nThis action cannot be undone.`)) {
      return;
    }

    setDeleteError(null);

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to delete document');
      }

      const result = await res.json();
      console.log('Document deleted:', result);

      // Refresh the documents list
      fetchCourseData();
    } catch (error) {
      console.error('Failed to delete document:', error);
      setDeleteError(error instanceof Error ? error.message : 'Network error. Please check your connection.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading course...</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-900">Course not found</h2>
        <Link href="/courses" className="mt-4 inline-block text-slate-600 hover:text-slate-900">
          ← Back to courses
        </Link>
      </div>
    );
  }

  // Group documents by chapter
  const documentsByChapter = documents.reduce((acc, doc) => {
    const chapter = doc.chapter || 'Uncategorized';
    if (!acc[chapter]) {
      acc[chapter] = [];
    }
    acc[chapter].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  const chapters = Object.keys(documentsByChapter).sort((a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/courses" className="text-sm text-slate-600 hover:text-slate-900">
            ← Back to courses
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">{course.name}</h1>
          <div className="mt-2 flex gap-4 text-sm text-slate-600">
            {course.code && <span>{course.code}</span>}
            {course.term && <span>• {course.term}</span>}
            {course.exam_date && (
              <span>• Exam: {new Date(course.exam_date).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/progress?course_id=${course.id}`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            View Progress
          </Link>
          <Link
            href={`/upload?course_id=${course.id}`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Upload Materials
          </Link>
        </div>
      </div>

      {deleteError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-medium text-red-800">Delete Failed</h3>
              <p className="mt-1 text-sm text-red-700">{deleteError}</p>
            </div>
            <button
              onClick={() => setDeleteError(null)}
              className="text-red-500 hover:text-red-700"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <h3 className="text-lg font-medium text-slate-900">No materials uploaded yet</h3>
          <p className="mt-2 text-sm text-slate-600">
            Upload your textbooks, lecture notes, and practice problems to get started.
          </p>
          <Link
            href={`/upload?course_id=${course.id}`}
            className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Upload Your First Document
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {chapters.map((chapter) => (
            <div key={chapter} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {chapter === 'Uncategorized' ? chapter : `Chapter ${chapter}`}
              </h2>
              <div className="grid gap-3">
                {documentsByChapter[chapter].map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex-1">
                      <h3 className="font-medium text-slate-900">{doc.title}</h3>
                      <div className="mt-1 flex gap-3 text-sm text-slate-600">
                        {doc.material_type && (
                          <span className="capitalize">{doc.material_type}</span>
                        )}
                        <span>• {doc.pages} pages</span>
                        <span>
                          • {new Date(doc.uploaded_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStartStudy(doc.id, doc.chapter)}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Study
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc.id, doc.title)}
                        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                        title="Delete document"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
