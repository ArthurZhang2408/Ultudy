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
                    <button
                      onClick={() => handleStartStudy(doc.id, doc.chapter)}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Study
                    </button>
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
