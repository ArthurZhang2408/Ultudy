/**
 * Hook to fetch tier 2 chapter sources
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { getBackendUrl } from '@/lib/api';

export type ChapterSource = {
  id: string;
  documentId: string;
  documentTitle: string;
  chapterTitle: string;
  chapterNumber: number | null;
  pageStart: number | null;
  pageEnd: number | null;
  createdAt: string;
};

export type ChapterSourcesData = {
  [chapterNumber: number | string]: ChapterSource[];
};

export function useFetchChapterSources(courseId: string | null) {
  const { getToken } = useAuth();
  const [chapterSources, setChapterSources] = useState<ChapterSourcesData>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;

    const fetchSources = async () => {
      setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Authentication required');
        }

        const response = await fetch(`${getBackendUrl()}/tier2/chapter-sources/${courseId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch chapter sources');
        }

        const data = await response.json();
        setChapterSources(data.chapters || {});
      } catch (err) {
        console.error('[useFetchChapterSources] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch chapter sources');
      } finally {
        setLoading(false);
      }
    };

    fetchSources();
  }, [courseId, getToken]);

  const refetch = async () => {
    if (!courseId) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`${getBackendUrl()}/tier2/chapter-sources/${courseId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch chapter sources');
      }

      const data = await response.json();
      setChapterSources(data.chapters || {});
    } catch (err) {
      console.error('[useFetchChapterSources] Refetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch chapter sources');
    } finally {
      setLoading(false);
    }
  };

  return { chapterSources, loading, error, refetch };
}
