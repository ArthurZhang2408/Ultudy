'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useAuth } from '@clerk/nextjs';
import { getBackendUrl } from '@/lib/api';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { createJobPoller, type Job } from '@/lib/jobs';

interface Chapter {
  number: number;
  title: string;
  pageStart: number;
  pageEnd: number;
}

interface ChapterSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentName: string;
  storageKey: string;
  courseId: string;
  chapters: Chapter[];
}

export default function ChapterSelectionModal({
  isOpen,
  onClose,
  documentId,
  documentName,
  storageKey,
  courseId,
  chapters: initialChapters
}: ChapterSelectionModalProps) {
  const { getToken } = useAuth();
  const router = useRouter();
  const { addTask, updateTask } = useBackgroundTasks();
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize all chapters as selected
  useEffect(() => {
    if (isOpen && initialChapters.length > 0) {
      setSelectedChapters(new Set(initialChapters.map(c => c.number)));
      setError(null);
      setProgress(null);
    }
  }, [isOpen, initialChapters]);

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
      if (e.key === 'Escape' && !isExtracting) handleClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, isExtracting]);

  const toggleChapter = (chapterNumber: number) => {
    const newSelected = new Set(selectedChapters);
    if (newSelected.has(chapterNumber)) {
      newSelected.delete(chapterNumber);
    } else {
      newSelected.add(chapterNumber);
    }
    setSelectedChapters(newSelected);
  };

  const toggleAll = () => {
    if (selectedChapters.size === initialChapters.length) {
      // Deselect all
      setSelectedChapters(new Set());
    } else {
      // Select all
      setSelectedChapters(new Set(initialChapters.map(c => c.number)));
    }
  };

  const handleClose = async () => {
    // Delete the multi-chapter parent document when user cancels
    try {
      const token = await getToken();
      if (token && documentId) {
        console.log('[ChapterSelectionModal] Deleting multi-chapter parent document:', documentId);
        await fetch(`${getBackendUrl()}/documents/${documentId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error('[ChapterSelectionModal] Failed to delete document:', error);
    }
    onClose();
  };

  const handleExtract = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Filter chapters to extract
      const chaptersToExtract = initialChapters.filter(c => selectedChapters.has(c.number));

      console.log(`[ChapterSelectionModal] Extracting ${chaptersToExtract.length} chapters`);

      // Close modal immediately
      onClose();

      // Start extraction in background
      (async () => {
        try {
          const response = await fetch(`${getBackendUrl()}/tier2/extract-chapters`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              documentId,
              storageKey,
              courseId,
              chapters: chaptersToExtract
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to queue chapter extractions');
          }

          const result = await response.json();

          console.log(`[ChapterSelectionModal] Queued ${result.jobs.length} chapter extraction jobs`);

          // Create individual background tasks and start polling for each chapter
          result.jobs.forEach((job: any) => {
            const taskTitle = `${documentName} - Chapter ${job.chapterNumber}: ${job.chapterTitle}`;

            addTask({
              id: job.jobId,
              type: 'extraction',
              title: `Extracting ${taskTitle}`,
              status: 'processing',
              progress: 0,
              courseId,
              documentId
            });

            // Start polling this job (same pattern as single chapter extraction)
            createJobPoller(job.jobId, {
              interval: 2000,
              onProgress: (jobData: Job) => {
                updateTask(job.jobId, {
                  status: 'processing',
                  progress: jobData.progress || 0
                });
              },
              onComplete: (jobData: Job) => {
                console.log('[ChapterSelectionModal] Chapter extraction completed:', jobData);

                updateTask(job.jobId, {
                  status: 'completed',
                  progress: 100,
                  completedAt: new Date().toISOString()
                });

                // Refresh immediately to show this chapter
                router.refresh();
              },
              onError: (error: string) => {
                updateTask(job.jobId, {
                  status: 'failed',
                  error: error,
                  completedAt: new Date().toISOString()
                });
              }
            });
          });
        } catch (err) {
          console.error('[ChapterSelectionModal] Error:', err);

          // Show error to user (no specific task to update since we haven't created them yet)
          alert(err instanceof Error ? err.message : 'Failed to start chapter extractions');
        }
      })();
    } catch (err) {
      console.error('[ChapterSelectionModal] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to extract chapters');
    }
  };

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-safari -z-10"
        onClick={!isExtracting ? handleClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] my-auto bg-white dark:bg-neutral-900 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Select Chapters</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{documentName}</p>
          </div>
          {!isExtracting && (
            <button
              onClick={handleClose}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {initialChapters.length} chapters detected. Select the chapters you want to extract.
              </p>
              <button
                onClick={toggleAll}
                disabled={isExtracting}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {selectedChapters.size === initialChapters.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-danger-200 dark:border-danger-800/50 bg-danger-50 dark:bg-danger-900/20 p-4">
                <svg className="w-5 h-5 text-danger-600 dark:text-danger-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-danger-800 dark:text-danger-300">Extraction Error</p>
                  <p className="text-sm text-danger-700 dark:text-danger-400 mt-1">{error}</p>
                </div>
              </div>
            )}

            {progress && (
              <div className="rounded-lg border border-primary-200 dark:border-primary-800/50 bg-primary-50 dark:bg-primary-900/20 p-4">
                <p className="text-sm font-medium text-primary-800 dark:text-primary-300">
                  Extracting chapters... {progress.current}/{progress.total}
                </p>
                <div className="mt-2 w-full bg-primary-200 dark:bg-primary-800 rounded-full h-2">
                  <div
                    className="bg-primary-600 dark:bg-primary-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Chapter List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {initialChapters.map((chapter) => (
                <label
                  key={chapter.number}
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedChapters.has(chapter.number)
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                  } ${isExtracting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedChapters.has(chapter.number)}
                    onChange={() => toggleChapter(chapter.number)}
                    disabled={isExtracting}
                    className="mt-0.5 w-5 h-5 text-primary-600 rounded border-neutral-300 focus:ring-primary-500 disabled:cursor-not-allowed"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                      Chapter {chapter.number}: {chapter.title}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                      Pages {chapter.pageStart}–{chapter.pageEnd}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 shrink-0">
          <Button
            onClick={handleClose}
            variant="secondary"
            disabled={isExtracting}
          >
            Cancel
          </Button>
          {selectedChapters.size > 0 && (
            <Button
              onClick={handleExtract}
              variant="primary"
              disabled={isExtracting}
              loading={isExtracting}
            >
              {isExtracting ? 'Extracting...' : `Extract ${selectedChapters.size} Chapter${selectedChapters.size !== 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
