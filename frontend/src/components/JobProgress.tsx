/**
 * JobProgress Component
 *
 * Displays job progress with a progress bar and status messages
 */

'use client';

import { useJob, Job } from '@/lib/hooks/useJob';

interface JobProgressProps {
  jobId: string;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  showDetails?: boolean;
  className?: string;
}

export function JobProgress({
  jobId,
  onComplete,
  onError,
  showDetails = true,
  className = ''
}: JobProgressProps) {
  const { job, loading, error } = useJob({
    jobId,
    onComplete,
    onError
  });

  if (loading && !job) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-2 bg-gray-200 rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-600 text-sm ${className}`}>
        Error loading job: {error}
      </div>
    );
  }

  if (!job) {
    return null;
  }

  const getStatusColor = (status: Job['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-400';
      case 'processing':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = (status: Job['status']) => {
    switch (status) {
      case 'pending':
        return 'Queued';
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const getJobTypeLabel = (type: Job['type']) => {
    switch (type) {
      case 'material-upload':
        return 'Material Upload';
      case 'lesson-generation':
        return 'Lesson Generation';
      case 'check-in-evaluation':
        return 'Check-in Evaluation';
      default:
        return type;
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {showDetails && (
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{getJobTypeLabel(job.type)}</span>
          <span className="text-gray-600">{getStatusText(job.status)}</span>
        </div>
      )}

      {/* Progress Bar */}
      <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 left-0 h-full transition-all duration-300 ${getStatusColor(job.status)}`}
          style={{ width: `${job.progress}%` }}
        />
      </div>

      {/* Progress Message */}
      {job.progress_message && showDetails && (
        <div className="text-xs text-gray-600">
          {job.progress_message}
        </div>
      )}

      {/* Error Message */}
      {job.status === 'failed' && job.error && showDetails && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {job.error}
        </div>
      )}

      {/* Completion Time */}
      {job.status === 'completed' && job.completed_at && showDetails && (
        <div className="text-xs text-green-600">
          Completed at {new Date(job.completed_at).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

/**
 * JobProgressModal Component
 *
 * Modal overlay showing job progress
 */
interface JobProgressModalProps {
  jobId: string | null;
  onClose: () => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  title?: string;
}

export function JobProgressModal({
  jobId,
  onClose,
  onComplete,
  onError,
  title = 'Processing'
}: JobProgressModalProps) {
  if (!jobId) return null;

  const handleComplete = (result: any) => {
    if (onComplete) {
      onComplete(result);
    }
    // Auto-close on completion after a short delay
    setTimeout(onClose, 1500);
  };

  const handleError = (error: string) => {
    if (onError) {
      onError(error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        <JobProgress
          jobId={jobId}
          onComplete={handleComplete}
          onError={handleError}
          showDetails={true}
        />
        <div className="mt-4 text-sm text-gray-500 text-center">
          Please wait while we process your request...
        </div>
      </div>
    </div>
  );
}
