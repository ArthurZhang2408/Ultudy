'use client';

import { useState } from 'react';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';

export default function BackgroundTasksBanner() {
  const { activeTasks, completedTasks, failedTasks, tasks, removeTask, clearCompleted } = useBackgroundTasks();
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

  // Status messages
  const getDetailedStatus = (task: any) => {
    if (task.status === 'queued') return 'Queued';
    if (task.status === 'processing') {
      if (task.type === 'upload') return 'Extracting';
      if (task.type === 'lesson') return 'Generating';
      if (task.type === 'extraction') return 'Extracting';
      return 'Processing';
    }
    if (task.status === 'completed') return 'Completed';
    if (task.status === 'failed') return 'Failed';
    return task.status;
  };

  return (
    <div className="relative">
      {/* Compact Banner - Pushes content down */}
      <div className="w-full bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-neutral-900 dark:to-neutral-800 border-b border-blue-200 dark:border-neutral-700">
        <div className="max-w-full mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {currentTask ? (
                <>
                  {/* Animated spinner */}
                  <div className="flex-shrink-0">
                    <svg className="animate-spin h-4 w-4 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      {getDetailedStatus(currentTask)}
                    </span>
                    <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                      {currentTask.title}
                    </span>
                  </div>
                  {remainingCount > 0 && (
                    <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
                      +{remainingCount}
                    </span>
                  )}
                </>
              ) : completedTasks.length > 0 ? (
                <>
                  <svg className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-neutral-700 dark:text-neutral-300">
                      {completedTasks.length} task{completedTasks.length !== 1 ? 's' : ''} completed
                    </span>
                  </div>
                </>
              ) : failedTasks.length > 0 ? (
                <>
                  <svg className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-neutral-700 dark:text-neutral-300">
                      {failedTasks.length} task{failedTasks.length !== 1 ? 's' : ''} failed
                    </span>
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {completedTasks.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearCompleted();
                  }}
                  className="px-2 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 hover:bg-blue-100 dark:hover:bg-neutral-700 rounded-md transition-colors"
                aria-label={isExpanded ? 'Collapse tasks' : 'Expand tasks'}
              >
                <svg
                  className={`w-4 h-4 text-neutral-600 dark:text-neutral-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Dropdown - Slides down from banner */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[500px]' : 'max-h-0'
        }`}
      >
        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 shadow-lg">
          <div className="max-w-full mx-auto px-4 py-4 max-h-[500px] overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 text-sm">
                No tasks
              </div>
            ) : (
              <div className="space-y-4">
                {/* Active Tasks */}
                {activeTasks.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      Active ({activeTasks.length})
                    </h3>
                    {activeTasks.map(task => (
                      <TaskCard key={task.id} task={task} onRemove={removeTask} getDetailedStatus={getDetailedStatus} />
                    ))}
                  </div>
                )}

                {/* Failed Tasks */}
                {failedTasks.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      Failed ({failedTasks.length})
                    </h3>
                    {failedTasks.map(task => (
                      <TaskCard key={task.id} task={task} onRemove={removeTask} getDetailedStatus={getDetailedStatus} />
                    ))}
                  </div>
                )}

                {/* Completed Tasks */}
                {completedTasks.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                        Completed ({completedTasks.length})
                      </h3>
                      <button
                        onClick={clearCompleted}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                      >
                        Clear all
                      </button>
                    </div>
                    {completedTasks.map(task => (
                      <TaskCard key={task.id} task={task} onRemove={removeTask} getDetailedStatus={getDetailedStatus} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, onRemove, getDetailedStatus }: { task: any; onRemove: (id: string) => void; getDetailedStatus: (task: any) => string }) {
  const getStatusIcon = () => {
    switch (task.status) {
      case 'queued':
        return (
          <svg className="w-4 h-4 text-neutral-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'processing':
        return (
          <svg className="animate-spin h-4 w-4 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      case 'completed':
        return (
          <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  const getStatusColor = () => {
    switch (task.status) {
      case 'queued': return 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700';
      case 'processing': return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50';
      case 'completed': return 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50';
      case 'failed': return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50';
    }
  };

  return (
    <div className={`flex items-center gap-3 p-3 border rounded-lg ${getStatusColor()} transition-all duration-150`}>
      <div className="flex-shrink-0">
        {getStatusIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
            {getDetailedStatus(task)}
          </span>
          <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
            {task.title}
          </span>
        </div>
        {task.status === 'failed' && task.error && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate">
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
          <svg className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
