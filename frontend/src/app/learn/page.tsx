'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

type MCQOption = {
  letter: string;
  text: string;
  correct: boolean;
  explanation: string;
};

type MCQ = {
  question: string;
  options: MCQOption[];
  expected_answer: string;
  hint?: string;
};

type Concept = {
  name: string;
  explanation: string;
  analogies?: string[];
  check_ins?: MCQ[];
};

type Lesson = {
  id?: string;
  topic?: string;
  summary?: string;
  explanation?: string;
  concepts?: Concept[];
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
function normalizeLesson(rawLesson: any): Lesson {
  // Parse JSONB fields if they are strings
  const concepts = typeof rawLesson.concepts === 'string'
    ? JSON.parse(rawLesson.concepts)
    : (rawLesson.concepts || []);

  return {
    ...rawLesson,
    concepts: Array.isArray(concepts) ? concepts : []
  };
}

export default function LearnPage() {
  return (
    <Suspense fallback={<LearnPageFallback />}> 
      <LearnPageContent />
    </Suspense>
  );
}

function LearnPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = searchParams.get('document_id');
  const chapter = searchParams.get('chapter');

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [showingSummary, setShowingSummary] = useState(true);
  const [currentConceptIndex, setCurrentConceptIndex] = useState(0);
  const [currentMCQIndex, setCurrentMCQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showingExplanations, setShowingExplanations] = useState(false);
  const [conceptProgress, setConceptProgress] = useState<Map<number, 'completed' | 'skipped' | 'wrong'>>(new Map());

  // Prevent duplicate API calls in StrictMode
  const hasGeneratedRef = useState({ current: false })[0];

  useEffect(() => {
    if (documentId && !hasGeneratedRef.current) {
      hasGeneratedRef.current = true;
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
        const errorData = await res.json().catch(() => ({ error: 'Failed to generate lesson' }));
        const errorMessage = errorData.details
          ? `${errorData.error}\n\n${errorData.details}`
          : errorData.error || 'Failed to generate lesson';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Failed to generate lesson:', error);
      alert('Failed to generate lesson. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleStartLearning() {
    setShowingSummary(false);
    setCurrentConceptIndex(0);
    setCurrentMCQIndex(0);
  }

  function handleSelectOption(letter: string) {
    setSelectedOption(letter);
    setShowingExplanations(true);
  }

  function handleNextMCQ() {
    if (!lesson?.concepts) return;

    const currentConcept = lesson.concepts[currentConceptIndex];
    const mcqs = currentConcept?.check_ins || [];

    // Mark answer as correct or wrong
    const wasCorrect = selectedOption === mcqs[currentMCQIndex]?.options?.find(opt => opt.correct)?.letter;

    if (currentMCQIndex < mcqs.length - 1) {
      // More MCQs in this concept
      setCurrentMCQIndex(currentMCQIndex + 1);
      setSelectedOption(null);
      setShowingExplanations(false);
    } else {
      // Finished all MCQs for this concept
      const newProgress = new Map(conceptProgress);
      if (!wasCorrect && !conceptProgress.has(currentConceptIndex)) {
        newProgress.set(currentConceptIndex, 'wrong');
      } else if (!conceptProgress.has(currentConceptIndex)) {
        newProgress.set(currentConceptIndex, 'completed');
      }
      setConceptProgress(newProgress);

      // Move to next concept
      if (currentConceptIndex < lesson.concepts.length - 1) {
        setCurrentConceptIndex(currentConceptIndex + 1);
        setCurrentMCQIndex(0);
        setSelectedOption(null);
        setShowingExplanations(false);
      } else {
        // All concepts completed
        router.push('/courses');
      }
    }
  }

  function handleSkipConcept() {
    if (!lesson?.concepts) return;

    const newProgress = new Map(conceptProgress);
    newProgress.set(currentConceptIndex, 'skipped');
    setConceptProgress(newProgress);

    if (currentConceptIndex < lesson.concepts.length - 1) {
      setCurrentConceptIndex(currentConceptIndex + 1);
      setCurrentMCQIndex(0);
      setSelectedOption(null);
      setShowingExplanations(false);
    } else {
      router.push('/courses');
    }
  }

  if (loading) {
    return <LearnPageFallback />;
  }

  if (!lesson || !lesson.concepts || lesson.concepts.length === 0) {
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

  const currentConcept = lesson.concepts[currentConceptIndex];
  const totalConcepts = lesson.concepts.length;
  const currentMCQ = currentConcept?.check_ins?.[currentMCQIndex];
  const totalMCQsInConcept = currentConcept?.check_ins?.length || 0;

  // Show summary screen
  if (showingSummary) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <button
            onClick={() => router.push('/courses')}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Back to courses
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {lesson.topic || (chapter ? `Chapter ${chapter}` : 'Lesson')}
            </h1>
          </div>

          {lesson.summary && (
            <div className="prose prose-slate max-w-none">
              <div className="whitespace-pre-wrap text-slate-700 text-lg leading-relaxed">
                {lesson.summary}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-blue-50 p-6">
            <h3 className="font-semibold text-blue-900 mb-3">In this lesson:</h3>
            <div className="space-y-2">
              {lesson.concepts.map((concept, idx) => (
                <div key={idx} className="flex items-start gap-2 text-blue-800">
                  <span className="text-blue-600 font-semibold">{idx + 1}.</span>
                  <span>{concept.name}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartLearning}
            className="w-full rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700"
          >
            Start Learning ({totalConcepts} concepts)
          </button>
        </div>
      </div>
    );
  }

  // Show concept learning screen
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowingSummary(true)}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to summary
        </button>
        <span className="text-sm text-slate-600">
          Concept {currentConceptIndex + 1} of {totalConcepts}
        </span>
      </div>

      {/* Concept Explanation */}
      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">{currentConcept.name}</h2>

        <div className="text-slate-700 text-base leading-relaxed">
          {currentConcept.explanation}
        </div>

        {currentConcept.analogies && currentConcept.analogies.length > 0 && (
          <div className="rounded-lg bg-green-50 p-4 mt-4">
            <div className="flex items-start gap-2">
              <span className="text-green-700 font-semibold">💡</span>
              <div className="text-green-800 text-sm">
                {currentConcept.analogies[0]}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MCQ Section */}
      {currentMCQ && (
        <div className="rounded-lg border-2 border-slate-300 bg-white p-8 shadow-md space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Check Your Understanding</h3>
            <span className="text-sm text-slate-600">
              Question {currentMCQIndex + 1} of {totalMCQsInConcept}
            </span>
          </div>

          <p className="text-base text-slate-900">{currentMCQ.question}</p>

          <div className="space-y-3">
            {currentMCQ.options.map((option) => {
              const isSelected = selectedOption === option.letter;
              const isCorrect = option.correct;
              const showAsCorrect = showingExplanations && isCorrect;
              const showAsWrong = showingExplanations && isSelected && !isCorrect;

              return (
                <div key={option.letter} className="space-y-2">
                  <button
                    onClick={() => !showingExplanations && handleSelectOption(option.letter)}
                    disabled={showingExplanations}
                    className={`w-full text-left rounded-lg border-2 p-4 transition-colors ${
                      showAsCorrect
                        ? 'border-green-500 bg-green-50'
                        : showAsWrong
                        ? 'border-red-500 bg-red-50'
                        : isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-300 bg-white hover:border-slate-400'
                    } ${showingExplanations ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`font-semibold ${
                        showAsCorrect ? 'text-green-700' :
                        showAsWrong ? 'text-red-700' :
                        isSelected ? 'text-blue-700' :
                        'text-slate-700'
                      }`}>
                        {option.letter}.
                      </span>
                      <span className={`flex-1 ${
                        showAsCorrect ? 'text-green-900' :
                        showAsWrong ? 'text-red-900' :
                        isSelected ? 'text-blue-900' :
                        'text-slate-900'
                      }`}>
                        {option.text}
                      </span>
                      {showAsCorrect && <span className="text-green-600 text-xl">✓</span>}
                      {showAsWrong && <span className="text-red-600 text-xl">✗</span>}
                    </div>
                  </button>

                  {showingExplanations && (isSelected || isCorrect) && (
                    <div className={`rounded-lg p-3 text-sm ${
                      isCorrect ? 'bg-green-50 text-green-900' : 'bg-slate-50 text-slate-800'
                    }`}>
                      <span className="font-semibold">
                        {isCorrect ? 'Why this is correct: ' : 'Why not: '}
                      </span>
                      {option.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
              onClick={handleSkipConcept}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Skip concept
            </button>
            <button
              onClick={handleNextMCQ}
              disabled={!showingExplanations}
              className="rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentMCQIndex === totalMCQsInConcept - 1
                ? currentConceptIndex === totalConcepts - 1
                  ? 'Finish Lesson'
                  : 'Next Concept'
                : 'Next Question'}
            </button>
          </div>
        </div>
      )}

      {/* Progress Indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Progress</span>
          <span>
            {conceptProgress.size} of {totalConcepts} concepts visited
          </span>
        </div>
        <div className="flex gap-2">
          {lesson.concepts.map((_, i) => {
            const status = conceptProgress.get(i);
            return (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full ${
                  i === currentConceptIndex
                    ? 'bg-blue-500'
                    : status === 'completed'
                    ? 'bg-green-500'
                    : status === 'wrong'
                    ? 'bg-orange-500'
                    : status === 'skipped'
                    ? 'bg-slate-400'
                    : 'bg-slate-200'
                }`}
                title={
                  i === currentConceptIndex
                    ? 'Current'
                    : status === 'completed'
                    ? 'Completed'
                    : status === 'wrong'
                    ? 'Needs review'
                    : status === 'skipped'
                    ? 'Skipped'
                    : 'Not started'
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LearnPageFallback() {
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
