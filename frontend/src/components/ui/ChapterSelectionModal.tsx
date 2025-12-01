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

interface EditableChapter extends Chapter {
  id: string; // Unique ID for React keys
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

  // Convert chapters to editable format with unique IDs
  const [chapters, setChapters] = useState<EditableChapter[]>([]);
  const [editMode, setEditMode] = useState(false);
  // Track selection by index instead of chapter number to handle duplicates
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize chapters with unique IDs
  useEffect(() => {
    if (isOpen && initialChapters.length > 0) {
      setChapters(initialChapters.map((ch, idx) => ({
        ...ch,
        id: `${ch.number}-${ch.pageStart}-${ch.pageEnd}-${idx}`
      })));
      // Select all by index
      setSelectedIndices(new Set(initialChapters.map((_, idx) => idx)));
      setError(null);
      setProgress(null);
      setEditMode(false);
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

  // Close on Escape key (or exit edit mode if in edit mode)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExtracting) {
        if (editMode) {
          setEditMode(false);
        } else {
          handleClose();
        }
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, isExtracting, editMode]);

  const toggleChapter = (index: number) => {
    const newSelected = new Set(selectedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIndices(newSelected);
  };

  const toggleAll = () => {
    if (selectedIndices.size === chapters.length) {
      // Deselect all
      setSelectedIndices(new Set());
    } else {
      // Select all
      setSelectedIndices(new Set(chapters.map((_, idx) => idx)));
    }
  };

  const updateChapter = (index: number, updates: Partial<EditableChapter>) => {
    setChapters(prev => prev.map((ch, idx) =>
      idx === index ? { ...ch, ...updates } : ch
    ));
  };

  const addNewChapter = () => {
    const newChapter: EditableChapter = {
      id: `new-${Date.now()}`,
      number: chapters.length > 0 ? Math.max(...chapters.map(c => c.number)) + 1 : 1,
      title: 'New Chapter',
      pageStart: chapters.length > 0 ? chapters[chapters.length - 1].pageEnd + 1 : 1,
      pageEnd: chapters.length > 0 ? chapters[chapters.length - 1].pageEnd + 10 : 10
    };
    setChapters(prev => [...prev, newChapter]);
    // Auto-select the new chapter
    setSelectedIndices(prev => new Set([...prev, chapters.length]));
  };

  const discardEdits = () => {
    // Reset to original chapters
    setChapters(initialChapters.map((ch, idx) => ({
      ...ch,
      id: `${ch.number}-${ch.pageStart}-${ch.pageEnd}-${idx}`
    })));
    setSelectedIndices(new Set(initialChapters.map((_, idx) => idx)));
    setEditMode(false);
  };

  const deleteChapter = (index: number) => {
    setChapters(prev => prev.filter((_, idx) => idx !== index));
    setSelectedIndices(prev => {
      const newSet = new Set(prev);
      newSet.delete(index);
      // Adjust indices after deletion
      const adjusted = new Set<number>();
      newSet.forEach(i => {
        if (i > index) adjusted.add(i - 1);
        else adjusted.add(i);
      });
      return adjusted;
    });
  };

  const mergeWithNext = (index: number) => {
    if (index >= chapters.length - 1) return;

    const current = chapters[index];
    const next = chapters[index + 1];

    setChapters(prev => {
      const merged = {
        ...current,
        title: current.title, // Keep first chapter's title
        pageStart: Math.min(current.pageStart, next.pageStart),
        pageEnd: Math.max(current.pageEnd, next.pageEnd)
      };
      return [
        ...prev.slice(0, index),
        merged,
        ...prev.slice(index + 2)
      ];
    });

    // Update selection
    setSelectedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index) || newSet.has(index + 1)) {
        newSet.add(index);
      }
      newSet.delete(index + 1);
      // Adjust indices after merge
      const adjusted = new Set<number>();
      newSet.forEach(i => {
        if (i > index + 1) adjusted.add(i - 1);
        else adjusted.add(i);
      });
      return adjusted;
    });
  };

  const handleClose = async () => {
    // If in edit mode, just exit edit mode instead of closing modal
    if (editMode) {
      setEditMode(false);
      return;
    }

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

      // Filter chapters to extract by selected indices (use edited chapters)
      const chaptersToExtract = chapters.filter((_, idx) => selectedIndices.has(idx));

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
        onClick={!isExtracting && !editMode ? handleClose : editMode ? () => setEditMode(false) : undefined}
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
              onClick={editMode ? () => setEditMode(false) : handleClose}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              aria-label={editMode ? "Exit edit mode" : "Close"}
              title={editMode ? "Exit edit mode" : "Close"}
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
                {chapters.length} chapter{chapters.length !== 1 ? 's' : ''} detected.
                {!editMode && ' Select the chapters you want to extract.'}
                {editMode && ' Edit chapter details below.'}
              </p>
              <div className="flex gap-2">
                {!editMode && (
                  <>
                    <button
                      onClick={() => setEditMode(true)}
                      disabled={isExtracting}
                      className="text-sm text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-50 font-medium"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={toggleAll}
                      disabled={isExtracting}
                      className="text-sm text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
                    >
                      {selectedIndices.size === chapters.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </>
                )}
                {editMode && (
                  <>
                    <button
                      onClick={addNewChapter}
                      className="text-sm px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50 font-medium"
                    >
                      + Add Chapter
                    </button>
                    <button
                      onClick={discardEdits}
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      Discard Changes
                    </button>
                    <button
                      onClick={() => setEditMode(false)}
                      className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium"
                    >
                      ✓ Save Changes
                    </button>
                  </>
                )}
              </div>
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
              {chapters.map((chapter, index) => (
                <div
                  key={chapter.id}
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all ${
                    selectedIndices.has(index)
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-neutral-200 dark:border-neutral-700'
                  } ${isExtracting ? 'opacity-50' : ''}`}
                >
                  {!editMode && (
                    <input
                      type="checkbox"
                      checked={selectedIndices.has(index)}
                      onChange={() => toggleChapter(index)}
                      disabled={isExtracting}
                      className="mt-0.5 w-5 h-5 text-primary-600 rounded border-neutral-300 focus:ring-primary-500 disabled:cursor-not-allowed"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    {editMode ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={chapter.number}
                            onChange={(e) => updateChapter(index, { number: parseInt(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 text-sm border rounded dark:bg-neutral-800 dark:border-neutral-600"
                            placeholder="Ch #"
                          />
                          <input
                            type="text"
                            value={chapter.title}
                            onChange={(e) => updateChapter(index, { title: e.target.value })}
                            className="flex-1 px-2 py-1 text-sm border rounded dark:bg-neutral-800 dark:border-neutral-600"
                            placeholder="Title"
                          />
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className="text-xs text-neutral-600 dark:text-neutral-400">Pages:</span>
                          <input
                            type="number"
                            min="1"
                            value={chapter.pageStart}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 1;
                              updateChapter(index, { pageStart: Math.max(1, val) });
                            }}
                            className="w-20 px-2 py-1 text-sm border rounded dark:bg-neutral-800 dark:border-neutral-600"
                            placeholder="Start"
                          />
                          <span className="text-neutral-400">–</span>
                          <input
                            type="number"
                            min="1"
                            value={chapter.pageEnd}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 1;
                              updateChapter(index, { pageEnd: Math.max(1, val) });
                            }}
                            className="w-20 px-2 py-1 text-sm border rounded dark:bg-neutral-800 dark:border-neutral-600"
                            placeholder="End"
                          />
                        </div>
                        {chapter.pageStart > chapter.pageEnd && (
                          <p className="text-xs text-red-600 dark:text-red-400">
                            ⚠️ Start page must be ≤ end page
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                          Chapter {chapter.number}: {chapter.title}
                        </div>
                        <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                          Pages {chapter.pageStart}–{chapter.pageEnd}
                        </div>
                      </>
                    )}
                  </div>

                  {editMode && (
                    <div className="flex gap-1 flex-shrink-0">
                      {index < chapters.length - 1 && (
                        <button
                          onClick={() => mergeWithNext(index)}
                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                          title="Merge with next chapter"
                        >
                          Merge ↓
                        </button>
                      )}
                      <button
                        onClick={() => deleteChapter(index)}
                        className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                        title="Delete this chapter"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 shrink-0">
          {!editMode ? (
            <>
              <Button
                onClick={handleClose}
                variant="secondary"
                disabled={isExtracting}
              >
                Cancel
              </Button>
              {selectedIndices.size > 0 && (
                <Button
                  onClick={handleExtract}
                  variant="primary"
                  disabled={isExtracting}
                  loading={isExtracting}
                >
                  {isExtracting ? 'Extracting...' : `Extract ${selectedIndices.size} Chapter${selectedIndices.size !== 1 ? 's' : ''}`}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                onClick={discardEdits}
                variant="secondary"
              >
                Discard Changes
              </Button>
              <Button
                onClick={() => setEditMode(false)}
                variant="primary"
              >
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
