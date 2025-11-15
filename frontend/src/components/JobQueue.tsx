/**
 * JobQueue Component
 *
 * Displays a list of jobs with their status
 */

'use client';

import { useJobList, Job } from '@/lib/hooks/useJob';
import { JobProgress } from './JobProgress';

interface JobQueueProps {
  type?: 'material-upload' | 'lesson-generation' | 'check-in-evaluation';
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  limit?: number;
  autoRefresh?: boolean;
  showTitle?: boolean;
  className?: string;
}

export function JobQueue({
  type,
  status,
  limit = 10,
  autoRefresh = true,
  showTitle = true,
  className = ''
}: JobQueueProps) {
  const { jobs, loading, error, refetch } = useJobList({
    type,
    status,
    limit,
    autoRefresh,
    refreshInterval: 3000
  });

  if (loading && jobs.length === 0) {
    return (
      <div className={`animate-pulse space-y-2 ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        <div className="h-16 bg-gray-200 rounded"></div>
        <div className="h-16 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-600 text-sm ${className}`}>
        Error loading jobs: {error}
        <button
          onClick={refetch}
          className="ml-2 text-blue-600 hover:text-blue-700 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className={`text-gray-500 text-sm text-center py-4 ${className}`}>
        No jobs found
      </div>
    );
  }

  const getJobTypeLabel = (jobType: Job['type']) => {
    switch (jobType) {
      case 'material-upload':
        return 'Material Upload';
      case 'lesson-generation':
        return 'Lesson Generation';
      case 'check-in-evaluation':
        return 'Check-in';
      default:
        return jobType;
    }
  };

  const getRelativeTime = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {showTitle && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Jobs</h3>
          <button
            onClick={refetch}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Refresh
          </button>
        </div>
      )}

      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {getJobTypeLabel(job.type)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {getRelativeTime(job.created_at)}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {job.status === 'completed' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✓ Completed
                  </span>
                )}
                {job.status === 'failed' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    ✗ Failed
                  </span>
                )}
                {job.status === 'processing' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    ⟳ Processing
                  </span>
                )}
                {job.status === 'pending' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    ○ Queued
                  </span>
                )}
              </div>
            </div>

            <JobProgress
              jobId={job.id}
              showDetails={false}
              className="mb-2"
            />

            {job.progress_message && (
              <div className="text-xs text-gray-600 mt-2">
                {job.progress_message}
              </div>
            )}

            {job.status === 'failed' && job.error && (
              <div className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded">
                {job.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * JobQueuePanel Component
 *
 * Floating panel showing active jobs
 */
interface JobQueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JobQueuePanel({ isOpen, onClose }: JobQueuePanelProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-2xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Job Queue</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <JobQueue showTitle={false} limit={20} />
        </div>
      </div>
    </>
  );
}
