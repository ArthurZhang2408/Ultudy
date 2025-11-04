'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
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
  id?: string;
  name: string;
  explanation: string;
  analogies?: string[];
  examples?: string[];
  check_ins?: MCQ[];
};

type Lesson = {
  id?: string;
  document_id?: string;
  course_id?: string | null;
  chapter?: string | null;
  topic?: string;
  summary?: string;
  explanation?: string;
  concepts?: Concept[];
  created_at?: string;
};

type AnswerRecord = {
  selected: string;
  correct: boolean;
};

type StoredProgress = {
  conceptIndex: number;
  mcqIndex: number;
  conceptProgress: Array<[number, 'completed' | 'skipped' | 'wrong']>;
  answerHistory: Record<string, AnswerRecord>;
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
  const rawConcepts = typeof rawLesson.concepts === 'string'
    ? JSON.parse(rawLesson.concepts)
    : (rawLesson.concepts || []);

  const concepts = Array.isArray(rawConcepts)
    ? rawConcepts.map((concept: any) => {
        const examples = Array.isArray(concept?.examples)
          ? concept.examples
          : typeof concept?.examples === 'string'
          ? [concept.examples]
          : [];

        const checkIns = Array.isArray(concept?.check_ins) ? concept.check_ins : [];

        return {
          ...concept,
          examples,
          check_ins: checkIns
        };
      })
    : [];

  return {
    ...rawLesson,
    course_id: rawLesson.course_id ?? null,
    document_id: rawLesson.document_id ?? rawLesson.documentId ?? null,
    chapter: rawLesson.chapter ?? null,
    concepts
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answerHistory, setAnswerHistory] = useState<Record<string, AnswerRecord>>({});
  const [storedProgress, setStoredProgress] = useState<StoredProgress | null>(null);
  const storageKeyRef = useRef<string | null>(null);
  const activeConceptRef = useRef<HTMLDivElement | null>(null);

  // Prevent duplicate API calls in StrictMode
  const hasGeneratedRef = useState({ current: false })[0];

  function makeQuestionKey(conceptIndex: number, mcqIndex: number) {
    return `${conceptIndex}-${mcqIndex}`;
  }

  function getLessonStorageKey(lessonData: Lesson | null) {
    if (!lessonData) {
      return null;
    }

    const baseId = lessonData.id || lessonData.document_id || documentId;
    if (!baseId) {
      return null;
    }

    return `lesson-progress:${baseId}`;
  }

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

  useEffect(() => {
    if (!lesson) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const storageKey = getLessonStorageKey(lesson);
    storageKeyRef.current = storageKey;

    if (!storageKey) {
      setStoredProgress(null);
      setConceptProgress(new Map());
      setAnswerHistory({});
      setCurrentConceptIndex(0);
      setCurrentMCQIndex(0);
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);

      if (raw) {
        const parsed = JSON.parse(raw) as StoredProgress;
        setStoredProgress(parsed);
        setConceptProgress(new Map(parsed.conceptProgress || []));
        setAnswerHistory(parsed.answerHistory || {});
        setCurrentConceptIndex(parsed.conceptIndex ?? 0);
        setCurrentMCQIndex(parsed.mcqIndex ?? 0);
      } else {
        setStoredProgress(null);
        setConceptProgress(new Map());
        setAnswerHistory({});
        setCurrentConceptIndex(0);
        setCurrentMCQIndex(0);
      }
    } catch (error) {
      console.error('Failed to restore lesson progress:', error);
      setStoredProgress(null);
      setConceptProgress(new Map());
      setAnswerHistory({});
      setCurrentConceptIndex(0);
      setCurrentMCQIndex(0);
    }
  }, [lesson]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!lesson) {
      return;
    }

    const storageKey = storageKeyRef.current;

    if (!storageKey) {
      return;
    }

    const payload: StoredProgress = {
      conceptIndex: currentConceptIndex,
      mcqIndex: currentMCQIndex,
      conceptProgress: Array.from(conceptProgress.entries()),
      answerHistory
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      setStoredProgress(payload);
    } catch (error) {
      console.error('Failed to persist lesson progress:', error);
    }
  }, [lesson, currentConceptIndex, currentMCQIndex, conceptProgress, answerHistory]);

  useEffect(() => {
    if (showingSummary) {
      setSelectedOption(null);
      setShowingExplanations(false);
      return;
    }

    const key = makeQuestionKey(currentConceptIndex, currentMCQIndex);
    const record = answerHistory[key];

    if (record) {
      setSelectedOption(record.selected);
      setShowingExplanations(true);
    } else {
      setSelectedOption(null);
      setShowingExplanations(false);
    }
  }, [showingSummary, currentConceptIndex, currentMCQIndex, answerHistory]);

  useEffect(() => {
    if (showingSummary) {
      return;
    }

    if (!activeConceptRef.current) {
      return;
    }

    activeConceptRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showingSummary, currentConceptIndex]);

  async function startStudySession(): Promise<string | null> {
    if (sessionId) {
      return sessionId;
    }

    if (!lesson) {
      return null;
    }

    const payload: Record<string, unknown> = {
      session_type: 'lesson'
    };

    const lessonChapter = lesson.chapter || chapter || null;
    if (lessonChapter) {
      payload.chapter = lessonChapter;
    }

    const lessonDocumentId = lesson.document_id || documentId;
    if (lessonDocumentId) {
      payload.document_id = lessonDocumentId;
    }

    if (lesson.course_id) {
      payload.course_id = lesson.course_id;
    }

    try {
      const response = await fetch('/api/study-sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || 'Failed to start study session');
      }

      const data = await response.json();
      setSessionId(data.session_id);
      return data.session_id as string;
    } catch (error) {
      console.error('Failed to start study session:', error);
      return null;
    }
  }

  async function completeStudySession() {
    if (!sessionId) {
      return;
    }

    try {
      const response = await fetch(`/api/study-sessions/${sessionId}/complete`, {
        method: 'POST'
      });

      if (!response.ok && response.status !== 409 && response.status !== 404) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || 'Failed to complete study session');
      }
    } catch (error) {
      console.error('Failed to complete study session:', error);
    } finally {
      setSessionId(null);
    }
  }

  async function recordCheckIn({
    wasCorrect,
    selectedOption,
    correctOption,
    concept,
    question
  }: {
    wasCorrect: boolean;
    selectedOption: MCQOption;
    correctOption?: MCQOption;
    concept: Concept;
    question: MCQ;
  }) {
    if (!lesson) {
      return;
    }

    const activeSessionId = await startStudySession();

    const expectedAnswer = question.expected_answer || correctOption?.text || selectedOption.text;

    try {
      await fetch('/api/check-ins/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_id: concept.id,
          concept_name: concept.name,
          course_id: lesson.course_id ?? undefined,
          chapter: lesson.chapter || chapter || undefined,
          document_id: lesson.document_id || documentId || undefined,
          question: question.question,
          user_answer: selectedOption.text,
          expected_answer: expectedAnswer,
          context: concept.explanation,
          evaluation_mode: 'mcq',
          mcq: {
            selected_letter: selectedOption.letter,
            correct_letter: correctOption?.letter ?? '',
            selected_text: selectedOption.text,
            correct_text: correctOption?.text ?? expectedAnswer,
            selected_explanation: selectedOption.explanation,
            correct_explanation: correctOption?.explanation ?? selectedOption.explanation
          }
        })
      });
    } catch (error) {
      console.error('Failed to record concept mastery:', error);
    }

    if (activeSessionId) {
      try {
        await fetch(`/api/study-sessions/${activeSessionId}/track-checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            correct: wasCorrect,
            concept_id: concept.id ?? undefined
          })
        });
      } catch (error) {
        console.error('Failed to track study session check-in:', error);
      }
    }
  }

  async function handleStartLearning() {
    if (!lesson) {
      return;
    }

    void startStudySession();

    if (storedProgress) {
      setConceptProgress(new Map(storedProgress.conceptProgress || []));
      setAnswerHistory(storedProgress.answerHistory || {});
      setCurrentConceptIndex(storedProgress.conceptIndex ?? 0);
      setCurrentMCQIndex(storedProgress.mcqIndex ?? 0);
    } else {
      setConceptProgress(new Map());
      setAnswerHistory({});
      setCurrentConceptIndex(0);
      setCurrentMCQIndex(0);
    }

    setShowingSummary(false);
  }

  function handleSelectOption(letter: string) {
    if (!lesson) {
      return;
    }

    if (showingExplanations) {
      return;
    }

    const currentConcept = lesson.concepts[currentConceptIndex];
    const mcqs = currentConcept?.check_ins || [];
    const question = mcqs[currentMCQIndex];

    if (!question) {
      return;
    }

    const selectedOptionData = question.options.find((option) => option.letter === letter);

    if (!selectedOptionData) {
      return;
    }

    const correctOption = question.options.find((option) => option.correct);
    const wasCorrect = Boolean(correctOption && correctOption.letter === letter);
    const key = makeQuestionKey(currentConceptIndex, currentMCQIndex);

    if (answerHistory[key]) {
      setSelectedOption(letter);
      setShowingExplanations(true);
      return;
    }

    setSelectedOption(letter);
    setShowingExplanations(true);
    setAnswerHistory((prev) => ({
      ...prev,
      [key]: {
        selected: letter,
        correct: wasCorrect
      }
    }));

    if (!wasCorrect) {
      setConceptProgress((prev) => {
        const updated = new Map(prev);
        updated.set(currentConceptIndex, 'wrong');
        return updated;
      });
    }

    void recordCheckIn({
      wasCorrect,
      selectedOption: selectedOptionData,
      correctOption,
      concept: currentConcept,
      question
    });
  }

  async function handleNextMCQ() {
    if (!lesson?.concepts) {
      return;
    }

    const currentConcept = lesson.concepts[currentConceptIndex];
    const mcqs = currentConcept?.check_ins || [];
    const key = makeQuestionKey(currentConceptIndex, currentMCQIndex);
    const answered = answerHistory[key];

    if (!answered) {
      return;
    }

    if (currentMCQIndex < mcqs.length - 1) {
      setCurrentMCQIndex((prev) => prev + 1);
      return;
    }

    setConceptProgress((prev) => {
      const updated = new Map(prev);

      if (!answered.correct) {
        updated.set(currentConceptIndex, 'wrong');
      } else if (!updated.has(currentConceptIndex) || updated.get(currentConceptIndex) !== 'wrong') {
        updated.set(currentConceptIndex, 'completed');
      }

      return updated;
    });

    if (currentConceptIndex < lesson.concepts.length - 1) {
      setCurrentConceptIndex((prev) => prev + 1);
      setCurrentMCQIndex(0);
    } else {
      if (storageKeyRef.current && typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(storageKeyRef.current);
        } catch (error) {
          console.error('Failed to clear lesson progress cache:', error);
        }
      }

      await completeStudySession();
      router.push('/courses');
    }
  }

  function handleSkipConcept() {
    if (!lesson?.concepts) {
      return;
    }

    setConceptProgress((prev) => {
      const updated = new Map(prev);
      updated.set(currentConceptIndex, 'skipped');
      return updated;
    });

    setAnswerHistory((prev) => {
      const updated = { ...prev };
      const prefix = `${currentConceptIndex}-`;
      Object.keys(updated).forEach((key) => {
        if (key.startsWith(prefix)) {
          delete updated[key];
        }
      });
      return updated;
    });

    if (currentConceptIndex < lesson.concepts.length - 1) {
      setCurrentConceptIndex((prev) => prev + 1);
      setCurrentMCQIndex(0);
    } else {
      if (storageKeyRef.current && typeof window !== 'undefined') {
        window.localStorage.removeItem(storageKeyRef.current);
      }
      void completeStudySession();
      router.push('/courses');
    }
  }

  function handlePreviousMCQ() {
    if (!lesson?.concepts) {
      return;
    }

    if (currentMCQIndex > 0) {
      setCurrentMCQIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (currentConceptIndex > 0) {
      const previousConcept = lesson.concepts[currentConceptIndex - 1];
      const previousTotal = previousConcept?.check_ins?.length || 0;
      setCurrentConceptIndex((prev) => prev - 1);
      setCurrentMCQIndex(previousTotal > 0 ? previousTotal - 1 : 0);
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

  const hasResumeProgress = Boolean(
    storedProgress &&
      (storedProgress.conceptIndex > 0 ||
        storedProgress.mcqIndex > 0 ||
        (storedProgress.conceptProgress?.length ?? 0) > 0)
  );

  const resumeConceptNumber = storedProgress ? Math.min(storedProgress.conceptIndex + 1, totalConcepts) : 1;
  const resumeQuestionNumber = storedProgress ? storedProgress.mcqIndex + 1 : 1;

  const startButtonLabel = hasResumeProgress
    ? `Resume Learning (Concept ${resumeConceptNumber})`
    : `Start Learning (${totalConcepts} concepts)`;

  // Check if this is a new MCQ-based lesson or old format
  const hasNewFormat = currentMCQ?.options && Array.isArray(currentMCQ.options);

  // Debug logging
  console.log('[learn] Current concept:', currentConcept);
  console.log('[learn] Current MCQ:', currentMCQ);
  console.log('[learn] Has new format:', hasNewFormat);

  // If old format lesson, show a message to regenerate
  if (!hasNewFormat && !showingSummary) {
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

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-amber-900">
                Lesson Format Update Available
              </h2>
              <p className="mt-2 text-amber-800">
                This lesson was generated with an older format. To experience the new interactive,
                concept-by-concept learning with multiple-choice questions and instant feedback,
                you'll need to regenerate it.
              </p>
              <p className="mt-2 text-amber-800">
                The new format features:
              </p>
              <ul className="mt-2 ml-6 list-disc text-amber-800">
                <li>Bite-sized explanations (no walls of text)</li>
                <li>Interactive MCQs with instant feedback</li>
                <li>Detailed explanations for each answer option</li>
                <li>Progress tracking across concepts</li>
              </ul>
              <p className="mt-4 text-sm text-amber-700">
                Note: This will delete the cached lesson and generate a new one (takes ~10 seconds).
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/courses')}
              className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50"
            >
              Go Back
            </button>
            <button
              onClick={async () => {
                if (!confirm('Regenerate this lesson with the new format?')) return;

                // Delete the cached lesson first
                try {
                  const deleteRes = await fetch(`/api/lessons/${lesson.id}`, {
                    method: 'DELETE'
                  });

                  if (!deleteRes.ok) {
                    alert('Failed to delete cached lesson. Please try again.');
                    return;
                  }

                  // Reload the page to regenerate
                  window.location.reload();
                } catch (error) {
                  console.error('Failed to delete lesson:', error);
                  alert('Failed to delete cached lesson. Please try again.');
                }
              }}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Regenerate Lesson
            </button>
          </div>
        </div>
      </div>
    );
  }

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

          {hasResumeProgress && (
            <div className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">
              Resume from concept {resumeConceptNumber}, question {resumeQuestionNumber}.
            </div>
          )}

          <button
            onClick={() => {
              void handleStartLearning();
            }}
            className="w-full rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700"
          >
            {startButtonLabel}
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
      <div ref={activeConceptRef} className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm space-y-4">
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

        {currentConcept.examples && currentConcept.examples.length > 0 && (
          <div className="rounded-lg bg-indigo-50 p-4 space-y-2">
            <div className="text-sm font-semibold uppercase tracking-wide text-indigo-900">Examples</div>
            <ul className="space-y-2 list-disc pl-5 text-indigo-800 text-sm leading-relaxed">
              {currentConcept.examples.map((example, index) => (
                <li key={index}>{example}</li>
              ))}
            </ul>
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePreviousMCQ}
                disabled={currentConceptIndex === 0 && currentMCQIndex === 0}
                className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous question
              </button>
              <button
                onClick={handleSkipConcept}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Skip concept
              </button>
            </div>
            <button
              onClick={() => {
                void handleNextMCQ();
              }}
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
