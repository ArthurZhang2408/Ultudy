'use client';

import { FormEvent, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { apiFetch } from '../../lib/api';

type LessonSource = {
  document_id: string;
  chunk_id?: string;
  score?: number;
  page_start?: number;
  page_end?: number;
};

type LessonCheckin =
  | string
  | {
      question: string;
      answer?: string;
    };

type LessonResponse = {
  topic: string;
  summary: string;
  analogies: string[];
  example?: {
    setup: string;
    workedSteps: string;
  };
  checkins: LessonCheckin[];
  sources: LessonSource[];
};

type McqSource =
  | string
  | {
      document_id: string;
      page_start?: number;
      page_end?: number;
    };

type McqItem = {
  question: string;
  choices: string[];
  correctIndex: number;
  rationale: string;
  source?: McqSource;
};

type McqResponse = {
  topic: string;
  difficulty: string;
  items: McqItem[];
};

export default function StudyPage() {
  const { getToken } = useAuth();
  const [lessonParams, setLessonParams] = useState({ query: '', k: '6' });
  const [lesson, setLesson] = useState<LessonResponse | null>(null);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [isLessonLoading, setLessonLoading] = useState(false);

  const [mcqParams, setMcqParams] = useState({ topic: '', n: '5', difficulty: 'med' });
  const [mcq, setMcq] = useState<McqResponse | null>(null);
  const [mcqError, setMcqError] = useState<string | null>(null);
  const [isMcqLoading, setMcqLoading] = useState(false);

  const submitLesson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!lessonParams.query.trim()) {
      setLessonError('Enter a topic or guiding question.');
      setLesson(null);
      return;
    }

    setLessonLoading(true);
    setLessonError(null);

    try {
      const token = await getToken();
      const payload = await apiFetch<LessonResponse>(
        '/study/lesson',
        {
          method: 'POST',
          body: JSON.stringify({
            query: lessonParams.query.trim(),
            k: Number.parseInt(lessonParams.k, 10) || undefined
          })
        },
        token
      );
      setLesson(payload);
    } catch (error) {
      setLessonError(error instanceof Error ? error.message : 'Lesson generation failed');
      setLesson(null);
    } finally {
      setLessonLoading(false);
    }
  };

  const submitMcq = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mcqParams.topic.trim()) {
      setMcqError('Provide a topic for the quiz.');
      setMcq(null);
      return;
    }

    setMcqLoading(true);
    setMcqError(null);

    try {
      const token = await getToken();
      const payload = await apiFetch<McqResponse>(
        '/practice/mcq',
        {
          method: 'POST',
          body: JSON.stringify({
            topic: mcqParams.topic.trim(),
            n: Number.parseInt(mcqParams.n, 10) || undefined,
            difficulty: mcqParams.difficulty
          })
        },
        token
      );
      setMcq(payload);
    } catch (error) {
      setMcqError(error instanceof Error ? error.message : 'MCQ generation failed');
      setMcq(null);
    } finally {
      setMcqLoading(false);
    }
  };

  return (
    <section className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Study with your documents</h1>
        <p className="text-slate-600">Create lessons and multiple-choice practice from your uploads.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold text-slate-900">Lesson Builder</h2>
            <p className="text-sm text-slate-600">Summaries and explanations generated from your top chunks.</p>
          </header>
          <form className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" onSubmit={submitLesson}>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="lesson-query">
              Topic or question
              <input
                id="lesson-query"
                name="lesson-query"
                value={lessonParams.query}
                onChange={(event) => setLessonParams((current) => ({ ...current, query: event.target.value }))}
                placeholder="How do solar panels generate electricity?"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="lesson-k">
              Source chunks (k)
              <input
                id="lesson-k"
                name="lesson-k"
                type="number"
                min={1}
                max={12}
                value={lessonParams.k}
                onChange={(event) => setLessonParams((current) => ({ ...current, k: event.target.value }))}
              />
            </label>
            <button type="submit" disabled={isLessonLoading}>
              {isLessonLoading ? 'Creating lesson…' : 'Create lesson'}
            </button>
          </form>
          {lessonError ? (
            <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{lessonError}</p>
          ) : null}
          {lesson ? (
            <article className="space-y-4 rounded border border-slate-200 bg-white p-6 shadow-sm">
              <header>
                <h3 className="text-lg font-semibold text-slate-900">{lesson.topic}</h3>
                <p className="text-sm text-slate-600">{lesson.summary}</p>
              </header>
              {lesson.analogies?.length ? (
                <div>
                  <h4 className="font-semibold text-slate-800">Analogies</h4>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {lesson.analogies.map((analogy, index) => (
                      <li key={`${analogy}-${index}`}>{analogy}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {lesson.example ? (
                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-800">Example</h4>
                  <p className="text-sm text-slate-700">{lesson.example.setup}</p>
                  <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{lesson.example.workedSteps}</pre>
                </div>
              ) : null}
              {lesson.checkins?.length ? (
                <div>
                  <h4 className="font-semibold text-slate-800">Check-ins</h4>
                  <ul className="mt-2 space-y-2 pl-5 text-sm text-slate-700">
                    {lesson.checkins.map((checkin, index) => {
                      if (typeof checkin === 'string') {
                        return (
                          <li key={`${checkin}-${index}`} className="list-disc">
                            {checkin}
                          </li>
                        );
                      }

                      return (
                        <li key={`${checkin.question}-${index}`} className="list-disc space-y-1">
                          <p className="font-medium text-slate-800">{checkin.question}</p>
                          {checkin.answer ? (
                            <p className="text-slate-600">{checkin.answer}</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {lesson.sources?.length ? (
                <div>
                  <h4 className="font-semibold text-slate-800">Sources</h4>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {lesson.sources.map((source, index) => {
                      const parts = [source.document_id];

                      if (source.chunk_id) {
                        parts.push(`chunk ${source.chunk_id}`);
                      }

                      if (typeof source.page_start === 'number' || typeof source.page_end === 'number') {
                        const start = typeof source.page_start === 'number' ? source.page_start : '?';
                        const end = typeof source.page_end === 'number' ? source.page_end : start;
                        parts.push(`pages ${start}-${end}`);
                      }

                      if (typeof source.score === 'number') {
                        parts.push(`score ${source.score.toFixed(3)}`);
                      }

                      return (
                        <li key={source.chunk_id ?? `${source.document_id}-${index}`} className="font-mono">
                          {parts.join(' · ')}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>

        <div className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold text-slate-900">MCQ Practice</h2>
            <p className="text-sm text-slate-600">Generate multiple-choice questions tailored to your topic.</p>
          </header>
          <form className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" onSubmit={submitMcq}>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="mcq-topic">
              Topic
              <input
                id="mcq-topic"
                name="mcq-topic"
                value={mcqParams.topic}
                onChange={(event) => setMcqParams((current) => ({ ...current, topic: event.target.value }))}
                placeholder="Photosynthesis review"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="mcq-count">
              Number of questions
              <input
                id="mcq-count"
                name="mcq-count"
                type="number"
                min={1}
                max={20}
                value={mcqParams.n}
                onChange={(event) => setMcqParams((current) => ({ ...current, n: event.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700" htmlFor="mcq-difficulty">
              Difficulty
              <select
                id="mcq-difficulty"
                name="mcq-difficulty"
                value={mcqParams.difficulty}
                onChange={(event) => setMcqParams((current) => ({ ...current, difficulty: event.target.value }))}
              >
                <option value="easy">Easy</option>
                <option value="med">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <button type="submit" disabled={isMcqLoading}>
              {isMcqLoading ? 'Creating questions…' : 'Create questions'}
            </button>
          </form>
          {mcqError ? (
            <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{mcqError}</p>
          ) : null}
          {mcq ? (
            <article className="space-y-4 rounded border border-slate-200 bg-white p-6 shadow-sm">
              <header>
                <h3 className="text-lg font-semibold text-slate-900">{mcq.topic}</h3>
                <p className="text-sm text-slate-600">Difficulty: {mcq.difficulty}</p>
              </header>
              <ol className="list-decimal space-y-4 pl-5">
                {mcq.items.map((item, index) => (
                  <li key={`${item.question}-${index}`} className="space-y-2">
                    <h4 className="font-medium text-slate-800">{item.question}</h4>
                    <ul className="list-disc space-y-1 pl-6 text-sm text-slate-700">
                      {item.choices.map((choice, choiceIndex) => (
                        <li key={`${choice}-${choiceIndex}`}>{choice}</li>
                      ))}
                    </ul>
                    <p className="text-sm text-green-700">
                      Correct answer: choice {item.correctIndex + 1}
                    </p>
                    <p className="text-sm text-slate-600">{item.rationale}</p>
                    {item.source ? (
                      <p className="text-xs text-slate-500">
                        Source:{' '}
                        {typeof item.source === 'string'
                          ? item.source
                          : `${item.source.document_id} (pages ${
                              typeof item.source.page_start === 'number' ? item.source.page_start : '?'
                            }-${
                              typeof item.source.page_end === 'number' ? item.source.page_end :
                              typeof item.source.page_start === 'number' ? item.source.page_start : '?'
                            })`}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
