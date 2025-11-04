'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

type CheckIn = {
  question: string;
  expected_answer: string;
  hint?: string;
};

type Concept = {
  name: string;
  check_ins?: CheckIn[];
};

type Lesson = {
  id?: string;
  summary?: string;
  explanation: string;
  examples?: any; // Can be JSONB string or array
  analogies?: any; // Can be JSONB string or array
  concepts?: any; // Can be JSONB string or array of Concept objects
  check_ins?: CheckIn[]; // Legacy format
  created_at?: string;
};

type MasteryUpdate = {
  concept_id: string;
  concept: string;
  old_state: string;
  new_state: string;
  total_attempts: number;
  correct_attempts: number;
  accuracy_percent: number;
};

// Helper function to parse JSONB fields and normalize lesson structure
function normalizeLesson(rawLesson: any): Lesson & { parsedExamples: string[], parsedAnalogies: string[], parsedConcepts: Concept[], allCheckIns: CheckIn[] } {
  // Parse JSONB fields if they are strings
  const examples = typeof rawLesson.examples === 'string'
    ? JSON.parse(rawLesson.examples)
    : (rawLesson.examples || []);

  const analogies = typeof rawLesson.analogies === 'string'
    ? JSON.parse(rawLesson.analogies)
    : (rawLesson.analogies || []);

  const concepts = typeof rawLesson.concepts === 'string'
    ? JSON.parse(rawLesson.concepts)
    : (rawLesson.concepts || []);

  // Extract all check-ins from concepts array
  const allCheckIns: CheckIn[] = [];
  const parsedConcepts: Concept[] = [];

  if (Array.isArray(concepts)) {
    concepts.forEach((concept: any) => {
      // Handle concept as object with check_ins
      if (typeof concept === 'object' && concept.name) {
        parsedConcepts.push(concept);
        if (Array.isArray(concept.check_ins)) {
          allCheckIns.push(...concept.check_ins);
        }
      } else if (typeof concept === 'string') {
        // Handle concept as simple string (legacy)
        parsedConcepts.push({ name: concept });
      }
    });
  }

  // Fallback to legacy check_ins array if no concepts with check-ins
  const checkIns = allCheckIns.length > 0 ? allCheckIns : (rawLesson.check_ins || []);

  return {
    ...rawLesson,
    parsedExamples: examples,
    parsedAnalogies: analogies,
    parsedConcepts: parsedConcepts,
    allCheckIns: checkIns
  };
}

export default function LearnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = searchParams.get('document_id');
  const chapter = searchParams.get('chapter');

  const [lesson, setLesson] = useState<ReturnType<typeof normalizeLesson> | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCheckIn, setCurrentCheckIn] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [completedCheckIns, setCompletedCheckIns] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (documentId) {
      generateLesson();
    }
  }, [documentId]);

  async function generateLesson() {
    setLoading(true);
    try {
      const res = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          chapter: chapter || undefined,
          include_check_ins: true
        })
      });

      if (res.ok) {
        const rawData = await res.json();
        console.log('[learn] Received lesson data:', rawData);
        const normalizedLesson = normalizeLesson(rawData);
        console.log('[learn] Normalized lesson:', normalizedLesson);
        setLesson(normalizedLesson);
      } else {
        alert('Failed to generate lesson');
      }
    } catch (error) {
      console.error('Failed to generate lesson:', error);
      alert('Failed to generate lesson');
    } finally {
      setLoading(false);
    }
  }

  async function submitCheckIn() {
    if (!lesson?.allCheckIns || !userAnswer.trim()) return;

    const checkIn = lesson.allCheckIns[currentCheckIn];

    // Find which concept this check-in belongs to
    let conceptName = 'General Concept';
    for (const concept of lesson.parsedConcepts) {
      if (concept.check_ins?.includes(checkIn)) {
        conceptName = concept.name;
        break;
      }
    }

    setEvaluating(true);

    try {
      const res = await fetch('/api/check-ins/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_name: conceptName,
          chapter: chapter || 'General',
          document_id: documentId,
          question: checkIn.question,
          user_answer: userAnswer,
          expected_answer: checkIn.expected_answer,
          context: lesson.explanation
        })
      });

      if (res.ok) {
        const result = await res.json();
        setEvaluation(result);
        if (result.correct) {
          setCompletedCheckIns(new Set([...completedCheckIns, currentCheckIn]));
        }
      } else {
        alert('Failed to evaluate answer');
      }
    } catch (error) {
      console.error('Failed to submit check-in:', error);
      alert('Failed to submit check-in');
    } finally {
      setEvaluating(false);
    }
  }

  function nextCheckIn() {
    if (!lesson?.allCheckIns) return;

    if (currentCheckIn < lesson.allCheckIns.length - 1) {
      setCurrentCheckIn(currentCheckIn + 1);
      setUserAnswer('');
      setShowHint(false);
      setEvaluation(null);
    } else {
      // All check-ins completed
      router.push('/courses');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="text-slate-600">Loading your lesson...</div>
          <div className="text-sm text-slate-500">
            Checking for cached lesson or generating new one (up to 10 seconds for first time)
          </div>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-900">Failed to load lesson</h2>
        <button
          onClick={() => router.push('/courses')}
          className="mt-4 text-slate-600 hover:text-slate-900"
        >
          ← Back to courses
        </button>
      </div>
    );
  }

  const checkIn = lesson.allCheckIns?.[currentCheckIn];
  const totalCheckIns = lesson.allCheckIns?.length || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <button
          onClick={() => router.push('/courses')}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to courses
        </button>
      </div>

      {/* Lesson Content */}
      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {chapter ? `Chapter ${chapter}` : 'Lesson'}
          </h1>
          {lesson.summary && (
            <p className="mt-2 text-lg text-slate-700">{lesson.summary}</p>
          )}
        </div>

        <div className="prose prose-slate max-w-none">
          <div className="whitespace-pre-wrap text-slate-800">{lesson.explanation}</div>
        </div>

        {lesson.parsedExamples && lesson.parsedExamples.length > 0 && (
          <div className="rounded-lg bg-blue-50 p-6">
            <h3 className="font-semibold text-blue-900">Examples</h3>
            <div className="mt-2 space-y-3 text-sm text-blue-800">
              {lesson.parsedExamples.map((example, i) => (
                <div key={i} className="whitespace-pre-wrap">{typeof example === 'string' ? example : JSON.stringify(example)}</div>
              ))}
            </div>
          </div>
        )}

        {lesson.parsedAnalogies && lesson.parsedAnalogies.length > 0 && (
          <div className="rounded-lg bg-green-50 p-6">
            <h3 className="font-semibold text-green-900">Analogies</h3>
            <div className="mt-2 space-y-3 text-sm text-green-800">
              {lesson.parsedAnalogies.map((analogy, i) => (
                <div key={i} className="whitespace-pre-wrap">{typeof analogy === 'string' ? analogy : JSON.stringify(analogy)}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Check-In Section */}
      {checkIn && (
        <div className="rounded-lg border-2 border-slate-300 bg-white p-8 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">
              Check Your Understanding
            </h2>
            <span className="text-sm text-slate-600">
              {currentCheckIn + 1} of {totalCheckIns}
            </span>
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-lg text-slate-900">{checkIn.question}</p>
            </div>

            {!evaluation && (
              <>
                <div>
                  <textarea
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    rows={4}
                    className="w-full rounded-md border border-slate-300 px-4 py-3 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3">
                  {checkIn.hint && !showHint && (
                    <button
                      onClick={() => setShowHint(true)}
                      className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Need a hint?
                    </button>
                  )}
                  <button
                    onClick={submitCheckIn}
                    disabled={!userAnswer.trim() || evaluating}
                    className="ml-auto rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {evaluating ? 'Evaluating...' : 'Submit Answer'}
                  </button>
                </div>

                {showHint && checkIn.hint && (
                  <div className="rounded-lg bg-yellow-50 p-4">
                    <p className="text-sm text-yellow-900">
                      <span className="font-semibold">Hint:</span> {checkIn.hint}
                    </p>
                  </div>
                )}
              </>
            )}

            {evaluation && (
              <div className="space-y-4">
                <div className={`rounded-lg p-6 ${evaluation.correct ? 'bg-green-50' : 'bg-orange-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`text-2xl ${evaluation.correct ? 'text-green-600' : 'text-orange-600'}`}>
                      {evaluation.correct ? '✓' : '○'}
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-semibold ${evaluation.correct ? 'text-green-900' : 'text-orange-900'}`}>
                        {evaluation.correct ? 'Correct!' : 'Not quite right'}
                      </h3>
                      <p className={`mt-1 text-sm ${evaluation.correct ? 'text-green-800' : 'text-orange-800'}`}>
                        {evaluation.feedback}
                      </p>
                    </div>
                  </div>
                </div>

                {evaluation.mastery_update && (
                  <div className="rounded-lg bg-slate-50 p-4">
                    <div className="text-sm text-slate-700">
                      <span className="font-semibold">Mastery Progress:</span>{' '}
                      {evaluation.mastery_update.old_state} → {evaluation.mastery_update.new_state}
                      {' '}({evaluation.mastery_update.accuracy_percent}% accuracy)
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  {evaluation.correct ? (
                    <button
                      onClick={nextCheckIn}
                      className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      {currentCheckIn < totalCheckIns - 1 ? 'Next Question' : 'Finish Lesson'}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setEvaluation(null);
                        setUserAnswer('');
                      }}
                      className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Try Again
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress Indicator */}
      {totalCheckIns > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: totalCheckIns }).map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full ${
                i < currentCheckIn ? 'bg-green-500' :
                i === currentCheckIn ? 'bg-blue-500' :
                'bg-slate-200'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
