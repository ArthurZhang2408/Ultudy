/**
 * useJob Hook
 *
 * Custom hook for tracking async job status with polling
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface Job {
  id: string;
  type: 'material-upload' | 'lesson-generation' | 'check-in-evaluation';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  progress_message?: string;
  result?: any;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

interface UseJobOptions {
  jobId: string | null;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  pollingInterval?: number; // milliseconds
  enabled?: boolean;
}

interface UseJobReturn {
  job: Job | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useJob({
  jobId,
  onComplete,
  onError,
  pollingInterval = 1000,
  enabled = true
}: UseJobOptions): UseJobReturn {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const completedRef = useRef(false);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:3001/jobs/${jobId}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': localStorage.getItem('userId') || 'dev-user-001'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch job: ${response.statusText}`);
      }

      const data: Job = await response.json();
      setJob(data);

      // Call callbacks on completion
      if (data.status === 'completed' && !completedRef.current) {
        completedRef.current = true;
        if (onComplete) {
          onComplete(data.result);
        }
      } else if (data.status === 'failed' && !completedRef.current) {
        completedRef.current = true;
        if (onError) {
          onError(data.error || 'Job failed');
        }
      }

      // Stop polling if job is done
      if (data.status === 'completed' || data.status === 'failed') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('[useJob] Error fetching job:', err);
    } finally {
      setLoading(false);
    }
  }, [jobId, onComplete, onError]);

  // Start polling when jobId changes
  useEffect(() => {
    if (!jobId || !enabled) {
      return;
    }

    // Reset completed ref when jobId changes
    completedRef.current = false;

    // Initial fetch
    fetchJob();

    // Start polling
    pollingIntervalRef.current = setInterval(fetchJob, pollingInterval);

    // Cleanup
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [jobId, enabled, pollingInterval, fetchJob]);

  return {
    job,
    loading,
    error,
    refetch: fetchJob
  };
}

/**
 * useJobList Hook
 *
 * Hook for fetching list of jobs
 */
interface UseJobListOptions {
  type?: 'material-upload' | 'lesson-generation' | 'check-in-evaluation';
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  limit?: number;
  offset?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseJobListReturn {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useJobList({
  type,
  status,
  limit = 50,
  offset = 0,
  autoRefresh = false,
  refreshInterval = 5000
}: UseJobListOptions = {}): UseJobListReturn {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (type) params.append('type', type);
      if (status) params.append('status', status);
      params.append('limit', String(limit));
      params.append('offset', String(offset));

      const response = await fetch(`http://localhost:3001/jobs?${params}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': localStorage.getItem('userId') || 'dev-user-001'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch jobs: ${response.statusText}`);
      }

      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('[useJobList] Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [type, status, limit, offset]);

  useEffect(() => {
    fetchJobs();

    if (autoRefresh) {
      intervalRef.current = setInterval(fetchJobs, refreshInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [fetchJobs, autoRefresh, refreshInterval]);

  return {
    jobs,
    loading,
    error,
    refetch: fetchJobs
  };
}
