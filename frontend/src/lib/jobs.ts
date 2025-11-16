/**
 * Job Polling and Status Management
 *
 * Utilities for tracking async job status and polling for updates
 */

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type Job = {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  data: any;
  result?: any;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
};

export type PollOptions = {
  interval?: number; // Poll interval in ms (default: 2000)
  maxAttempts?: number; // Max poll attempts (default: 150 = 5 minutes at 2s intervals)
  onProgress?: (job: Job) => void;
  onComplete?: (job: Job) => void;
  onError?: (error: string) => void;
};

/**
 * Poll for a single job's status
 */
export async function pollJobStatus(
  jobId: string,
  options: PollOptions = {}
): Promise<Job> {
  const {
    interval = 2000,
    maxAttempts = 150,
    onProgress,
    onComplete,
    onError
  } = options;

  let attempts = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        attempts++;

        const response = await fetch(`/api/jobs/${jobId}`);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Job not found');
          }
          throw new Error('Failed to fetch job status');
        }

        const job: Job = await response.json();

        // Call progress callback
        if (onProgress) {
          onProgress(job);
        }

        // Check if job is done
        if (job.status === 'completed') {
          if (onComplete) {
            onComplete(job);
          }
          resolve(job);
          return;
        }

        if (job.status === 'failed') {
          const error = job.error || 'Job failed';
          if (onError) {
            onError(error);
          }
          reject(new Error(error));
          return;
        }

        // Continue polling if job is still in progress
        if (attempts >= maxAttempts) {
          const timeoutError = 'Job polling timed out';
          if (onError) {
            onError(timeoutError);
          }
          reject(new Error(timeoutError));
          return;
        }

        setTimeout(poll, interval);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (onError) {
          onError(errorMessage);
        }
        reject(error);
      }
    };

    poll();
  });
}

/**
 * Poll for multiple jobs at once (more efficient than polling individually)
 */
export async function pollMultipleJobs(
  jobIds: string[],
  options: PollOptions = {}
): Promise<Map<string, Job>> {
  const {
    interval = 2000,
    maxAttempts = 150,
    onProgress,
    onComplete,
    onError
  } = options;

  let attempts = 0;
  const completedJobs = new Map<string, Job>();
  let activeJobIds = [...jobIds];

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        attempts++;

        // Poll all active jobs at once
        const response = await fetch('/api/jobs/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_ids: activeJobIds })
        });

        if (!response.ok) {
          throw new Error('Failed to poll jobs');
        }

        const { jobs } = await response.json();

        // Process each job
        for (const job of jobs) {
          if (onProgress) {
            onProgress(job);
          }

          if (job.status === 'completed') {
            completedJobs.set(job.id, job);
            activeJobIds = activeJobIds.filter(id => id !== job.id);

            if (onComplete) {
              onComplete(job);
            }
          } else if (job.status === 'failed') {
            completedJobs.set(job.id, job);
            activeJobIds = activeJobIds.filter(id => id !== job.id);

            if (onError) {
              onError(job.error || 'Job failed');
            }
          }
        }

        // Check if all jobs are done
        if (activeJobIds.length === 0) {
          resolve(completedJobs);
          return;
        }

        // Check timeout
        if (attempts >= maxAttempts) {
          const timeoutError = `Polling timed out for ${activeJobIds.length} job(s)`;
          if (onError) {
            onError(timeoutError);
          }
          reject(new Error(timeoutError));
          return;
        }

        setTimeout(poll, interval);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (onError) {
          onError(errorMessage);
        }
        reject(error);
      }
    };

    poll();
  });
}

/**
 * Hook-friendly polling function that can be canceled
 */
export function createJobPoller(jobId: string, options: PollOptions = {}) {
  let canceled = false;
  let timeoutId: NodeJS.Timeout | null = null;

  const {
    interval = 2000,
    maxAttempts = 150,
    onProgress,
    onComplete,
    onError
  } = options;

  let attempts = 0;

  const poll = async () => {
    if (canceled) return;

    try {
      attempts++;

      const response = await fetch(`/api/jobs/${jobId}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Job not found');
        }
        throw new Error('Failed to fetch job status');
      }

      const job: Job = await response.json();

      if (canceled) return;

      // Call progress callback
      if (onProgress) {
        onProgress(job);
      }

      // Check if job is done
      if (job.status === 'completed') {
        if (onComplete) {
          onComplete(job);
        }
        return;
      }

      if (job.status === 'failed') {
        const error = job.error || 'Job failed';
        if (onError) {
          onError(error);
        }
        return;
      }

      // Continue polling if job is still in progress
      if (attempts >= maxAttempts) {
        const timeoutError = 'Job polling timed out';
        if (onError) {
          onError(timeoutError);
        }
        return;
      }

      if (!canceled) {
        timeoutId = setTimeout(poll, interval);
      }
    } catch (error) {
      if (!canceled) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (onError) {
          onError(errorMessage);
        }
      }
    }
  };

  // Start polling
  poll();

  // Return cancel function
  return () => {
    canceled = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}
