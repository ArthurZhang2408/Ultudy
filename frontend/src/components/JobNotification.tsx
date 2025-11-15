/**
 * JobNotification Component
 *
 * Toast notification for job completion/failure
 */

'use client';

import { useEffect, useState } from 'react';
import { Job } from '@/lib/hooks/useJob';

export interface NotificationProps {
  job: Job;
  onDismiss: () => void;
  duration?: number; // milliseconds
}

export function JobNotification({ job, onDismiss, duration = 5000 }: NotificationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300); // Wait for fade-out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const getIcon = () => {
    if (job.status === 'completed') {
      return (
        <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    }
    if (job.status === 'failed') {
      return (
        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    }
    return null;
  };

  const getTitle = () => {
    const typeLabel = {
      'material-upload': 'Material Upload',
      'lesson-generation': 'Lesson Generation',
      'check-in-evaluation': 'Check-in Evaluation'
    }[job.type] || job.type;

    if (job.status === 'completed') {
      return `${typeLabel} Completed`;
    }
    if (job.status === 'failed') {
      return `${typeLabel} Failed`;
    }
    return typeLabel;
  };

  const getMessage = () => {
    if (job.status === 'completed') {
      return 'Your request has been processed successfully.';
    }
    if (job.status === 'failed') {
      return job.error || 'An error occurred while processing your request.';
    }
    return '';
  };

  const bgColor = job.status === 'completed' ? 'bg-green-50' : 'bg-red-50';
  const borderColor = job.status === 'completed' ? 'border-green-200' : 'border-red-200';

  return (
    <div
      className={`${bgColor} border ${borderColor} rounded-lg p-4 shadow-lg transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{getTitle()}</p>
          <p className="text-sm text-gray-600 mt-1">{getMessage()}</p>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onDismiss, 300);
          }}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * NotificationContainer Component
 *
 * Container for managing multiple notifications
 */
interface NotificationContainerProps {
  notifications: Array<{ id: string; job: Job }>;
  onDismiss: (id: string) => void;
}

export function NotificationContainer({ notifications, onDismiss }: NotificationContainerProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {notifications.map(({ id, job }) => (
        <JobNotification key={id} job={job} onDismiss={() => onDismiss(id)} />
      ))}
    </div>
  );
}
