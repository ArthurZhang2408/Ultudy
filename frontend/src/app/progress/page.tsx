'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Concept = {
  id: string;
  name: string;
  mastery_state: string;
  total_attempts: number;
  correct_attempts: number;
  accuracy: number;
  last_reviewed_at: string | null;
};

type ChapterData = {
  concepts: Concept[];
  total: number;
  mastered: number;
  understood: number;
  needs_review: number;
  not_learned: number;
  percentage: number;
};

type WeakArea = {
  id: string;
  name: string;
  chapter: string;
  mastery_state: string;
  accuracy: number;
  total_attempts: number;
};

type StudySession = {
  id: string;
  session_type: string;
  chapter: string;
  course_id: string;
  total_check_ins: number;
  correct_check_ins: number;
  accuracy: number;
  duration_minutes: number | null;
  started_at: string;
  completed_at: string | null;
};

type ProgressData = {
  content_mastery: {
    by_chapter: Record<string, ChapterData>;
    overall: number;
    total_concepts: number;
    mastered_concepts: number;
    understood_concepts: number;
  };
  weak_areas: WeakArea[];
  study_sessions: StudySession[];
  stats: {
    total_sessions: number;
    total_check_ins: number;
    total_correct: number;
    overall_accuracy: number;
    total_study_time_minutes: number;
  };
};

export default function ProgressPage() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course_id');

  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProgress();
  }, [courseId]);

  async function fetchProgress() {
    try {
      setLoading(true);
      setError(null);

      const url = courseId
        ? `/api/progress/overview?course_id=${courseId}`
        : '/api/progress/overview';

      const res = await fetch(url);

      if (!res.ok) {
        throw new Error('Failed to fetch progress data');
      }

      const data = await res.json();
      setProgress(data);
    } catch (err) {
      console.error('Failed to fetch progress:', err);
      setError(err instanceof Error ? err.message : 'Failed to load progress');
    } finally {
      setLoading(false);
    }
  }

  function getMasteryColor(state: string): string {
    switch (state) {
      case 'mastered':
        return 'bg-green-500';
      case 'understood':
        return 'bg-blue-500';
      case 'needs_review':
        return 'bg-orange-500';
      case 'introduced':
        return 'bg-yellow-500';
      default:
        return 'bg-slate-300';
    }
  }

  function getMasteryLabel(state: string): string {
    switch (state) {
      case 'mastered':
        return 'Mastered';
      case 'understood':
        return 'Understood';
      case 'needs_review':
        return 'Needs Review';
      case 'introduced':
        return 'Introduced';
      default:
        return 'Not Learned';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading progress...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-900">Failed to load progress</h2>
        <p className="mt-2 text-slate-600">{error}</p>
        <button
          onClick={fetchProgress}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!progress) {
    return null;
  }

  const chapters = Object.keys(progress.content_mastery.by_chapter).sort((a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-slate-900">Learning Progress</h1>
        <Link
          href="/courses"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Back to Courses
        </Link>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Overall Mastery</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">
            {progress.content_mastery.overall}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {progress.content_mastery.total_concepts} concepts total
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Study Sessions</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">
            {progress.stats.total_sessions}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {progress.stats.total_study_time_minutes} minutes total
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Check-in Accuracy</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">
            {progress.stats.overall_accuracy}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {progress.stats.total_correct}/{progress.stats.total_check_ins} correct
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-slate-600">Mastered Concepts</div>
          <div className="mt-2 text-3xl font-bold text-green-600">
            {progress.content_mastery.mastered_concepts}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {progress.content_mastery.understood_concepts} understood
          </div>
        </div>
      </div>

      {/* Chapter-by-Chapter Progress */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Progress by Chapter</h2>
        <div className="space-y-4">
          {chapters.map((chapter) => {
            const chapterData = progress.content_mastery.by_chapter[chapter];
            return (
              <div key={chapter} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-slate-900">
                    {chapter === 'Uncategorized' ? chapter : `Chapter ${chapter}`}
                  </h3>
                  <span className="text-sm font-semibold text-slate-900">
                    {chapterData.percentage}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    className="bg-green-500"
                    style={{ width: `${(chapterData.mastered / chapterData.total) * 100}%` }}
                    title={`${chapterData.mastered} mastered`}
                  />
                  <div
                    className="bg-blue-500"
                    style={{ width: `${(chapterData.understood / chapterData.total) * 100}%` }}
                    title={`${chapterData.understood} understood`}
                  />
                  <div
                    className="bg-orange-500"
                    style={{ width: `${(chapterData.needs_review / chapterData.total) * 100}%` }}
                    title={`${chapterData.needs_review} needs review`}
                  />
                  <div
                    className="bg-slate-300"
                    style={{ width: `${(chapterData.not_learned / chapterData.total) * 100}%` }}
                    title={`${chapterData.not_learned} not learned`}
                  />
                </div>

                <div className="flex gap-4 text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded" />
                    {chapterData.mastered} mastered
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-blue-500 rounded" />
                    {chapterData.understood} understood
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-orange-500 rounded" />
                    {chapterData.needs_review} needs review
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-slate-300 rounded" />
                    {chapterData.not_learned} not started
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weak Areas */}
      {progress.weak_areas.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-orange-900 mb-4">
            Areas Needing Attention
          </h2>
          <div className="space-y-2">
            {progress.weak_areas.map((concept) => (
              <div
                key={concept.id}
                className="flex items-center justify-between rounded-lg bg-white p-3 border border-orange-200"
              >
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{concept.name}</div>
                  <div className="text-sm text-slate-600">
                    Chapter {concept.chapter} • {concept.total_attempts} attempts
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-orange-600">
                      {concept.accuracy}% accuracy
                    </div>
                    <div className="text-xs text-slate-500">
                      {getMasteryLabel(concept.mastery_state)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Study Sessions */}
      {progress.study_sessions.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Recent Study Sessions</h2>
          <div className="space-y-2">
            {progress.study_sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
              >
                <div className="flex-1">
                  <div className="font-medium text-slate-900 capitalize">
                    {session.session_type}
                    {session.chapter && ` - Chapter ${session.chapter}`}
                  </div>
                  <div className="text-sm text-slate-600">
                    {new Date(session.started_at).toLocaleDateString()} at{' '}
                    {new Date(session.started_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                    {session.duration_minutes && ` • ${session.duration_minutes} min`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">
                    {session.accuracy}% accuracy
                  </div>
                  <div className="text-xs text-slate-500">
                    {session.correct_check_ins}/{session.total_check_ins} correct
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {progress.content_mastery.total_concepts === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <h3 className="text-lg font-medium text-slate-900">No progress data yet</h3>
          <p className="mt-2 text-sm text-slate-600">
            Start studying to track your progress and see your mastery grow!
          </p>
          <Link
            href="/courses"
            className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Browse Courses
          </Link>
        </div>
      )}
    </div>
  );
}
