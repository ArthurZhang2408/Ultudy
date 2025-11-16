'use client';

import { FormEvent, useState, useRef, DragEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Button, Card, Input, Badge } from '@/components/ui';
import CustomSelect from './CustomSelect';

type Course = {
  id: string;
  name: string;
  code: string | null;
};

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedCourseId?: string | null;
}

export default function UploadModal({ isOpen, onClose, preselectedCourseId }: UploadModalProps) {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [courseId, setCourseId] = useState(preselectedCourseId || '');
  const [chapter, setChapter] = useState('');
  const [materialType, setMaterialType] = useState('textbook');
  const [title, setTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchCourses();
      if (preselectedCourseId) {
        setCourseId(preselectedCourseId);
      }
    }
  }, [isOpen, preselectedCourseId]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose]);

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
      return;
    }

    if (!courseId) {
      setError('Please select a course.');
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('course_id', courseId);
      formData.append('chapter', chapter || '');
      formData.append('material_type', materialType);
      formData.append('title', title || file.name.replace('.pdf', ''));

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }

      const uploadData = await uploadRes.json();
      const { job_id, document_id } = uploadData;

      // Store job in session storage
      const processingJobs = JSON.parse(sessionStorage.getItem('processingJobs') || '[]');
      processingJobs.push({
        job_id,
        document_id,
        course_id: courseId,
        chapter: chapter || null,
        title: title || file.name.replace('.pdf', ''),
        type: 'upload',
        started_at: new Date().toISOString()
      });
      sessionStorage.setItem('processingJobs', JSON.stringify(processingJobs));

      // Reset form and close modal
      setFile(null);
      setChapter('');
      setTitle('');
      onClose();

      // Redirect to course page
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

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] my-auto bg-white dark:bg-neutral-900 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Upload Study Materials</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {courses.length === 0 ? (
            <div className="text-center py-12">
              <div className="max-w-md mx-auto space-y-4">
                <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">No courses yet</h3>
                <p className="text-neutral-600 dark:text-neutral-300">
                  Create a course first before uploading materials
                </p>
                <Button onClick={() => { onClose(); router.push('/courses'); }} variant="primary">
                  Create Your First Course
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* File Upload Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Upload PDF Document</h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">Drag and drop your PDF file or click to browse</p>
                </div>

                {/* Drag and Drop Area */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
                    ${isDragging
                      ? 'border-primary-500 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                      : file
                      ? 'border-success-500 dark:border-success-600 bg-success-50 dark:bg-success-900/20'
                      : 'border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 hover:border-primary-400 dark:hover:border-primary-600'
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
                    <div className="space-y-2">
                      <div className="w-12 h-12 bg-success-500 dark:bg-success-600 rounded-full flex items-center justify-center mx-auto">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-success-900 dark:text-success-300">{file.name}</p>
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
                    <div className="space-y-3">
                      <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto">
                        <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100">
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

              {/* Document Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Document Details</h3>

                {!preselectedCourseId && (
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
                  />
                )}

                <Input
                  label="Document Title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Auto-filled from filename"
                  fullWidth
                />

                <div className="grid grid-cols-2 gap-4">
                  <CustomSelect
                    label="Material Type"
                    value={materialType}
                    onChange={(value) => setMaterialType(value)}
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
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 rounded-lg border border-danger-200 dark:border-danger-800/50 bg-danger-50 dark:bg-danger-900/20 p-4">
                  <svg className="w-5 h-5 text-danger-600 dark:text-danger-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-danger-800 dark:text-danger-300">Upload Error</p>
                    <p className="text-sm text-danger-700 dark:text-danger-400 mt-1">{error}</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                <Button
                  type="button"
                  onClick={onClose}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isUploading || !file}
                  loading={isUploading}
                  variant="primary"
                >
                  {isUploading ? 'Uploading...' : 'Upload PDF'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
