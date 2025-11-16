import { useState, useEffect } from 'react';
import type { Course } from '@/types';

/**
 * Custom hook to fetch courses from the API
 * Eliminates code duplication across multiple components
 */
export function useFetchCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchCourses() {
      try {
        const res = await fetch('/api/courses');
        if (res.ok) {
          const data = await res.json();
          setCourses(data.courses || []);
        } else {
          throw new Error(`Failed to fetch courses: ${res.statusText}`);
        }
      } catch (err) {
        console.error('Failed to fetch courses:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    }

    fetchCourses();
  }, []);

  return { courses, loading, error, refetch: () => setLoading(true) };
}
