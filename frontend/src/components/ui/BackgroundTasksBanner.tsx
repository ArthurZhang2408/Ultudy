'use client';

import { useState } from 'react';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { createPortal } from 'react-dom';

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
      {/* Compact Banner - Vercel-style */}
      <div className="fixed top-0 left-0 right-0 z-[9998] bg-neutral-900 dark:bg-black border-b border-neutral-800 dark:border-neutral-900">
        <div className="max-w-full mx-auto px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              {currentTask ? (
                <>
                  {/* Animated spinner */}
                  <div className="flex-shrink-0">
                    <svg className="animate-spin h-3.5 w-3.5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-neutral-300 dark:text-neutral-400 truncate">{currentTask.title}</p>
                  </div>
                  {remainingCount > 0 && (
                    <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] bg-neutral-800 dark:bg-neutral-900 text-neutral-400 rounded">
                      +{remainingCount}
                    </span>
                  )}
                </>
              ) : completedTasks.length > 0 ? (
                <>
                  <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-neutral-300 dark:text-neutral-400 truncate">
                      {completedTasks.length} task{completedTasks.length !== 1 ? 's' : ''} completed
                    </p>
                  </div>
                </>
              ) : failedTasks.length > 0 ? (
                <>
                  <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-neutral-300 dark:text-neutral-400 truncate">
                      {failedTasks.length} task{failedTasks.length !== 1 ? 's' : ''} failed
                    </p>
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {completedTasks.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearCompleted();
                  }}
                  className="px-2 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-300 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 hover:bg-neutral-800 dark:hover:bg-neutral-900 rounded transition-colors"
                aria-label={isExpanded ? 'Collapse tasks' : 'Expand tasks'}
              >
                <svg className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Modal */}
      {isExpanded && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-12">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setIsExpanded(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-neutral-900 dark:bg-black border border-neutral-800 dark:border-neutral-900 rounded-lg shadow-2xl overflow-hidden flex flex-col mx-4 animate-in slide-in-from-top-4 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 dark:border-neutral-900">
              <h2 className="text-sm font-semibold text-neutral-200 dark:text-neutral-300">
                Background Tasks
              </h2>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1.5 hover:bg-neutral-800 dark:hover:bg-neutral-900 rounded transition-colors"
              >
                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {tasks.length === 0 ? (
                <div className="text-center py-16 text-neutral-500 text-sm">
                  No tasks
                </div>
              ) : (
                <>
                  {/* Active Tasks */}
                  {activeTasks.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-600 uppercase tracking-wider px-1">
                        Active ({activeTasks.length})
                      </h3>
                      {activeTasks.map(task => (
                        <TaskCard key={task.id} task={task} onRemove={removeTask} />
                      ))}
                    </div>
                  )}

                  {/* Failed Tasks */}
                  {failedTasks.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-600 uppercase tracking-wider px-1">
                        Failed ({failedTasks.length})
                      </h3>
                      {failedTasks.map(task => (
                        <TaskCard key={task.id} task={task} onRemove={removeTask} />
                      ))}
                    </div>
                  )}

                  {/* Completed Tasks */}
                  {completedTasks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-600 uppercase tracking-wider">
                          Completed ({completedTasks.length})
                        </h3>
                        <button
                          onClick={clearCompleted}
                          className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
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
          <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'processing':
        return (
          <svg className="animate-spin h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      case 'completed':
        return (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  const getStatusColor = () => {
    switch (task.status) {
      case 'queued': return 'bg-neutral-800 dark:bg-neutral-950 border-neutral-700 dark:border-neutral-800';
      case 'processing': return 'bg-neutral-800 dark:bg-neutral-950 border-blue-900/50';
      case 'completed': return 'bg-neutral-800 dark:bg-neutral-950 border-green-900/50';
      case 'failed': return 'bg-neutral-800 dark:bg-neutral-950 border-red-900/50';
    }
  };

  return (
    <div className={`flex items-center gap-2.5 p-3 border rounded-lg ${getStatusColor()} transition-all duration-150`}>
      <div className="flex-shrink-0">
        {getStatusIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-neutral-300 dark:text-neutral-400 truncate">
          {task.title}
        </p>
        {task.status === 'failed' && task.error && (
          <p className="text-[10px] text-red-400 mt-0.5 truncate">
            {task.error}
          </p>
        )}
      </div>
      {(task.status === 'completed' || task.status === 'failed') && (
        <button
          onClick={() => onRemove(task.id)}
          className="flex-shrink-0 p-1 hover:bg-neutral-700 dark:hover:bg-neutral-900 rounded transition-colors"
          title="Remove task"
        >
          <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
