'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FormattedText } from '../../components/FormattedText';
import { createJobPoller, type Job } from '@/lib/jobs';
import ConceptNavigationSidebar from '../../components/ConceptNavigationSidebar';
import { getCachedLesson, setCachedLesson, clearCachedLesson } from '@/lib/lessonCache';
import type {
  MCQ,
  MCQOption,
  Formula,
  Concept,
  Lesson,
  ConceptMeta,
  Section,
  DocumentInfo,
  AnswerRecord,
  StoredProgress,
  MasteryUpdate
} from '@/types';

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
  const isOverviewMode = targetConceptName === '__section_overview__';

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

  // Concept navigation sidebar state
  const [isConceptNavCollapsed, setIsConceptNavCollapsed] = useState(false);

  // Prevent duplicate API calls in StrictMode
  const hasGeneratedRef = useState({ current: false })[0];

  // Track active pollers to prevent duplicates
  const pollingJobsRef = useRef<Set<string>>(new Set());

  // Track if generating next section
  const [generatingNextSection, setGeneratingNextSection] = useState(false);

  function makeQuestionKey(conceptIndex: number, mcqIndex: number) {
    return `${conceptIndex}-${mcqIndex}`;
  }

  // Helper to find the next section after the current one
  function getNextSection(): Section | null {
    if (!selectedSection || sections.length === 0) {
      return null;
    }

    // Sort sections by section_number
    const sortedSections = [...sections].sort((a, b) => a.section_number - b.section_number);

    // Find current section index
    const currentIndex = sortedSections.findIndex(s => s.id === selectedSection.id);

    // Return next section if it exists
    if (currentIndex >= 0 && currentIndex < sortedSections.length - 1) {
      return sortedSections[currentIndex + 1];
    }

    return null;
  }

  function getLessonStorageKey(lessonData: Lesson | null) {
    if (!lessonData) {
      return null;
    }

    // Use document_id, chapter, and section_id to ensure each section has separate progress
    const docId = lessonData.document_id || documentId;
    const chapterVal = lessonData.chapter || chapter;
    // Try lesson data first, then selectedSection, then URL parameter as fallback
    const sectionId = lessonData.section_id || selectedSection?.id || urlSectionId;

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

  // Skip straight to concept learning if concept_name is in URL (but not overview mode)
  useEffect(() => {
    if (targetConceptName && !isOverviewMode && sections.length > 0 && !lesson) {
      // Find which section contains this concept
      const targetSection = sections.find(s =>
        s.concepts?.some(c => c.name.toLowerCase() === targetConceptName.toLowerCase())
      );

      if (targetSection && !selectedSection) {
        console.log(`[learn] Auto-loading section for concept "${targetConceptName}"`);
        loadOrGenerateLesson(targetSection);
      }
    }
  }, [targetConceptName, isOverviewMode, sections, lesson, selectedSection]);

  // Auto-load lesson when in overview mode
  useEffect(() => {
    if (isOverviewMode && urlSectionId && sections.length > 0) {
      const targetSection = sections.find(s => s.id === urlSectionId);

      // Load if: no lesson loaded OR different section
      const needsLoad = !lesson || selectedSection?.id !== urlSectionId;

      if (targetSection && needsLoad) {
        console.log(`[learn] Auto-loading section for overview mode`);
        loadOrGenerateLesson(targetSection);
      }
    }
  }, [isOverviewMode, urlSectionId, sections, lesson, selectedSection]);

  // Auto-load lesson when section_id is in URL (from grid click)
  useEffect(() => {
    if (!urlSectionId || !documentId || sections.length === 0 || isOverviewMode) {
      return;
    }

    // Find the section matching the URL parameter
    const targetSection = sections.find(s => s.id === urlSectionId);

    // Load if: no lesson loaded OR different section
    const needsLoad = !lesson || selectedSection?.id !== urlSectionId;

    if (targetSection && needsLoad) {
      console.log(`[learn] Auto-loading section from URL: ${targetSection.name}`);
      loadOrGenerateLesson(targetSection);
    }
  }, [urlSectionId, documentId, sections, lesson, selectedSection, isOverviewMode]);

  // Restore generating sections from sessionStorage on mount
  useEffect(() => {
    if (!documentId || sections.length === 0 || typeof window === 'undefined') {
      return;
    }

    // Look for any lesson generation jobs in sessionStorage
    const storageKeys = Object.keys(sessionStorage);
    const lessonJobKeys = storageKeys.filter(key => key.startsWith('lesson-job-'));

    lessonJobKeys.forEach(key => {
      try {
        const jobData = JSON.parse(sessionStorage.getItem(key) || '{}');

        // Only restore if it's for this document
        if (jobData.document_id === documentId && jobData.job_id) {
          const section = sections.find(s => s.id === jobData.section_id);

          if (section && !pollingJobsRef.current.has(jobData.job_id)) {
            console.log(`[learn] Restoring generation job for section ${section.name}`);

            // Mark section as generating
            setSections(prev => prev.map(s =>
              s.id === section.id
                ? { ...s, generating: true, generation_progress: 0, job_id: jobData.job_id }
                : s
            ));

            // Resume polling
            pollingJobsRef.current.add(jobData.job_id);
            resumeLessonGenerationPolling(jobData.job_id, section);
          }
        }
      } catch (error) {
        console.error('[learn] Failed to restore job from sessionStorage:', error);
      }
    });
  }, [documentId, sections]);

  // Helper function to resume polling for a lesson generation job
  function resumeLessonGenerationPolling(jobId: string, section: Section) {
    createJobPoller(jobId, {
      interval: 2000,
      onProgress: (job: Job) => {
        console.log('[learn] Generation progress:', job.progress);
        setSections(prev => prev.map(s =>
          s.id === section.id
            ? { ...s, generation_progress: job.progress }
            : s
        ));
      },
      onComplete: async (job: Job) => {
        console.log('[learn] Generation completed:', job);

        // Fetch the new concepts for this section
        try {
          const conceptsRes = await fetch(chapter
            ? `/api/concepts/mastery?document_id=${documentId}&chapter=${encodeURIComponent(chapter)}`
            : `/api/concepts/mastery?document_id=${documentId}`
          );

          if (conceptsRes.ok) {
            const conceptsData = await conceptsRes.json();
            const allConcepts = conceptsData.concepts || [];

            // Find concepts for this specific section
            const sectionConcepts = allConcepts
              .filter((c: any) => c.section_id === section.id)
              .map((c: any) => ({
                id: c.id,
                name: c.name,
                concept_number: c.concept_number,
                lesson_position: c.lesson_position,
                mastery_level: c.mastery_level,
                accuracy: c.accuracy
              }));

            // Update the section with new concepts
            setSections(prev => prev.map(s =>
              s.id === section.id
                ? { ...s, generating: false, concepts_generated: true, concepts: sectionConcepts }
                : s
            ));
          } else {
            // Fallback: just mark as generated without concepts
            setSections(prev => prev.map(s =>
              s.id === section.id
                ? { ...s, generating: false, concepts_generated: true }
                : s
            ));
          }
        } catch (error) {
          console.error('[learn] Failed to fetch concepts after generation:', error);
          // Fallback: just mark as generated
          setSections(prev => prev.map(s =>
            s.id === section.id
              ? { ...s, generating: false, concepts_generated: true }
              : s
          ));
        }

        // Remove from polling set and sessionStorage
        pollingJobsRef.current.delete(jobId);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(`lesson-job-${jobId}`);
        }
      },
      onError: (error: string) => {
        console.error('[learn] Generation error:', error);
        setSections(prev => prev.map(s =>
          s.id === section.id
            ? { ...s, generating: false }
            : s
        ));

        // Remove from polling set and sessionStorage
        pollingJobsRef.current.delete(jobId);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(`lesson-job-${jobId}`);
        }
      }
    });
  }

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
      // Fetch sections and concepts in parallel for efficiency
      const [sectionsRes, conceptsRes] = await Promise.all([
        fetch(`/api/sections?document_id=${documentId}`),
        fetch(chapter
          ? `/api/concepts/mastery?document_id=${documentId}&chapter=${encodeURIComponent(chapter)}`
          : `/api/concepts/mastery?document_id=${documentId}`)
      ]);

      if (sectionsRes.ok) {
        const sectionsData = await sectionsRes.json();
        const sections = sectionsData.sections || [];

        if (sections.length > 0) {
          // Fetch concepts and attach to sections
          let conceptsBySectionId: Record<string, ConceptMeta[]> = {};

          if (conceptsRes.ok) {
            const conceptsData = await conceptsRes.json();
            const allConcepts = conceptsData.concepts || [];

            // Group concepts by section_id
            for (const concept of allConcepts) {
              if (concept.section_id) {
                if (!conceptsBySectionId[concept.section_id]) {
                  conceptsBySectionId[concept.section_id] = [];
                }
                conceptsBySectionId[concept.section_id].push({
                  id: concept.id,
                  name: concept.name,
                  concept_number: concept.concept_number,
                  lesson_position: concept.lesson_position,
                  mastery_level: concept.mastery_level,
                  accuracy: concept.accuracy
                });
              }
            }
          }

          // Attach concepts to their respective sections
          const sectionsWithConcepts = sections.map((section: Section) => ({
            ...section,
            concepts: conceptsBySectionId[section.id] || []
          }));

          setSections(sectionsWithConcepts);
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
        const generatedSections = data.sections || [];

        // After generating sections, re-fetch to attach concepts
        // (In case any sections already had lessons generated)
        await loadOrGenerateSections();

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
  async function fetchLesson(lessonId: string, sectionIdForCache?: string) {
    setGeneratingLesson(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}`);
      if (res.ok) {
        const rawData = await res.json();
        console.log('[learn] Fetched lesson:', rawData);
        const normalizedLesson = normalizeLesson(rawData);
        setLesson(normalizedLesson);

        // Cache the lesson if we have section info
        if (documentId && sectionIdForCache) {
          setCachedLesson(documentId, sectionIdForCache, rawData);
        }

        // Navigate appropriately
        if (targetConceptName && !isOverviewMode) {
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
            // Don't clear concept navigation - keep concept_name in URL for refresh persistence
          } else {
            clearConceptNavigation();
            setShowingSections(false);
            setShowingSummary(true);
          }
        } else {
          // Overview mode or no target concept - show summary
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

    // Check cache first
    if (documentId) {
      const cachedLesson = getCachedLesson(documentId, section.id);
      if (cachedLesson) {
        console.log('[learn] Using cached lesson for section:', section.id);
        const normalizedLesson = normalizeLesson(cachedLesson);
        setLesson(normalizedLesson);

        // Navigate appropriately
        if (targetConceptName && !isOverviewMode) {
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
          } else {
            clearConceptNavigation();
            setShowingSections(false);
            setShowingSummary(true);
          }
        } else {
          // Overview mode or no target concept - show summary
          clearConceptNavigation();
          setShowingSections(false);
          setShowingSummary(true);
        }

        return; // Early return with cached data
      }
    }

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
              // Mark section as ready - user can click to view it
              setSections(prev => prev.map(s =>
                s.id === section.id
                  ? { ...s, generating: false, concepts_generated: true }
                  : s
              ));
            },
            onError: (error: string) => {
              console.error('[learn] Generation error:', error);
              // Mark section as failed
              setSections(prev => prev.map(s =>
                s.id === section.id
                  ? { ...s, generating: false }
                  : s
              ));
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
          await fetchLesson(data.lesson_id, section.id);
        } else {
          // Old format: lesson data returned directly (shouldn't happen with new API)
          const normalizedLesson = normalizeLesson(data);
          console.log('[learn] Normalized lesson:', normalizedLesson);
          setLesson(normalizedLesson);

          // Cache the lesson
          if (documentId) {
            setCachedLesson(documentId, section.id, data);
          }

          // Update section to mark concepts as generated
          setSections(prev => prev.map(s =>
            s.id === section.id ? { ...s, concepts_generated: true } : s
          ));

        // Check if we should navigate directly to a specific concept by name
        console.log('[learn] Navigation check - targetConceptName:', targetConceptName);
        console.log('[learn] Navigation check - isOverviewMode:', isOverviewMode);
        console.log('[learn] Navigation check - concepts count:', normalizedLesson.concepts?.length);
        if (targetConceptName && !isOverviewMode) {
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
            // Don't clear concept navigation - keep concept_name in URL for refresh persistence
          } else {
            // Concept not found, show summary
            console.warn(`[learn] Concept "${targetConceptName}" not found in lesson, showing summary`);
            clearConceptNavigation();
            setShowingSections(false);
            setShowingSummary(true);
          }
        } else {
          // Overview mode or no target concept - show summary screen
          clearConceptNavigation();
          setShowingSections(false);
          setShowingSummary(true);
        }
      }
    } else {
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
    setError({
      message: 'Failed to load lesson. Please check your connection and try again.',
      retry: () => loadOrGenerateLesson(section)
    });
  }
}

  // Generate lesson for a specific section
  async function generateLessonForSection(section: Section) {
    // Don't set selectedSection here - we're only triggering generation/discovery,
    // not actually loading the lesson. Setting it would create state mismatch
    // between selectedSection and lesson, breaking mastery updates and URL navigation.
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

          // Store job in sessionStorage for persistence across navigation
          if (typeof window !== 'undefined') {
            const jobData = {
              job_id: rawData.job_id,
              document_id: documentId,
              section_id: section.id,
              section_name: section.name,
              section_number: section.section_number,
              chapter: chapter || null,
              course_id: documentInfo?.course_id || null
            };
            sessionStorage.setItem(`lesson-job-${rawData.job_id}`, JSON.stringify(jobData));
          }

          // Update section state to show it's generating
          setSections(prev => prev.map(s =>
            s.id === section.id
              ? { ...s, generating: true, generation_progress: 0, job_id: rawData.job_id }
              : s
          ));

          // Add to polling set to prevent duplicates
          pollingJobsRef.current.add(rawData.job_id);

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
              // Mark section as ready - user can click to view it
              setSections(prev => prev.map(s =>
                s.id === section.id
                  ? { ...s, generating: false, concepts_generated: true }
                  : s
              ));

              // Remove from polling set and sessionStorage
              pollingJobsRef.current.delete(rawData.job_id);
              if (typeof window !== 'undefined') {
                sessionStorage.removeItem(`lesson-job-${rawData.job_id}`);
              }
            },
            onError: (error: string) => {
              console.error('[learn] Generation error:', error);
              // Mark section as failed
              setSections(prev => prev.map(s =>
                s.id === section.id
                  ? { ...s, generating: false }
                  : s
              ));

              // Remove from polling set and sessionStorage
              pollingJobsRef.current.delete(rawData.job_id);
              if (typeof window !== 'undefined') {
                sessionStorage.removeItem(`lesson-job-${rawData.job_id}`);
              }

              setError({
                message: `Failed to generate lesson: ${error}`,
                retry: () => generateLessonForSection(section)
              });
            }
          });

          // Don't block the UI - user can click other sections
          return;
        } else if (rawData.lesson_id) {
          // Lesson already exists - just update section state, don't navigate
          console.log(`[learn] Lesson already exists: lesson_id=${rawData.lesson_id}, updating section state without navigation`);
          setSections(prev => prev.map(s =>
            s.id === section.id ? { ...s, concepts_generated: true } : s
          ));
          return;
        } else {
          // Old format: lesson returned directly
          console.log('[learn] Lesson returned directly (old format), updating section state without navigation');
          const normalizedLesson = normalizeLesson(rawData);

          // Update section to mark concepts as generated
          setSections(prev => prev.map(s =>
            s.id === section.id ? { ...s, concepts_generated: true } : s
          ));

          // Don't navigate - user clicked from sidebar and should stay on current page
          return;
        }
      } else {
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
    if (!lesson || !targetConceptName || isOverviewMode || showingSummary) {
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

      // Don't clear navigation - URL updates when navigating between concepts
      // This ensures refresh keeps you on the same concept
    }
  }, [lesson, targetConceptName, isOverviewMode, showingSummary, currentConceptIndex]);

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
    // Use smooth scrolling for animated transition when navigating between concepts
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Scroll to top when navigating between concepts (but not between questions)
  useEffect(() => {
    if (showingSummary) {
      return;
    }

    // Only scroll when concept changes, not when questions change within the same concept
    // This prevents click misalignment and keeps the user's position during MCQ navigation
    scrollToTop();
  }, [showingSummary, currentConceptIndex]); // Removed currentMCQIndex from dependencies

  // Auto-navigate to next section when it finishes generating
  useEffect(() => {
    if (!generatingNextSection) return;

    const nextSection = getNextSection();
    if (nextSection && nextSection.concepts_generated && nextSection.concepts && nextSection.concepts.length > 0) {
      console.log('[learn] Next section generated, navigating to first concept');

      // Clear current lesson progress
      if (storageKeyRef.current && typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(storageKeyRef.current);
        } catch (error) {
          console.error('Failed to clear lesson progress cache:', error);
        }
      }

      // Navigate to first concept of next section
      const firstConcept = nextSection.concepts[0];
      router.push(`/learn?document_id=${documentId}${chapter ? `&chapter=${encodeURIComponent(chapter)}` : ''}&section_id=${nextSection.id}&concept_name=${encodeURIComponent(firstConcept.name)}`);

      // Reset generating state
      setGeneratingNextSection(false);
    }
  }, [sections, generatingNextSection]);

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

    // Update URL to first concept when starting from overview mode
    if (isOverviewMode && lesson.concepts && lesson.concepts.length > 0 && selectedSection) {
      const firstConcept = lesson.concepts[0];
      router.push(`/learn?document_id=${documentId}${chapter ? `&chapter=${encodeURIComponent(chapter)}` : ''}&section_id=${selectedSection.id}&concept_name=${encodeURIComponent(firstConcept.name)}`);
    } else {
      clearConceptNavigation();
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

    // Update mastery in sidebar immediately after answering
    if (currentConcept && selectedSection) {
      const mcqs = currentConcept.check_ins || [];
      let correctCount = 0;
      let totalCount = 0;

      // Count all answers including the current one
      mcqs.forEach((_, mcqIdx) => {
        const k = makeQuestionKey(currentConceptIndex, mcqIdx);
        const ans = answerHistory[k];
        if (ans) {
          totalCount++;
          if (ans.correct) correctCount++;
        }
      });

      // Include current answer
      totalCount++;
      if (wasCorrect) correctCount++;

      const accuracy = Math.round((correctCount / totalCount) * 100);
      const newMasteryLevel =
        accuracy === 100 ? 'completed' :
        accuracy === 0 ? 'incorrect' :
        'in_progress';

      setSections(prev => prev.map(s => {
        if (s.id === selectedSection.id && s.concepts) {
          return {
            ...s,
            concepts: s.concepts.map(c =>
              c.name.toLowerCase() === currentConcept.name.toLowerCase()
                ? { ...c, mastery_level: newMasteryLevel, accuracy }
                : c
            )
          };
        }
        return s;
      }));
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

    // Update mastery in sections state for real-time sidebar update
    if (currentConcept && selectedSection) {
      // Calculate accuracy based on all questions for this concept
      const mcqs = currentConcept.check_ins || [];
      let correctCount = 0;
      let totalCount = 0;

      // Count all answers for this concept
      mcqs.forEach((_, mcqIdx) => {
        const key = makeQuestionKey(currentConceptIndex, mcqIdx);
        const ans = answerHistory[key];
        if (ans) {
          totalCount++;
          if (ans.correct) correctCount++;
        }
      });

      const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
      const newMasteryLevel =
        accuracy === 100 ? 'completed' :
        accuracy === 0 ? 'incorrect' :
        'in_progress';

      setSections(prev => prev.map(s => {
        if (s.id === selectedSection.id && s.concepts) {
          return {
            ...s,
            concepts: s.concepts.map(c =>
              c.name.toLowerCase() === currentConcept.name.toLowerCase()
                ? { ...c, mastery_level: newMasteryLevel, accuracy }
                : c
            )
          };
        }
        return s;
      }));
    }

    if (currentConceptIndex < lesson.concepts.length - 1) {
      const nextConceptIndex = currentConceptIndex + 1;
      const nextConcept = lesson.concepts[nextConceptIndex];

      setCurrentConceptIndex(nextConceptIndex);
      setCurrentMCQIndex(0);

      // Update URL to preserve state on refresh
      if (nextConcept && selectedSection) {
        router.push(`/learn?document_id=${documentId}${chapter ? `&chapter=${encodeURIComponent(chapter)}` : ''}&section_id=${selectedSection.id}&concept_name=${encodeURIComponent(nextConcept.name)}`);
      }
    } else {
      // Last concept finished - check if there's a next section
      const nextSection = getNextSection();

      if (nextSection) {
        // There's a next section!
        if (nextSection.concepts_generated && nextSection.concepts && nextSection.concepts.length > 0) {
          // Next section is already generated - navigate to its first concept
          console.log('[learn] Navigating to first concept of next section:', nextSection.name);

          // Clear current lesson progress
          if (storageKeyRef.current && typeof window !== 'undefined') {
            try {
              window.localStorage.removeItem(storageKeyRef.current);
            } catch (error) {
              console.error('Failed to clear lesson progress cache:', error);
            }
          }

          await completeStudySession();

          // Navigate to first concept of next section
          const firstConcept = nextSection.concepts[0];
          router.push(`/learn?document_id=${documentId}${chapter ? `&chapter=${encodeURIComponent(chapter)}` : ''}&section_id=${nextSection.id}&concept_name=${encodeURIComponent(firstConcept.name)}`);
        } else {
          // Next section not generated - generate it
          console.log('[learn] Generating next section:', nextSection.name);
          setGeneratingNextSection(true);

          // Generate the next section
          await generateLessonForSection(nextSection);

          // The generation completion handler will update sections state
          // We'll navigate in a useEffect when generation completes
        }
      } else {
        // No next section - finish lesson and return to course page
        if (storageKeyRef.current && typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem(storageKeyRef.current);
          } catch (error) {
            console.error('Failed to clear lesson progress cache:', error);
          }
        }

        await completeStudySession();

        // Return to course page (sections list view eliminated)
        const courseId = documentInfo?.course_id;
        if (courseId) {
          router.push(`/courses/${courseId}`);
        } else {
          router.push('/'); // Home page shows all courses
        }
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
      const nextConceptIndex = currentConceptIndex + 1;
      const nextConcept = lesson.concepts[nextConceptIndex];

      setCurrentConceptIndex(nextConceptIndex);
      setCurrentMCQIndex(0);

      // Update URL to preserve state on refresh
      if (nextConcept && selectedSection) {
        router.push(`/learn?document_id=${documentId}${chapter ? `&chapter=${encodeURIComponent(chapter)}` : ''}&section_id=${selectedSection.id}&concept_name=${encodeURIComponent(nextConcept.name)}`);
      }
    } else {
      if (storageKeyRef.current && typeof window !== 'undefined') {
        window.localStorage.removeItem(storageKeyRef.current);
      }
      void completeStudySession();

      // Return to course page (sections list view eliminated)
      const courseId = documentInfo?.course_id;
      if (courseId) {
        router.push(`/courses/${courseId}`);
      } else {
        router.push('/'); // Home page shows all courses
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
      const previousConceptIndex = currentConceptIndex - 1;
      const previousConcept = lesson.concepts?.[previousConceptIndex];
      const previousTotal = previousConcept?.check_ins?.length || 0;

      setCurrentConceptIndex(previousConceptIndex);
      setCurrentMCQIndex(previousTotal > 0 ? previousTotal - 1 : 0);

      // Update URL to preserve state on refresh (matching handleNextMCQ behavior)
      if (previousConcept && selectedSection) {
        router.push(`/learn?document_id=${documentId}${chapter ? `&chapter=${encodeURIComponent(chapter)}` : ''}&section_id=${selectedSection.id}&concept_name=${encodeURIComponent(previousConcept.name)}`);
      }
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
              router.push('/'); // Home page shows all courses
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
                router.push('/'); // Home page shows all courses
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

  // Redirect to course page if no section_id is in URL (sections list eliminated)
  // Users should navigate from course page directly to section overview or concepts
  if (!urlSectionId && !showingSections) {
    const courseId = documentInfo?.course_id;
    if (courseId) {
      router.push(`/courses/${courseId}`);
    } else {
      router.push('/'); // Home page shows all courses
    }
    return <LearnPageFallback />;
  }

  // Show loading state while lesson is being generated or loaded
  if (generatingLesson) {
    return <LearnPageFallback />;
  }

  // Check if section is currently generating
  const currentSection = sections.find(s => s.id === urlSectionId);
  if (currentSection?.generating) {
    return <LearnPageFallback />;
  }

  // Check if we're loading a lesson for an existing section (not yet loaded)
  // This prevents "Failed to load lesson" flash when clicking a concept
  if (!lesson && urlSectionId && currentSection && currentSection.concepts_generated) {
    return <LearnPageFallback />;
  }

  if (!lesson || !lesson.concepts || lesson.concepts.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">Failed to load lesson</h2>
        <button
          onClick={() => router.push('/')}
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
            onClick={() => router.push('/')}
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
              onClick={() => router.push('/')}
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

                  // Clear the cached lesson from localStorage
                  if (documentId && lesson.section_id) {
                    clearCachedLesson(documentId, lesson.section_id);
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

  // Show summary screen (section overview)
  if (showingSummary) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              const courseId = documentInfo?.course_id;
              if (courseId) {
                router.push(`/courses/${courseId}`);
              } else {
                router.push('/'); // Home page shows all courses
              }
            }}
            className="text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100"
          >
            ← Back to course
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
                  <span className="text-blue-600 dark:text-blue-400 font-semibold flex-shrink-0">{idx + 1}.</span>
                  <div className="flex-1"><FormattedText>{concept.name}</FormattedText></div>
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

  // Determine if we should show the navigation sidebar
  // Hide it if user has switched to main sidebar via ?sidebar=main
  const showingMainSidebar = searchParams.get('sidebar') === 'main';

  // Show overview if section_id present but no concept_name (or explicitly showing summary)
  const isShowingOverview = lesson && selectedSection && (!targetConceptName || showingSummary);

  const showNavigationSidebar = !showingSections && lesson && sections.length > 0 && !showingMainSidebar;

  // Show concept learning screen
  return (
    <>
      {/* Concept Navigation Sidebar */}
      {showNavigationSidebar && (
        <ConceptNavigationSidebar
          documentInfo={documentInfo}
          sections={sections}
          currentSectionId={selectedSection?.id || null}
          currentConceptName={currentConcept?.name || null}
          concepts={lesson?.concepts || []}
          onSectionClick={(section) => {
            // Load the section's lesson when clicked from navigation
            loadOrGenerateLesson(section);
          }}
          onConceptClick={(conceptName) => {
            // Find which section contains this concept
            const targetSection = sections.find(s =>
              s.concepts?.some(c => c.name.toLowerCase() === conceptName.toLowerCase())
            );

            if (targetSection) {
              // Always navigate via URL to ensure persistence on refresh
              const targetUrl = `/learn?document_id=${documentId}${chapter ? `&chapter=${encodeURIComponent(chapter)}` : ''}&section_id=${targetSection.id}&concept_name=${encodeURIComponent(conceptName)}`;

              // If it's the same section and lesson is loaded, navigate directly
              if (targetSection.id === selectedSection?.id && lesson) {
                const concepts = lesson?.concepts || [];
                const targetIndex = concepts.findIndex(c =>
                  c.name.toLowerCase() === conceptName.toLowerCase()
                );

                if (targetIndex >= 0) {
                  // Update URL to preserve state on refresh
                  router.push(targetUrl);
                  setCurrentConceptIndex(targetIndex);
                  setCurrentMCQIndex(0);
                  setShowingSummary(false);
                  setShowingSections(false);
                  // scrollToTop() is handled by useEffect when currentConceptIndex changes
                  return;
                }
              }

              // Different section or lesson not loaded - navigate via URL
              router.push(targetUrl);
            }
          }}
          onGenerateSection={(section) => {
            generateLessonForSection(section);
          }}
          onCollapseChange={setIsConceptNavCollapsed}
        />
      )}

      {/* Content area - always ml-64 when sidebar present to prevent animation on sidebar switch */}
      <div className={`transition-none ${(showNavigationSidebar && !isConceptNavCollapsed) || showingMainSidebar ? 'ml-64' : ''}`}>
        <div className={`mx-auto space-y-6 ${(showNavigationSidebar && !isConceptNavCollapsed) || showingMainSidebar ? 'max-w-5xl' : 'max-w-6xl'}`}>
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
        <div className="text-2xl font-bold text-slate-900 dark:text-neutral-100">
          <FormattedText>{currentConcept.name}</FormattedText>
        </div>

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
          <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-4 space-y-3">
            <div className="text-sm font-semibold uppercase tracking-wide text-purple-900 dark:text-purple-300">Formulas & Equations</div>
            {currentConcept.formulas.map((formulaObj, index) => (
              <div key={index} className="space-y-1">
                <div className="text-purple-900 dark:text-purple-100 bg-white dark:bg-purple-900/40 p-3 rounded border border-purple-200 dark:border-purple-700">
                  <FormattedText>
                    {formulaObj.formula}
                  </FormattedText>
                </div>
                <FormattedText className="text-xs text-purple-700 dark:text-purple-400 pl-3">
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
              disabled={!showingExplanations || generatingNextSection}
              className="rounded-md bg-slate-900 dark:bg-neutral-700 px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(() => {
                // Not last MCQ - show "Next Question"
                if (currentMCQIndex < totalMCQsInConcept - 1) {
                  return 'Next Question';
                }

                // Last MCQ but not last concept - show "Next Concept"
                if (currentConceptIndex < totalConcepts - 1) {
                  return 'Next Concept';
                }

                // Last MCQ of last concept - check for next section
                const nextSection = getNextSection();

                if (generatingNextSection) {
                  return 'Generating...';
                }

                if (nextSection) {
                  if (nextSection.concepts_generated && nextSection.concepts && nextSection.concepts.length > 0) {
                    return 'Next Section';
                  } else {
                    return 'Generate Next Section';
                  }
                }

                // No next section - finish lesson
                return 'Finish Lesson';
              })()}
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
      </div>
    </>
  );
}

function LearnPageFallback() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 skeleton rounded" />
        <div className="h-4 w-24 skeleton rounded" />
      </div>

      {/* Concept card skeleton */}
      <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-8 shadow-sm space-y-4">
        <div className="h-8 w-3/4 skeleton rounded-lg" />
        <div className="space-y-3">
          <div className="h-4 w-full skeleton rounded" />
          <div className="h-4 w-full skeleton rounded" />
          <div className="h-4 w-2/3 skeleton rounded" />
        </div>
      </div>

      {/* MCQ skeleton */}
      <div className="rounded-lg border-2 border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-8 shadow-md space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 skeleton rounded" />
          <div className="h-4 w-24 skeleton rounded" />
        </div>
        <div className="h-5 w-full skeleton rounded" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 w-full skeleton rounded-lg" />
          ))}
        </div>
      </div>

      {/* Progress skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-32 skeleton rounded" />
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-2 flex-1 skeleton rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
