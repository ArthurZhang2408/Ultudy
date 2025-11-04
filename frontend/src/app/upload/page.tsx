'use client';

import { FormEvent, useState, useEffect } from 'react';
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
                <option value="lecture">Lecture Notes</option>
                <option value="tutorial">Tutorial/Practice</option>
                <option value="exam">Past Exam</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Chapter
              </label>
              <input
                type="text"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                placeholder="e.g., 1, 2, 3"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isUploading}
              className="rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : 'Upload & Save'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <h2 className="font-semibold">Upload successful!</h2>
          <p className="mt-2">
            Document uploaded with {result.pages} pages. Redirecting to course page...
          </p>
        </div>
      )}
    </section>
  );
}
