'use client';

import { FormEvent, useState, useRef, DragEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Button, Card, Input, Badge, Select } from '@/components/ui';
import CustomSelect from './CustomSelect';
import { useFetchCourses } from '@/lib/hooks/useFetchCourses';
import { getBackendUrl } from '@/lib/api';
import { useAuth } from '@clerk/nextjs';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedCourseId?: string | null;
}

export default function UploadModal({ isOpen, onClose, preselectedCourseId }: UploadModalProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { courses } = useFetchCourses();
  const [files, setFiles] = useState<File[]>([]);
  const [courseId, setCourseId] = useState(preselectedCourseId || '');
  const [materialType, setMaterialType] = useState<string>('textbook');
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
    if (isOpen && preselectedCourseId) {
      setCourseId(preselectedCourseId);
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

  // Determine if this material type uses chapter-based processing
  const usesChapterProcessing = ['textbook', 'lecture'].includes(materialType);
  const supportsMultipleFiles = usesChapterProcessing;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (files.length === 0) {
      setError('Please select at least one PDF file to upload.');
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

      if (usesChapterProcessing) {
        // Multiple file upload for chapter-based processing
        files.forEach(file => {
          formData.append('files', file);
        });
        formData.append('course_id', courseId);
        formData.append('material_type', materialType);
        formData.append('title', title || `${materialType} materials`);

        console.log(`[UploadModal] Uploading ${files.length} files for chapter processing`);

        // Get auth token for backend upload
        const token = await getToken();
        if (!token) {
          throw new Error('Authentication required');
        }

        // Upload to chapter-based endpoint
        const uploadRes = await fetch(`${getBackendUrl()}/upload/pdf-chapters`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });

        if (!uploadRes.ok) {
          const errorData = await uploadRes.json().catch(() => ({}));
          console.error('[UploadModal] Upload failed:', uploadRes.status, errorData);
          throw new Error(errorData.error || 'Upload failed');
        }

        const uploadData = await uploadRes.json();
        const { job_id, upload_batch_id, file_count } = uploadData;

        console.log('[UploadModal] Chapter upload successful:', { job_id, upload_batch_id, file_count });

        // Store job in session storage
        const processingJobs = JSON.parse(sessionStorage.getItem('processingJobs') || '[]');
        processingJobs.push({
          job_id,
          upload_batch_id,
          course_id: courseId,
          title: title || `${materialType} materials`,
          type: 'chapter_upload',
          file_count,
          started_at: new Date().toISOString()
        });
        sessionStorage.setItem('processingJobs', JSON.stringify(processingJobs));

        // Reset form and close modal
        setFiles([]);
        setTitle('');
        setIsUploading(false);
        onClose();

        // Redirect to course page
        router.push(`/courses/${courseId}?upload_job_id=${job_id}`);
      } else {
        // Single file upload for legacy processing (tutorial, exam)
        const file = files[0];
        formData.append('file', file);
        formData.append('course_id', courseId);
        formData.append('chapter', ''); // No chapter for non-textbook/lecture
        formData.append('material_type', materialType);
        formData.append('title', title || file.name.replace('.pdf', ''));

        // For files > 4MB, upload directly to backend to bypass Vercel's 4.5MB limit
        const FILE_SIZE_LIMIT = 4 * 1024 * 1024; // 4MB
        const useDirectUpload = file.size > FILE_SIZE_LIMIT;

        let uploadRes;
        if (useDirectUpload) {
          console.log(`[UploadModal] File size ${(file.size / 1024 / 1024).toFixed(2)}MB > 4MB, using direct upload to backend`);

          // Get auth token for direct backend upload
          const token = await getToken();
          if (!token) {
            throw new Error('Authentication required');
          }

          // Upload directly to backend
          uploadRes = await fetch(`${getBackendUrl()}/upload/pdf-structured`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: formData
          });
        } else {
          console.log(`[UploadModal] File size ${(file.size / 1024 / 1024).toFixed(2)}MB <= 4MB, using Vercel proxy`);

          // Use Vercel API route as proxy (for files <= 4MB)
          uploadRes = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
        }

        if (!uploadRes.ok) {
          const errorData = await uploadRes.json().catch(() => ({}));
          console.error('[UploadModal] Upload failed:', uploadRes.status, errorData);
          throw new Error(errorData.error || 'Upload failed');
        }

        const uploadData = await uploadRes.json();
        const { job_id, document_id } = uploadData;

        console.log('[UploadModal] Upload successful:', { job_id, document_id });

        // Store job in session storage
        const processingJobs = JSON.parse(sessionStorage.getItem('processingJobs') || '[]');
        processingJobs.push({
          job_id,
          document_id,
          course_id: courseId,
          chapter: null,
          title: title || file.name.replace('.pdf', ''),
          type: 'upload',
          started_at: new Date().toISOString()
        });
        sessionStorage.setItem('processingJobs', JSON.stringify(processingJobs));

        // Reset form and close modal
        setFiles([]);
        setTitle('');
        setIsUploading(false);
        onClose();

        // Redirect to course page
        router.push(`/courses/${courseId}?upload_job_id=${job_id}`);
      }
    } catch (err) {
      console.error('[UploadModal] Error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      // Always reset uploading state
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

    const droppedFiles = Array.from(e.dataTransfer.files);
    const pdfFiles = droppedFiles.filter(f => f.type === 'application/pdf');

    if (pdfFiles.length === 0) {
      setError('Please drop PDF files only');
      return;
    }

    if (!supportsMultipleFiles && pdfFiles.length > 1) {
      setError('This material type only supports single file upload');
      return;
    }

    setFiles(supportsMultipleFiles ? pdfFiles : [pdfFiles[0]]);
    if (!title && pdfFiles.length === 1) {
      setTitle(pdfFiles[0].name.replace('.pdf', ''));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf');

    if (pdfFiles.length === 0) {
      setError('Please select PDF files only');
      return;
    }

    if (!supportsMultipleFiles && pdfFiles.length > 1) {
      setError('This material type only supports single file upload');
      return;
    }

    setFiles(supportsMultipleFiles ? pdfFiles : [pdfFiles[0]]);
    if (!title && pdfFiles.length === 1) {
      setTitle(pdfFiles[0].name.replace('.pdf', ''));
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  if (!isOpen || !mounted) return null;

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm -z-10"
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
                <Button onClick={() => { onClose(); router.push('/'); }} variant="primary">
                  Go to Home
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Material Type Selection - First */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Material Type</h3>
                <CustomSelect
                  label="Select Material Type"
                  value={materialType}
                  onChange={(value) => {
                    setMaterialType(value);
                    // Reset files when changing type
                    setFiles([]);
                  }}
                  fullWidth
                  dropdownDirection="down"
                  options={[
                    { value: 'textbook', label: 'Textbook / Lecture Notes (Multiple Files)' },
                    { value: 'lecture', label: 'Lecture Notes (Multiple Files)' },
                    { value: 'tutorial', label: 'Tutorial Notes' },
                    { value: 'exam', label: 'Practice Problems & Solutions / Past Exams' }
                  ]}
                />
                {usesChapterProcessing && (
                  <div className="flex items-start gap-2 rounded-lg border border-primary-200 dark:border-primary-800/50 bg-primary-50 dark:bg-primary-900/20 p-3">
                    <svg className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div className="text-sm text-primary-800 dark:text-primary-300">
                      <p className="font-medium">Chapter-based processing enabled</p>
                      <p className="mt-1">Upload multiple files (e.g., textbook + lecture notes). Our AI will intelligently merge overlapping content and organize everything by chapters.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* File Upload Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                    Upload PDF {supportsMultipleFiles ? 'Documents' : 'Document'}
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    {supportsMultipleFiles
                      ? 'Drag and drop multiple PDF files or click to browse'
                      : 'Drag and drop your PDF file or click to browse'}
                  </p>
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
                      : files.length > 0
                      ? 'border-success-500 dark:border-success-600 bg-success-50 dark:bg-success-900/20'
                      : 'border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 hover:border-primary-400 dark:hover:border-primary-600'
                    }
                  `}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    multiple={supportsMultipleFiles}
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {files.length > 0 ? (
                    <div className="space-y-3">
                      <div className="w-12 h-12 bg-success-500 dark:bg-success-600 rounded-full flex items-center justify-center mx-auto">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-success-900 dark:text-success-300">
                          {files.length} file{files.length > 1 ? 's' : ''} selected
                        </p>
                        <p className="text-sm text-success-700 dark:text-success-400 mt-1">
                          Total size: {(totalSize / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                      >
                        {supportsMultipleFiles ? 'Add more files' : 'Change file'}
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
                          Drop your PDF{supportsMultipleFiles ? 's' : ''} here
                        </p>
                        <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
                          or click to browse files
                        </p>
                      </div>
                      <Badge variant="neutral">PDF files only</Badge>
                    </div>
                  )}
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Selected Files:</h4>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {files.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <svg className="w-5 h-5 text-danger-600 dark:text-danger-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                {file.name}
                              </p>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(index);
                            }}
                            className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
                            aria-label="Remove file"
                          >
                            <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                  label="Title (Optional)"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={files.length === 1 ? "Auto-filled from filename" : "e.g., ECE 358 Course Materials"}
                  fullWidth
                />
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
                  disabled={isUploading || files.length === 0}
                  loading={isUploading}
                  variant="primary"
                >
                  {isUploading
                    ? 'Uploading...'
                    : files.length > 1
                      ? `Upload ${files.length} PDFs`
                      : 'Upload PDF'}
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
