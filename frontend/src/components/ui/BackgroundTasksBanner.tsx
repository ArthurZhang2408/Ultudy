'use client';

import { useState } from 'react';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { createPortal } from 'react-dom';
import { CircularProgress } from './Progress';

export default function BackgroundTasksBanner() {
  const { activeTasks, completedTasks, failedTasks, tasks, updateTask, removeTask, clearCompleted } = useBackgroundTasks();
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Only render on client
  if (typeof window === 'undefined') return null;

  // Set mounted after first render
  if (!mounted) {
    setTimeout(() => setMounted(true), 0);
    return null;
  }

  // Don't show banner if no tasks
  if (tasks.length === 0) return null;

  const currentTask = activeTasks[0];
  const remainingCount = activeTasks.length - 1;

  const banner = (
    <>
      {/* Compact Banner */}
      <div className="fixed top-0 left-0 right-0 z-[9998] bg-primary-600 dark:bg-primary-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-3 flex-1 hover:opacity-90 transition-opacity text-left"
            >
              {currentTask ? (
                <>
                  <CircularProgress value={currentTask.progress} size={24} strokeWidth={3} className="text-white" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{currentTask.title}</p>
                    {remainingCount > 0 && (
                      <p className="text-sm opacity-90">
                        {remainingCount} more task{remainingCount !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </>
              ) : completedTasks.length > 0 ? (
                <>
                  <svg className="w-6 h-6 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-medium">
                      {completedTasks.length} task{completedTasks.length !== 1 ? 's' : ''} completed
                    </p>
                  </div>
                </>
              ) : failedTasks.length > 0 ? (
                <>
                  <svg className="w-6 h-6 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-medium">
                      {failedTasks.length} task{failedTasks.length !== 1 ? 's' : ''} failed
                    </p>
                  </div>
                </>
              ) : null}
            </button>

            <div className="flex items-center gap-2">
              {completedTasks.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearCompleted();
                  }}
                  className="px-3 py-1 text-sm bg-white/20 hover:bg-white/30 rounded transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <svg className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Modal */}
      {isExpanded && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-20">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsExpanded(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-neutral-900 rounded-lg shadow-2xl overflow-hidden flex flex-col mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                Background Tasks
              </h2>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
              >
                <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {tasks.length === 0 ? (
                <div className="text-center py-12 text-neutral-500">
                  No tasks
                </div>
              ) : (
                <>
                  {/* Active Tasks */}
                  {activeTasks.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
                        Active ({activeTasks.length})
                      </h3>
                      {activeTasks.map(task => (
                        <TaskCard key={task.id} task={task} onRemove={removeTask} />
                      ))}
                    </div>
                  )}

                  {/* Failed Tasks */}
                  {failedTasks.length > 0 && (
                    <div className="space-y-2 mt-6">
                      <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
                        Failed ({failedTasks.length})
                      </h3>
                      {failedTasks.map(task => (
                        <TaskCard key={task.id} task={task} onRemove={removeTask} />
                      ))}
                    </div>
                  )}

                  {/* Completed Tasks */}
                  {completedTasks.length > 0 && (
                    <div className="space-y-2 mt-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
                          Completed ({completedTasks.length})
                        </h3>
                        <button
                          onClick={clearCompleted}
                          className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          Clear all
                        </button>
                      </div>
                      {completedTasks.map(task => (
                        <TaskCard key={task.id} task={task} onRemove={removeTask} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );

  return banner;
}

function TaskCard({ task, onRemove }: { task: any; onRemove: (id: string) => void }) {
  const getStatusIcon = () => {
    switch (task.status) {
      case 'queued':
        return (
          <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'processing':
        return <CircularProgress value={task.progress} size={20} strokeWidth={2.5} className="text-primary-600" />;
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getStatusColor = () => {
    switch (task.status) {
      case 'queued': return 'border-neutral-200 dark:border-neutral-700';
      case 'processing': return 'border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950';
      case 'completed': return 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950';
      case 'failed': return 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950';
    }
  };

  return (
    <div className={`flex items-start gap-3 p-4 border rounded-lg ${getStatusColor()} transition-colors`}>
      <div className="flex-shrink-0 mt-0.5">
        {getStatusIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
          {task.title}
        </p>
        {task.status === 'processing' && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            {task.progress}% complete
          </p>
        )}
        {task.status === 'failed' && task.error && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">
            {task.error}
          </p>
        )}
      </div>
      {(task.status === 'completed' || task.status === 'failed') && (
        <button
          onClick={() => onRemove(task.id)}
          className="flex-shrink-0 p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
          title="Remove task"
        >
          <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
