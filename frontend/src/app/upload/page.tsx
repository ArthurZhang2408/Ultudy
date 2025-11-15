'use client';

import { FormEvent, Suspense, useEffect, useState, useRef, DragEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button, Card, Input, Select, Badge } from '@/components/ui';

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
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // Step 1: Upload file (returns immediately with job ID)
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
      const { job_id, document_id, status } = uploadData;

      console.log('Upload queued:', { job_id, document_id, status });

      // Step 2: Update metadata with course, chapter, and type
      const metadataRes = await fetch(`/api/documents/${document_id}/metadata`, {
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

      // Step 3: Store job ID in session storage for tracking
      const processingJobs = JSON.parse(sessionStorage.getItem('processingJobs') || '[]');
      processingJobs.push({
        job_id,
        document_id,
        course_id: courseId,
        title: title || file.name.replace('.pdf', ''),
        type: 'upload',
        started_at: new Date().toISOString()
      });
      sessionStorage.setItem('processingJobs', JSON.stringify(processingJobs));

      // Reset form
      setFile(null);
      setChapter('');
      setTitle('');

      // Redirect immediately to course page (processing will continue in background)
      router.push(`/courses/${courseId}?upload_job_id=${job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      if (!title) {
        setTitle(droppedFile.name.replace('.pdf', ''));
      }
    } else {
      setError('Please drop a PDF file');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace('.pdf', ''));
      }
    }
  };

  return (
    <section className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">Upload Study Materials</h1>
        <p className="mt-2 text-lg text-neutral-600 dark:text-neutral-300">Add textbooks, lecture notes, or practice materials to your courses</p>
      </div>

      {courses.length === 0 ? (
        <Card className="text-center py-16">
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">No courses yet</h3>
            <p className="text-neutral-600 dark:text-neutral-300">
              Create a course first before uploading materials
            </p>
            <Button onClick={() => router.push('/courses')} variant="primary" size="lg">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Create Your First Course
            </Button>
          </div>
        </Card>
      ) : (
        <form className="space-y-8" onSubmit={handleSubmit}>
          {/* File Upload Section */}
          <Card padding="lg">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Upload PDF Document</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">Drag and drop your PDF file or click to browse</p>
              </div>

              {/* Drag and Drop Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200
                  ${isDragging
                    ? 'border-primary-500 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : file
                    ? 'border-success-500 dark:border-success-600 bg-success-50 dark:bg-success-900/20'
                    : 'border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 hover:border-primary-400 dark:hover:border-primary-600 hover:bg-primary-50/50 dark:hover:bg-primary-900/20'
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {file ? (
                  <div className="space-y-3 animate-scale-in">
                    <div className="w-16 h-16 bg-success-500 dark:bg-success-600 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-success-900 dark:text-success-300">{file.name}</p>
                      <p className="text-sm text-success-700 dark:text-success-400 mt-1">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      Remove file
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                        Drop your PDF here
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
                        or click to browse files
                      </p>
                    </div>
                    <Badge variant="neutral">PDF files only</Badge>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Course and Metadata Section */}
          <Card padding="lg">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Document Details</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">Organize your materials by course and chapter</p>
              </div>

              <Select
                label="Course"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                required
                fullWidth
                options={[
                  { value: '', label: 'Select a course...' },
                  ...courses.map(course => ({
                    value: course.id,
                    label: course.code ? `${course.code} - ${course.name}` : course.name
                  }))
                ]}
                helperText="Choose which course this material belongs to"
              />

              <Input
                label="Document Title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-filled from filename"
                fullWidth
                helperText="Customize the document name (optional)"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Select
                  label="Material Type"
                  value={materialType}
                  onChange={(e) => setMaterialType(e.target.value)}
                  fullWidth
                  options={[
                    { value: 'textbook', label: 'Textbook' },
                    { value: 'lecture', label: 'Lecture Notes' },
                    { value: 'tutorial', label: 'Tutorial' },
                    { value: 'exam', label: 'Exam / Practice' }
                  ]}
                />

                <Input
                  label="Chapter/Section"
                  type="text"
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  placeholder="e.g., Chapter 1"
                  fullWidth
                  helperText="Optional: Organize by chapter"
                />
              </div>

              <div className="rounded-xl bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/20 dark:to-neutral-800 border border-primary-200 dark:border-primary-800/50 p-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="font-semibold text-primary-900 dark:text-primary-300">What happens after upload?</p>
                    <ul className="space-y-1.5 text-sm text-primary-800 dark:text-primary-400">
                      <li className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>PDF text is extracted and processed for AI lessons</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>Document is organized by course and chapter</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>Ready for interactive learning sessions</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Button
            type="submit"
            disabled={isUploading || !file}
            loading={isUploading}
            variant="primary"
            size="lg"
            fullWidth
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {isUploading ? 'Uploading PDF...' : 'Upload and Process PDF'}
          </Button>

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-danger-200 dark:border-danger-800/50 bg-danger-50 dark:bg-danger-900/20 p-4 animate-slide-down">
              <svg className="w-5 h-5 text-danger-600 dark:text-danger-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-danger-800 dark:text-danger-300">Upload Error</p>
                <p className="text-sm text-danger-700 dark:text-danger-400 mt-1">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="flex items-start gap-3 rounded-lg border border-success-200 dark:border-success-800/50 bg-success-50 dark:bg-success-900/20 p-6 animate-scale-in">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-success-600 dark:text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-success-900 dark:text-success-300 mb-2">Upload Successful!</p>
                <div className="space-y-1 text-sm text-success-800 dark:text-success-400">
                  <p>Processed {result.pages} pages and created {result.chunks} searchable chunks</p>
                  <p className="text-xs text-success-700 dark:text-success-400">Redirecting you back to your course...</p>
                </div>
              </div>
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
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-neutral-100">Upload Study Material</h1>
        <p className="text-slate-600 dark:text-neutral-300">Preparing upload tools...</p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-8 text-center text-slate-500 dark:text-neutral-400">
        Loading course information...
      </div>
    </section>
  );
}
