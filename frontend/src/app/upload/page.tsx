'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

type Course = {
  id: string;
  name: string;
  code: string | null;
};

type UploadResponse = {
  document_id: string;
  pages: number;
  chunks: number;
};

export default function UploadPage() {
  return (
    <Suspense fallback={<UploadPageFallback />}> 
      <UploadPageContent />
    </Suspense>
  );
}

function UploadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseIdParam = searchParams.get('course_id');

  const [courses, setCourses] = useState<Course[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [courseId, setCourseId] = useState(courseIdParam || '');
  const [chapter, setChapter] = useState('');
  const [materialType, setMaterialType] = useState('textbook');
  const [title, setTitle] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (courseIdParam && courseIdParam !== courseId) {
      setCourseId(courseIdParam);
    }
  }, [courseIdParam]);

  async function fetchCourses() {
    try {
      const res = await fetch('/api/courses');
      if (res.ok) {
        const data = await res.json();
        setCourses(data.courses || []);
      }
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setError('Please select a PDF file to upload.');
      setResult(null);
      return;
    }

    if (!courseId) {
      setError('Please select a course.');
      return;
    }

    setError(null);
    setIsUploading(true);
    setResult(null);

    try {
      // Step 1: Upload file
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }

      const uploadData = await uploadRes.json();
      setResult(uploadData);
      setUploadedDocId(uploadData.document_id);

      // Step 2: Update metadata with course, chapter, and type
      const metadataRes = await fetch(`/api/documents/${uploadData.document_id}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: courseId,
          chapter: chapter || null,
          material_type: materialType,
          title: title || file.name.replace('.pdf', '')
        })
      });

      if (!metadataRes.ok) {
        console.error('Failed to update metadata, but upload succeeded');
      }

      // Reset form
      setFile(null);
      setChapter('');
      setTitle('');

      // Success!
      setTimeout(() => {
        if (courseId) {
          router.push(`/courses/${courseId}`);
        }
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Upload Study Material</h1>
        <p className="text-slate-600">Add textbooks, lecture notes, or practice materials to your course.</p>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <h3 className="text-lg font-medium text-slate-900">No courses yet</h3>
          <p className="mt-2 text-sm text-slate-600">
            Create a course first before uploading materials.
          </p>
          <button
            onClick={() => router.push('/courses')}
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Go to Courses
          </button>
        </div>
      ) : (
        <form className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Course <span className="text-red-500">*</span>
            </label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">Select a course...</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code ? `${course.code} - ${course.name}` : course.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              PDF File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept="application/pdf"
              required
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-slate-600
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-slate-100 file:text-slate-700
                hover:file:bg-slate-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Document Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank to use filename"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Material Type
              </label>
              <select
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                <option value="textbook">Textbook</option>
                <option value="lecture">Lecture</option>
                <option value="tutorial">Tutorial</option>
                <option value="exam">Exam</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Chapter/Section
              </label>
              <input
                type="text"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                placeholder="Optional"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
          </div>

          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
            <p>
              <span className="font-semibold text-slate-900">What happens next?</span>
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>We store the full text of your PDF for rich lesson generation.</li>
              <li>You can tag the document with course, chapter, and material type.</li>
              <li>After upload completes, you’ll be redirected back to your course.</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isUploading ? 'Uploading...' : 'Upload PDF'}
          </button>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {result && (
            <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
              <p className="font-medium text-green-900">Upload successful!</p>
              <p className="mt-1">Processed {result.pages} pages and created {result.chunks} searchable chunks.</p>
              {uploadedDocId && (
                <p className="mt-2 text-xs text-green-700">Document ID: {uploadedDocId}</p>
              )}
            </div>
          )}
        </form>
      )}
    </section>
  );
}

function UploadPageFallback() {
  return (
    <section className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Upload Study Material</h1>
        <p className="text-slate-600">Preparing upload tools...</p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500">
        Loading course information...
      </div>
    </section>
  );
}
