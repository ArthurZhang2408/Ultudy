'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FormattedText } from '../../components/FormattedText';
import { createJobPoller, type Job } from '@/lib/jobs';

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

type Formula = {
  formula: string;
  variables: string;
};

type Concept = {
  id?: string;
  name: string;
  explanation: string;
  analogies?: string[];
  examples?: string[];
  formulas?: Formula[];
  important_notes?: string[];
  is_main_concept?: boolean;
  parent_concept?: string;
  check_ins?: MCQ[];
};

type Section = {
  id: string;
  section_number: number;
  name: string;
  description: string | null;
  page_start: number | null;
  page_end: number | null;
  concepts_generated: boolean;
  created_at: string;
  generating?: boolean; // Track if this section is being generated
  generation_progress?: number; // Track generation progress
  job_id?: string; // Track the generation job ID
};

type DocumentInfo = {
  id: string;
  title: string;
  material_type: string | null;
  chapter: string | null;
  pages: number;
  uploaded_at: string;
  course_id: string | null;
};

type Lesson = {
  id?: string;
  document_id?: string;
  course_id?: string | null;
  chapter?: string | null;
  section_id?: string | null;
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
  const urlSectionId = searchParams.get('section_id');
  const targetConceptName = searchParams.get('concept_name') || null;

  const clearConceptNavigation = () => {
    const conceptParam = searchParams.get('concept_name');
    if (!conceptParam) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('concept_name');
    const queryString = params.toString();
    router.replace(queryString ? `/learn?${queryString}` : '/learn', { scroll: false });
  };

  // Document and section-related state
  const [documentInfo, setDocumentInfo] = useState<DocumentInfo | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [generatingSections, setGeneratingSections] = useState(false);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [generatingLesson, setGeneratingLesson] = useState(false);

  // Error state
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  // Lesson and learning state
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [showingSummary, setShowingSummary] = useState(true);
  const [showingSections, setShowingSections] = useState(true);
  const [currentConceptIndex, setCurrentConceptIndex] = useState(0);
  const [currentMCQIndex, setCurrentMCQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showingExplanations, setShowingExplanations] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
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

    // Use document_id, chapter, and section_id to ensure each section has separate progress
    const docId = lessonData.document_id || documentId;
    const chapterVal = lessonData.chapter || chapter;
    const sectionId = lessonData.section_id || selectedSection?.id;

    if (!docId) {
      return null;
    }

    // Include section_id in key to separate progress by section
    if (sectionId) {
      return chapterVal
        ? `lesson-progress:${docId}:${chapterVal}:${sectionId}`
        : `lesson-progress:${docId}:${sectionId}`;
    }

    // Fallback to chapter-level key if no section_id
    return chapterVal
      ? `lesson-progress:${docId}:${chapterVal}`
      : `lesson-progress:${docId}`;
  }

  // Load document info and sections on mount
  useEffect(() => {
    if (documentId && !hasGeneratedRef.current) {
      hasGeneratedRef.current = true;
      loadDocumentAndSections();
    }
  }, [documentId]);

  // Auto-load lesson when section_id is in URL (from grid click)
  useEffect(() => {
    if (!urlSectionId || !documentId || sections.length === 0 || lesson) {
      return;
    }

    // Find the section matching the URL parameter
    const targetSection = sections.find(s => s.id === urlSectionId);
    if (targetSection) {
      console.log(`[learn] Auto-loading section from URL: ${targetSection.name}`);
      loadOrGenerateLesson(targetSection);
    }
  }, [urlSectionId, documentId, sections]);

  async function loadDocumentAndSections() {
    setLoading(true);
    try {
      // First, fetch document info
      const docRes = await fetch(`/api/documents/${documentId}`);
      if (docRes.ok) {
        const docData = await docRes.json();
        setDocumentInfo(docData);
      }

      // Then load or generate sections
      await loadOrGenerateSections();
    } catch (error) {
      console.error('Failed to load document:', error);
      setLoading(false);
    }
  }

  // New multi-layer flow: Load or generate sections first
  async function loadOrGenerateSections() {
    setLoadingSections(true);
    try {
      // Try to load existing sections
      const res = await fetch(`/api/sections?document_id=${documentId}`);

      if (res.ok) {
        const data = await res.json();
        if (data.sections && data.sections.length > 0) {
          setSections(data.sections);
          setLoadingSections(false);
          setLoading(false);
          // Don't change view state here - let document summary screen control it
          return;
        }
      }

      // No sections found, need to generate them (will happen when user clicks "Start Learning")
      setLoadingSections(false);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load sections:', error);
      setLoadingSections(false);
      setLoading(false);
    }
  }

  async function generateSections() {
    setGeneratingSections(true);
    setError(null);
    try {
      const res = await fetch('/api/sections/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          chapter: chapter || undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSections(data.sections || []);
        setShowingSections(true);
      } else {
        const errorData = await res.json();
        setError({
          message: `Failed to generate sections: ${errorData.error || 'Unknown error'}`,
          retry: generateSections
        });
      }
    } catch (err) {
      console.error('Failed to generate sections:', err);
      setError({
        message: 'Failed to generate sections. Please check your connection and try again.',
        retry: generateSections
      });
    } finally {
      setGeneratingSections(false);
      setLoadingSections(false);
    }
  }

  // Fetch an existing lesson by ID
  async function fetchLesson(lessonId: string) {
    setGeneratingLesson(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}`);
      if (res.ok) {
        const rawData = await res.json();
        console.log('[learn] Fetched lesson:', rawData);
        const normalizedLesson = normalizeLesson(rawData);
        setLesson(normalizedLesson);

        // Navigate appropriately
        if (targetConceptName) {
          const concepts = normalizedLesson.concepts || [];
          const targetIndex = concepts.findIndex(c =>
            c.name.toLowerCase() === targetConceptName.toLowerCase()
          );

          if (targetIndex >= 0) {
            console.log(`[learn] Auto-navigating to concept "${targetConceptName}" at index ${targetIndex}`);
            setCurrentConceptIndex(targetIndex);
            setCurrentMCQIndex(0);
            setShowingSections(false);
            setShowingSummary(false);
            clearConceptNavigation();
          } else {
            clearConceptNavigation();
            setShowingSections(false);
            setShowingSummary(true);
          }
        } else {
          clearConceptNavigation();
          setShowingSections(false);
          setShowingSummary(true);
        }
      } else {
        throw new Error('Failed to fetch lesson');
      }
    } catch (error) {
      console.error('[learn] Error fetching lesson:', error);
      setError({
        message: 'Failed to load lesson. Please try again.',
        retry: () => fetchLesson(lessonId)
      });
    } finally {
      setGeneratingLesson(false);
    }
  }

  // Load existing lesson or generate if not found (for grid navigation)
  async function loadOrGenerateLesson(section: Section) {
    console.log('[learn] loadOrGenerateLesson called with targetConceptName:', targetConceptName);
    setSelectedSection(section);
    setError(null);
    setGeneratingLesson(true); // Show generating UI immediately

    try {
      // Call generate endpoint - it will return job_id if needs generation, or lesson_id if already exists
      console.log(`[learn] Loading/generating lesson for section ${section.id}...`);
      const res = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          section_id: section.id,
          chapter: chapter || undefined,
          include_check_ins: true
        })
      });

      if (res.ok) {
        const data = await res.json();
        console.log('[learn] Received response:', data);

        // Check if it's a job (async generation) or existing lesson
        if (data.job_id) {
          // Lesson is being generated - mark section as generating
          console.log(`[learn] Lesson generation queued: job_id=${data.job_id}`);

          // Update section state to show it's generating
          setSections(prev => prev.map(s =>
            s.id === section.id
              ? { ...s, generating: true, generation_progress: 0, job_id: data.job_id }
              : s
          ));

          // Keep generatingLesson true while polling
          // Start polling for job completion
          createJobPoller(data.job_id, {
            interval: 2000,
            onProgress: (job: Job) => {
              console.log('[learn] Generation progress:', job.progress);
              // Update progress
              setSections(prev => prev.map(s =>
                s.id === section.id
                  ? { ...s, generation_progress: job.progress }
                  : s
              ));
            },
            onComplete: async (job: Job) => {
              console.log('[learn] Generation completed:', job);
              // Mark section as no longer generating
              setSections(prev => prev.map(s =>
                s.id === section.id
                  ? { ...s, generating: false, concepts_generated: true }
                  : s
              ));

              // Fetch the generated lesson
              if (job.result?.lesson_id) {
                await fetchLesson(job.result.lesson_id);
              }

              // fetchLesson will set generatingLesson to false
            },
            onError: (error: string) => {
              console.error('[learn] Generation error:', error);
              // Mark section as failed
              setSections(prev => prev.map(s =>
                s.id === section.id
                  ? { ...s, generating: false }
                  : s
              ));
              setGeneratingLesson(false);
              setError({
                message: `Failed to generate lesson: ${error}`,
                retry: () => loadOrGenerateLesson(section)
              });
            }
          });

          // Don't block the UI - user can click other sections
          return;
        } else if (data.lesson_id) {
          // Lesson already exists - fetch it
          console.log(`[learn] Lesson already exists: lesson_id=${data.lesson_id}`);
          await fetchLesson(data.lesson_id);
        } else {
          // Old format: lesson data returned directly (shouldn't happen with new API)
          const normalizedLesson = normalizeLesson(data);
          console.log('[learn] Normalized lesson:', normalizedLesson);
          setLesson(normalizedLesson);
          setGeneratingLesson(false); // Turn off generating state

          // Update section to mark concepts as generated
          setSections(prev => prev.map(s =>
            s.id === section.id ? { ...s, concepts_generated: true } : s
          ));

        // Check if we should navigate directly to a specific concept by name
        console.log('[learn] Navigation check - targetConceptName:', targetConceptName);
        console.log('[learn] Navigation check - concepts count:', normalizedLesson.concepts?.length);
        if (targetConceptName) {
          const concepts = normalizedLesson.concepts || [];
          // Search for concept by name (case-insensitive)
          const targetIndex = concepts.findIndex(c =>
            c.name.toLowerCase() === targetConceptName.toLowerCase()
          );

          console.log('[learn] Available concept names:', concepts.map(c => c.name));
          console.log('[learn] Searching for:', targetConceptName);
          console.log('[learn] Found concept at index:', targetIndex);

          if (targetIndex >= 0) {
            console.log(`[learn] Auto-navigating to concept "${targetConceptName}" at index ${targetIndex}`);
            setCurrentConceptIndex(targetIndex);
            setCurrentMCQIndex(0);
            setShowingSections(false);
            setShowingSummary(false);
            clearConceptNavigation();
          } else {
            // Concept not found, show summary
            console.warn(`[learn] Concept "${targetConceptName}" not found in lesson, showing summary`);
            clearConceptNavigation();
            setShowingSections(false);
            setShowingSummary(true);
          }
        } else {
          // No target concept, show summary screen
          clearConceptNavigation();
          setShowingSections(false);
          setShowingSummary(true);
        }
      }
    } else {
      setGeneratingLesson(false); // Turn off generating state on error
      const errorData = await res.json().catch(() => ({ error: 'Failed to load lesson' }));
      const errorMessage = errorData.details
        ? `${errorData.error}\n\n${errorData.details}`
        : errorData.error || 'Failed to load lesson';
      setError({
        message: errorMessage,
        retry: () => loadOrGenerateLesson(section)
      });
    }
  } catch (error) {
    console.error('[learn] Error loading/generating lesson:', error);
    setGeneratingLesson(false); // Turn off generating state on exception
    setError({
      message: 'Failed to load lesson. Please check your connection and try again.',
      retry: () => loadOrGenerateLesson(section)
    });
  }
}

  // Generate lesson for a specific section
  async function generateLessonForSection(section: Section) {
    setGeneratingLesson(true);
    setSelectedSection(section);
    setError(null);
    try {
      const res = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          section_id: section.id,
          chapter: chapter || undefined,
          include_check_ins: true
        })
      });

      if (res.ok) {
        const rawData = await res.json();
        console.log('[learn] Received lesson data:', rawData);

        // Check if it's a job (async generation) or existing lesson
        if (rawData.job_id) {
          // Lesson is being generated - mark section as generating
          console.log(`[learn] Lesson generation queued: job_id=${rawData.job_id}`);

          // Update section state to show it's generating
          setSections(prev => prev.map(s =>
            s.id === section.id
              ? { ...s, generating: true, generation_progress: 0, job_id: rawData.job_id }
              : s
          ));

          // Keep generatingLesson true while polling
          // Start polling for job completion
          createJobPoller(rawData.job_id, {
            interval: 2000,
            onProgress: (job: Job) => {
              console.log('[learn] Generation progress:', job.progress);
              // Update progress
              setSections(prev => prev.map(s =>
                s.id === section.id
                  ? { ...s, generation_progress: job.progress }
                  : s
              ));
            },
            onComplete: async (job: Job) => {
              console.log('[learn] Generation completed:', job);
              // Mark section as no longer generating
              setSections(prev => prev.map(s =>
                s.id === section.id
                  ? { ...s, generating: false, concepts_generated: true }
                  : s
              ));

              // Fetch the generated lesson
              if (job.result?.lesson_id) {
                await fetchLesson(job.result.lesson_id);
              }

              // fetchLesson will set generatingLesson to false
            },
            onError: (error: string) => {
              console.error('[learn] Generation error:', error);
              // Mark section as failed
              setSections(prev => prev.map(s =>
                s.id === section.id
                  ? { ...s, generating: false }
                  : s
              ));
              setGeneratingLesson(false);
              setError({
                message: `Failed to generate lesson: ${error}`,
                retry: () => generateLessonForSection(section)
              });
            }
          });

          // Don't turn off generating yet - polling will handle it
          return;
        } else if (rawData.lesson_id) {
          // Lesson already exists - fetch it
          console.log(`[learn] Lesson already exists: lesson_id=${rawData.lesson_id}`);
          await fetchLesson(rawData.lesson_id);
        } else {
          // Old format: lesson returned directly
          const normalizedLesson = normalizeLesson(rawData);
          console.log('[learn] Normalized lesson:', normalizedLesson);
          setLesson(normalizedLesson);
          setGeneratingLesson(false);

          // Update section to mark concepts as generated
          setSections(prev => prev.map(s =>
            s.id === section.id ? { ...s, concepts_generated: true } : s
          ));

        // Check if we should navigate directly to a specific concept by name
        console.log('[learn] Navigation check - targetConceptName:', targetConceptName);
        console.log('[learn] Navigation check - concepts count:', normalizedLesson.concepts?.length);
        if (targetConceptName) {
          const concepts = normalizedLesson.concepts || [];
          // Search for concept by name (case-insensitive)
          const targetIndex = concepts.findIndex(c =>
            c.name.toLowerCase() === targetConceptName.toLowerCase()
          );

          console.log('[learn] Available concept names:', concepts.map(c => c.name));
          console.log('[learn] Searching for:', targetConceptName);
          console.log('[learn] Found concept at index:', targetIndex);

          if (targetIndex >= 0) {
            console.log(`[learn] Auto-navigating to concept "${targetConceptName}" at index ${targetIndex}`);
            setCurrentConceptIndex(targetIndex);
            setCurrentMCQIndex(0);
            setShowingSections(false);
            setShowingSummary(false);
            clearConceptNavigation();
          } else {
            // Concept not found, show summary
            console.warn(`[learn] Concept "${targetConceptName}" not found in lesson, showing summary`);
            clearConceptNavigation();
            setShowingSections(false);
            setShowingSummary(true);
          }
        } else {
          // No target concept, show summary screen
          clearConceptNavigation();
          setShowingSections(false);
          setShowingSummary(true);
        }
        }
      } else {
        setGeneratingLesson(false);
        const errorData = await res.json().catch(() => ({ error: 'Failed to generate lesson' }));
        const errorMessage = errorData.details
          ? `${errorData.error}\n\n${errorData.details}`
          : errorData.error || 'Failed to generate lesson';
        setError({
          message: errorMessage,
          retry: () => generateLessonForSection(section)
        });
      }
    } catch (err) {
      console.error('Failed to generate lesson:', err);
      setGeneratingLesson(false);
      setError({
        message: 'Failed to generate lesson. Please check your connection and try again.',
        retry: () => generateLessonForSection(section)
      });
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

  // Handle direct navigation to a specific concept via URL (name-based)
  useEffect(() => {
    if (!lesson || !targetConceptName || showingSummary) {
      return;
    }

    const concepts = lesson.concepts || [];
    // Search for concept by name (case-insensitive)
    const targetIndex = concepts.findIndex(c =>
      c.name.toLowerCase() === targetConceptName.toLowerCase()
    );

    if (targetIndex >= 0 && targetIndex !== currentConceptIndex) {
      console.log(`[learn] useEffect navigating to concept "${targetConceptName}" at index ${targetIndex}`);
      setCurrentConceptIndex(targetIndex);
      setCurrentMCQIndex(0);
      setShowingSummary(false);
      setShowingSections(false);

      // Clear the concept navigation parameter after honoring it once
      // so subsequent manual navigation isn't overridden by this effect.
      clearConceptNavigation();
    }
  }, [lesson, targetConceptName, showingSummary, currentConceptIndex]);

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
    setHoveredOption(null);
  }, [showingSummary, currentConceptIndex, currentMCQIndex, answerHistory]);

  // Helper function to scroll to top of page
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    if (showingSummary) {
      return;
    }

    scrollToTop();
  }, [showingSummary, currentConceptIndex, currentMCQIndex]);

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
    clearConceptNavigation();

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

    const currentConcept = lesson.concepts?.[currentConceptIndex];
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

    if (currentConcept) {
      void recordCheckIn({
        wasCorrect,
        selectedOption: selectedOptionData,
        correctOption,
        concept: currentConcept,
        question
      });
    }
  }

  async function handleNextMCQ() {
    if (!lesson?.concepts) {
      return;
    }

    const currentConcept = lesson.concepts?.[currentConceptIndex];
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

      // Return to sections if available, otherwise go to courses
      if (sections.length > 0) {
        setShowingSummary(false);
        setShowingSections(true);
        setLesson(null);
        setSelectedSection(null);
      } else {
        router.push('/courses');
      }
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

      // Return to sections if available, otherwise go to courses
      if (sections.length > 0) {
        setShowingSummary(false);
        setShowingSections(true);
        setLesson(null);
        setSelectedSection(null);
      } else {
        router.push('/courses');
      }
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
      const previousConcept = lesson.concepts?.[currentConceptIndex - 1];
      const previousTotal = previousConcept?.check_ins?.length || 0;
      setCurrentConceptIndex((prev) => prev - 1);
      setCurrentMCQIndex(previousTotal > 0 ? previousTotal - 1 : 0);
    }
  }

  // Show loading state
  if (loading) {
    return <LearnPageFallback />;
  }

  // Show error screen if there's an error
  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <button
            onClick={() => {
              setError(null);
              router.push('/courses');
            }}
            className="text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100"
          >
            ← Back to courses
          </button>
        </div>

        <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-8 shadow-sm space-y-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-red-900 dark:text-red-300">
                Something went wrong
              </h2>
              <p className="mt-2 text-red-800 dark:text-red-400 whitespace-pre-wrap">
                {error.message}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setError(null);
                router.push('/courses');
              }}
              className="rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-medium text-red-900 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              Go Back
            </button>
            {error.retry && (
              <button
                onClick={() => {
                  setError(null);
                  error.retry?.();
                }}
                className="rounded-md bg-red-600 dark:bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:hover:bg-red-800"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show document summary screen (first screen after loading)
  // Show section selection screen
  if (showingSections && sections.length > 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <button
            onClick={() => {
              const courseId = documentInfo?.course_id;
              if (courseId) {
                router.push(`/courses/${courseId}`);
              } else {
                router.push('/courses');
              }
            }}
            className="text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100"
          >
            ← Back to course
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-8 shadow-sm space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-neutral-100">
              Select a Section to Study
            </h1>
            <p className="mt-2 text-slate-600 dark:text-neutral-300">
              This document has been divided into {sections.length} major sections.
              Click on a section to generate concepts and start learning.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => generateLessonForSection(section)}
                disabled={generatingLesson}
                className={`
                  relative rounded-lg border-2 p-6 text-left transition-all
                  ${section.concepts_generated
                    ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30'
                    : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}
                  ${generatingLesson ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="inline-block rounded-full bg-slate-200 dark:bg-neutral-700 px-3 py-1 text-sm font-semibold text-slate-700 dark:text-neutral-300">
                    Section {section.section_number}
                  </span>
                  {section.concepts_generated && (
                    <span className="text-green-600 dark:text-green-400 text-sm font-medium">✓ Ready</span>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100 mb-2">
                  {section.name}
                </h3>
                {section.description && (
                  <p className="text-sm text-slate-600 dark:text-neutral-300 mb-3">
                    {section.description}
                  </p>
                )}
                {section.page_start && section.page_end && (
                  <p className="text-xs text-slate-500 dark:text-neutral-400">
                    Pages {section.page_start}-{section.page_end}
                  </p>
                )}
                <div className="mt-4">
                  <span className={`
                    text-sm font-medium
                    ${section.concepts_generated ? 'text-green-700 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}
                  `}>
                    {section.concepts_generated ? 'View Concepts →' : 'Generate Concepts →'}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {generatingLesson && selectedSection && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-center">
              <p className="text-blue-900 dark:text-blue-300 font-medium">
                Generating concepts for "{selectedSection.name}"...
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                This usually takes 10-20 seconds
              </p>
            </div>
          )}

          {generatingSections && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-center">
              <p className="text-blue-900 dark:text-blue-300 font-medium">
                Analyzing document structure...
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                Extracting major sections from the document
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show generating UI if lesson is being generated
  if (generatingLesson && selectedSection) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <button
            onClick={() => router.push(`/courses/${documentInfo?.course_id || ''}`)}
            className="text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100"
          >
            ← Back to courses
          </button>
        </div>

        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 p-8 text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
            <h2 className="text-xl font-semibold text-blue-900 dark:text-blue-300">
              Generating lesson for "{selectedSection.name}"
            </h2>
          </div>
          <p className="text-blue-800 dark:text-blue-400">
            Creating concepts and practice questions... This usually takes 10-20 seconds.
          </p>
          {selectedSection.generation_progress !== undefined && selectedSection.generation_progress > 0 && (
            <div className="mt-4">
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div
                  className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${selectedSection.generation_progress}%` }}
                />
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-400 mt-2">
                {selectedSection.generation_progress}% complete
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!lesson || !lesson.concepts || lesson.concepts.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">Failed to load lesson</h2>
        <button
          onClick={() => router.push('/courses')}
          className="mt-4 text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100"
        >
          ← Back to courses
        </button>
      </div>
    );
  }

  const currentConcept = lesson.concepts?.[currentConceptIndex];
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
            className="text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100"
          >
            ← Back to courses
          </button>
        </div>

        <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-8 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-amber-900 dark:text-amber-300">
                Lesson Format Update Available
              </h2>
              <p className="mt-2 text-amber-800 dark:text-amber-400">
                This lesson was generated with an older format. To experience the new interactive,
                concept-by-concept learning with multiple-choice questions and instant feedback,
                you'll need to regenerate it.
              </p>
              <p className="mt-2 text-amber-800 dark:text-amber-400">
                The new format features:
              </p>
              <ul className="mt-2 ml-6 list-disc text-amber-800 dark:text-amber-400">
                <li>Bite-sized explanations (no walls of text)</li>
                <li>Interactive MCQs with instant feedback</li>
                <li>Detailed explanations for each answer option</li>
                <li>Progress tracking across concepts</li>
              </ul>
              <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
                Note: This will delete the cached lesson and generate a new one (takes ~10 seconds).
              </p>
              {regenerateError && (
                <div className="mt-4 rounded-md border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
                  {regenerateError}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/courses')}
              className="rounded-md border border-amber-300 dark:border-amber-700 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-medium text-amber-900 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
            >
              Go Back
            </button>
            <button
              onClick={async () => {
                if (!confirm('Regenerate this lesson with the new format?')) return;

                setRegenerateError(null);

                // Delete the cached lesson first
                try {
                  const deleteRes = await fetch(`/api/lessons/${lesson.id}`, {
                    method: 'DELETE'
                  });

                  if (!deleteRes.ok) {
                    const error = await deleteRes.json().catch(() => ({ error: 'Unknown error' }));
                    setRegenerateError(error.error || 'Failed to delete cached lesson. Please try again.');
                    return;
                  }

                  // Reload the page to regenerate
                  window.location.reload();
                } catch (error) {
                  console.error('Failed to delete lesson:', error);
                  setRegenerateError(error instanceof Error ? error.message : 'Network error. Please check your connection.');
                }
              }}
              className="rounded-md bg-amber-600 dark:bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 dark:hover:bg-amber-800"
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
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              if (sections.length > 0) {
                clearConceptNavigation();
                setShowingSummary(false);
                setShowingSections(true);
              } else {
                router.push('/courses');
              }
            }}
            className="text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100"
          >
            ← {sections.length > 0 ? 'Back to sections' : 'Back to courses'}
          </button>
          {chapter && (
            <span className="text-sm text-slate-600 dark:text-neutral-300">
              Chapter {chapter}
            </span>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-8 shadow-sm space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-neutral-100">
              {selectedSection
                ? `Section ${selectedSection.section_number}: ${selectedSection.name}`
                : (lesson.topic || 'Lesson')}
            </h1>
          </div>

          {lesson.summary && (
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <FormattedText className="text-slate-700 dark:text-neutral-300 text-lg leading-relaxed">
                {lesson.summary}
              </FormattedText>
            </div>
          )}

          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-6">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-3">In this lesson:</h3>
            <div className="space-y-2">
              {lesson.concepts.map((concept, idx) => (
                <div key={idx} className="flex items-start gap-2 text-blue-800 dark:text-blue-400">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">{idx + 1}.</span>
                  <span>{concept.name}</span>
                </div>
              ))}
            </div>
          </div>

          {hasResumeProgress && (
            <div className="rounded-md bg-slate-100 dark:bg-neutral-700 px-4 py-3 text-sm text-slate-700 dark:text-neutral-300">
              Resume from concept {resumeConceptNumber}, question {resumeQuestionNumber}.
            </div>
          )}

          <button
            onClick={() => {
              void handleStartLearning();
            }}
            className="w-full rounded-md bg-blue-600 dark:bg-blue-700 px-6 py-3 text-base font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-800"
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
          onClick={() => {
            clearConceptNavigation();
            setShowingSummary(true);
          }}
          className="text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100"
        >
          ← Back to summary
        </button>
        <span className="text-sm text-slate-600 dark:text-neutral-300">
          Concept {currentConceptIndex + 1} of {totalConcepts}
        </span>
      </div>

      {/* Concept Explanation */}
      <div ref={activeConceptRef} className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-8 shadow-sm space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-neutral-100">{currentConcept.name}</h2>

        <FormattedText className="text-slate-700 dark:text-neutral-300 text-base leading-relaxed">
          {currentConcept.explanation}
        </FormattedText>

        {currentConcept.analogies && currentConcept.analogies.length > 0 && (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 mt-4">
            <div className="flex items-start gap-2">
              <span className="text-green-700 dark:text-green-400 font-semibold">💡</span>
              <FormattedText className="text-green-800 dark:text-green-400 text-sm flex-1">
                {currentConcept.analogies[0]}
              </FormattedText>
            </div>
          </div>
        )}

        {currentConcept.examples && currentConcept.examples.length > 0 && (
          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 p-4 space-y-2">
            <div className="text-sm font-semibold uppercase tracking-wide text-indigo-900 dark:text-indigo-300">Examples</div>
            <div className="space-y-2 text-indigo-800 dark:text-indigo-400 text-sm leading-relaxed">
              {currentConcept.examples.map((example, index) => (
                <FormattedText key={index} className="pl-5">
                  {example}
                </FormattedText>
              ))}
            </div>
          </div>
        )}

        {currentConcept.formulas && currentConcept.formulas.length > 0 && (
          <div className="rounded-lg bg-purple-50 p-4 space-y-3">
            <div className="text-sm font-semibold uppercase tracking-wide text-purple-900">Formulas & Equations</div>
            {currentConcept.formulas.map((formulaObj, index) => (
              <div key={index} className="space-y-1">
                <div className="text-purple-900 bg-white p-3 rounded border border-purple-200">
                  <FormattedText>
                    {formulaObj.formula}
                  </FormattedText>
                </div>
                <FormattedText className="text-xs text-purple-700 pl-3">
                  {formulaObj.variables}
                </FormattedText>
              </div>
            ))}
          </div>
        )}

        {currentConcept.important_notes && currentConcept.important_notes.length > 0 && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
            <div className="text-sm font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-300">Important Notes</div>
            <div className="space-y-2 text-amber-800 dark:text-amber-400 text-sm leading-relaxed">
              {currentConcept.important_notes.map((note, index) => (
                <FormattedText key={index} className="pl-5">
                  {note}
                </FormattedText>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MCQ Section */}
      {currentMCQ && (
        <div className="rounded-lg border-2 border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-8 shadow-md space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Check Your Understanding</h3>
            <span className="text-sm text-slate-600 dark:text-neutral-300">
              Question {currentMCQIndex + 1} of {totalMCQsInConcept}
            </span>
          </div>

          <FormattedText className="text-base text-slate-900 dark:text-neutral-100">
            {currentMCQ.question}
          </FormattedText>

          <div className="space-y-3">
            {currentMCQ.options.map((option) => {
              const isSelected = selectedOption === option.letter;
              const isCorrect = option.correct;
              const isHovered = hoveredOption === option.letter;
              const showAsCorrect = showingExplanations && isCorrect;
              const showAsWrong = showingExplanations && isSelected && !isCorrect;
              const shouldShowExplanation = showingExplanations && (isSelected || isCorrect || isHovered);

              return (
                <div
                  key={option.letter}
                  className="space-y-2"
                  onMouseEnter={() => showingExplanations && setHoveredOption(option.letter)}
                  onMouseLeave={() => showingExplanations && setHoveredOption(null)}
                >
                  <button
                    onClick={() => !showingExplanations && handleSelectOption(option.letter)}
                    disabled={showingExplanations}
                    className={`w-full text-left rounded-lg border-2 p-4 transition-colors ${
                      showAsCorrect
                        ? 'border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/20'
                        : showAsWrong
                        ? 'border-red-500 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                        : isSelected
                        ? 'border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-slate-400 dark:hover:border-neutral-600'
                    } ${showingExplanations ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`font-semibold ${
                        showAsCorrect ? 'text-green-700 dark:text-green-400' :
                        showAsWrong ? 'text-red-700 dark:text-red-400' :
                        isSelected ? 'text-blue-700 dark:text-blue-400' :
                        'text-slate-700 dark:text-neutral-300'
                      }`}>
                        {option.letter}.
                      </span>
                      <div className={`flex-1 ${
                        showAsCorrect ? 'text-green-900 dark:text-green-300' :
                        showAsWrong ? 'text-red-900 dark:text-red-300' :
                        isSelected ? 'text-blue-900 dark:text-blue-300' :
                        'text-slate-900 dark:text-neutral-100'
                      }`}>
                        <FormattedText>
                          {option.text}
                        </FormattedText>
                      </div>
                      {showAsCorrect && <span className="text-green-600 dark:text-green-400 text-xl">✓</span>}
                      {showAsWrong && <span className="text-red-600 dark:text-red-400 text-xl">✗</span>}
                    </div>
                  </button>

                  {shouldShowExplanation && (
                    <div className={`rounded-lg p-3 text-sm ${
                      isCorrect ? 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-300' : 'bg-slate-50 dark:bg-neutral-700 text-slate-800 dark:text-neutral-300'
                    }`}>
                      <span className="font-semibold">
                        {isCorrect ? 'Why this is correct: ' : 'Why not: '}
                      </span>
                      <FormattedText className="inline">
                        {option.explanation}
                      </FormattedText>
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
                className="text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous question
              </button>
              <button
                onClick={handleSkipConcept}
                disabled={selectedOption !== null}
                className="text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Skip concept
              </button>
            </div>
            <button
              onClick={() => {
                void handleNextMCQ();
              }}
              disabled={!showingExplanations}
              className="rounded-md bg-slate-900 dark:bg-neutral-700 px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-neutral-300">
          <span>Progress</span>
          <span>
            {conceptProgress.size} of {totalConcepts} concepts visited
          </span>
        </div>
        <div className="flex gap-2">
          {lesson.concepts.map((_, i) => {
            const status = conceptProgress.get(i);
            const isCurrent = i === currentConceptIndex;

            return (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full ${
                  isCurrent
                    ? 'bg-yellow-500 dark:bg-yellow-600'
                    : status === 'completed'
                    ? 'bg-green-500 dark:bg-green-600'
                    : status === 'wrong'
                    ? 'bg-red-500 dark:bg-red-600'
                    : status === 'skipped'
                    ? 'bg-slate-300 dark:bg-neutral-600'
                    : 'bg-slate-300 dark:bg-neutral-600'
                }`}
                title={
                  isCurrent
                    ? 'Current / In Progress'
                    : status === 'completed'
                    ? 'All check-ins correct'
                    : status === 'wrong'
                    ? 'Incorrect answers'
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
        <div className="text-slate-600 dark:text-neutral-300">Loading your lesson...</div>
        <div className="text-sm text-slate-500 dark:text-neutral-400">
          Checking for cached lesson or generating new one (up to 10 seconds for first time)
        </div>
      </div>
    </div>
  );
}
