'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { MasteryGrid, type SkillSquare, type MasteryLevel } from '../../../components/MasteryGrid';
import { Button, Card, Badge, ConfirmModal, UploadModal, Tier2UploadModal, ChapterSelectionModal, MarkdownViewerModal } from '@/components/ui';
import { createJobPoller, type Job } from '@/lib/jobs';
import { useTier } from '@/contexts/TierContext';
import { useFetchChapterSources } from '@/lib/hooks/useFetchChapterSources';
import { useAuth } from '@clerk/nextjs';
import { getBackendUrl } from '@/lib/api';

type Course = {
  id: string;
  name: string;
  code: string | null;
  term: string | null;
  exam_date: string | null;
};

type Document = {
  id: string;
  title: string;
  material_type: string | null;
  chapter: string | null;
  pages: number;
  uploaded_at: string;
};

type ProcessingJob = {
  job_id: string;
  document_id: string;
  title?: string;
  section_name?: string;
  section_id?: string;
  section_number?: number;
  type: 'upload' | 'lesson';
  progress: number;
  status: string;
  chapter?: string;
};

type ConceptWithMastery = {
  id: string;
  name: string;
  chapter: string;
  section_id: string | null;
  section_number: number | null;
  section_name: string | null;
  concept_number: number | null;
  lesson_position?: number | null;
  mastery_level: MasteryLevel;
  accuracy: number;
  total_attempts: number;
  correct_attempts: number;
};

type ConceptMeta = {
  id: string;
  name: string;
  concept_number: number | null;
  lesson_position: number;
  mastery_level: MasteryLevel;
  accuracy: number;
};

type SectionWithMastery = {
  id: string;
  section_number: number;
  name: string;
  description: string | null;
  mastery_level: MasteryLevel;
  concepts_generated: boolean;
  page_start: number | null;
  page_end: number | null;
  concepts?: ConceptMeta[]; // Populated for sidebar navigation
};

export default function CoursePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = params.id as string;
  const router = useRouter();
  const { tierData, isTier } = useTier();
  const { chapterSources, refetch: refetchChapterSources } = useFetchChapterSources(courseId);
  const { getToken } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [conceptsByChapter, setConceptsByChapter] = useState<Record<string, ConceptWithMastery[]>>({});
  const [sectionsByChapter, setSectionsByChapter] = useState<Record<string, SectionWithMastery[]>>({});
  const [conceptsByDocument, setConceptsByDocument] = useState<Record<string, ConceptWithMastery[]>>({});
  const [sectionsByDocument, setSectionsByDocument] = useState<Record<string, SectionWithMastery[]>>({});
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{ id: string; title: string } | null>(null);
  const [processingJobs, setProcessingJobs] = useState<ProcessingJob[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isTier2UploadModalOpen, setIsTier2UploadModalOpen] = useState(false);
  const [isChapterSelectionOpen, setIsChapterSelectionOpen] = useState(false);
  const [chapterSelectionData, setChapterSelectionData] = useState<{
    documentId: string;
    documentName: string;
    storageKey: string;
    chapters: Array<{ number: number; title: string; pageStart: number; pageEnd: number }>;
  } | null>(null);
  const [isMarkdownViewerOpen, setIsMarkdownViewerOpen] = useState(false);
  const [markdownContent, setMarkdownContent] = useState('');
  const [markdownTitle, setMarkdownTitle] = useState('');
  const pollingJobsRef = useRef<Set<string>>(new Set());
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [placeholdersPerRow, setPlaceholdersPerRow] = useState(14); // Default fallback

  useEffect(() => {
    if (courseId) {
      fetchCourseData();
      loadProcessingJobs();
    }
  }, [courseId]);

  // Poll for upload job completion when redirected from upload page
  useEffect(() => {
    const uploadJobId = searchParams.get('upload_job_id');
    if (!uploadJobId) return;

    // Prevent duplicate pollers
    if (pollingJobsRef.current.has(uploadJobId)) {
      console.log('[courses] Already polling for job:', uploadJobId);
      return;
    }

    console.log('[courses] Upload job detected in URL:', uploadJobId);

    // Mark as polling
    pollingJobsRef.current.add(uploadJobId);

    // Load from sessionStorage and add to state
    const stored = sessionStorage.getItem('processingJobs');
    if (stored) {
      try {
        const allJobs = JSON.parse(stored);
        const uploadJob = allJobs.find((j: any) => j.job_id === uploadJobId);
        if (uploadJob) {
          console.log('[courses] Adding job from sessionStorage to state:', uploadJob);
          setProcessingJobs(prev => {
            // Double-check it's not already there
            if (prev.some(j => j.job_id === uploadJobId)) return prev;
            return [...prev, { ...uploadJob, progress: 0, status: 'queued' }];
          });
        }
      } catch (e) {
        console.error('[courses] Failed to parse processingJobs:', e);
      }
    }

    // Start polling for this specific job
    const cancelPoller = createJobPoller(uploadJobId, {
      interval: 2000,
      onProgress: (job: Job) => {
        console.log('[courses] Upload progress:', job.progress, job.status);
        updateJobProgress(uploadJobId, job.progress, job.status);
      },
      onComplete: (job: Job) => {
        console.log('[courses] Upload completed:', job);
        pollingJobsRef.current.delete(uploadJobId);
        removeProcessingJob(uploadJobId);

        // Check if this is a tier 2 multi-chapter upload
        if (job.result?.type === 'multi_chapter') {
          console.log('[courses] Multi-chapter PDF detected:', job.result);
          // Trigger chapter selection modal
          setChapterSelectionData({
            documentId: job.result.document_id,
            documentName: job.result.title,
            storageKey: job.result.storage_key,
            chapters: job.result.chapters
          });
          setIsChapterSelectionOpen(true);
        } else {
          // Refresh course data to show the new document
          fetchCourseData();
        }
      },
      onError: (error: string) => {
        console.error('[courses] Upload job error:', error);
        pollingJobsRef.current.delete(uploadJobId);
        removeProcessingJob(uploadJobId);
      }
    });

    // Cleanup on unmount
    return () => {
      cancelPoller();
      pollingJobsRef.current.delete(uploadJobId);
    };
  }, [searchParams]);

  // Calculate how many placeholder squares fit in one row dynamically
  useEffect(() => {
    const calculatePlaceholders = () => {
      if (!gridContainerRef.current) {
        setPlaceholdersPerRow(14); // Default fallback
        return;
      }

      const containerWidth = gridContainerRef.current.offsetWidth;
      // Grid: 48px squares + 8px gap (gap-2 in Tailwind)
      // Container has 16px padding on each side when in section boxes
      const effectiveWidth = containerWidth - 32; // Subtract padding
      const squareWithGap = 48 + 8; // 56px per square
      const squaresPerRow = Math.floor(effectiveWidth / squareWithGap);

      // Subtract 1 for the overview square to get placeholders count
      const placeholders = Math.max(1, squaresPerRow - 1);
      setPlaceholdersPerRow(placeholders);
    };

    // Calculate on mount and window resize
    calculatePlaceholders();
    window.addEventListener('resize', calculatePlaceholders);

    return () => window.removeEventListener('resize', calculatePlaceholders);
  }, []);

  function loadProcessingJobs() {
    try {
      const allJobs: ProcessingJob[] = [];

      // Load upload jobs from 'processingJobs' sessionStorage
      const stored = sessionStorage.getItem('processingJobs');
      if (stored) {
        const uploadJobs = JSON.parse(stored);
        const courseUploadJobs = uploadJobs
          .filter((job: any) => job.course_id === courseId)
          .map((job: any) => ({
            job_id: job.job_id,
            document_id: job.document_id,
            title: job.title,
            type: 'upload' as const,
            progress: 0,
            status: 'queued',
            chapter: job.chapter
          }));
        allJobs.push(...courseUploadJobs);
        console.log('[courses] Loaded', courseUploadJobs.length, 'upload jobs from sessionStorage');
      }

      // Load lesson generation jobs from 'lesson-job-*' sessionStorage entries
      const storageKeys = Object.keys(sessionStorage);
      const lessonJobKeys = storageKeys.filter(key => key.startsWith('lesson-job-'));
      console.log('[courses] Found', lessonJobKeys.length, 'lesson job keys in sessionStorage');

      lessonJobKeys.forEach(key => {
        try {
          const jobData = JSON.parse(sessionStorage.getItem(key) || '{}');
          if (jobData.course_id === courseId && jobData.job_id) {
            allJobs.push({
              job_id: jobData.job_id,
              document_id: jobData.document_id,
              section_name: jobData.section_name,
              section_id: jobData.section_id,
              section_number: jobData.section_number,
              type: 'lesson' as const,
              progress: 0,
              status: 'queued',
              chapter: jobData.chapter
            });
            console.log('[courses] Added lesson job for section:', jobData.section_name);
          }
        } catch (e) {
          console.error('[courses] Failed to parse lesson job:', e);
        }
      });

      console.log('[courses] Total jobs loaded:', allJobs.length, '(', allJobs.filter(j => j.type === 'upload').length, 'uploads,', allJobs.filter(j => j.type === 'lesson').length, 'lessons)');
      setProcessingJobs(allJobs);

      // Start polling for each job
      allJobs.forEach((job) => {
        if (pollingJobsRef.current.has(job.job_id)) {
          return; // Already polling
        }

        pollingJobsRef.current.add(job.job_id);

        createJobPoller(job.job_id, {
          interval: 2000,
          onProgress: (jobData: Job) => {
            updateJobProgress(job.job_id, jobData.progress, jobData.status);
          },
          onComplete: async (jobData: Job) => {
            pollingJobsRef.current.delete(job.job_id);

            // For lesson generation, refresh concepts FIRST, then remove job
            if (job.type === 'lesson') {
              console.log('[courses] Lesson generation completed, refreshing concepts');
              await fetchConceptsForCourse();
              console.log('[courses] Concepts refreshed, removing job from UI');
              removeProcessingJob(job.job_id);
            } else if (job.type === 'upload') {
              // Check if this is a tier 2 multi-chapter upload
              if (jobData.result?.type === 'multi_chapter') {
                console.log('[courses] Multi-chapter PDF detected:', jobData.result);
                // Trigger chapter selection modal
                setChapterSelectionData({
                  documentId: jobData.result.document_id,
                  documentName: jobData.result.title,
                  storageKey: jobData.result.storage_key,
                  chapters: jobData.result.chapters
                });
                setIsChapterSelectionOpen(true);
                removeProcessingJob(job.job_id);
              } else {
                // Regular upload or single chapter - refresh page
                removeProcessingJob(job.job_id);
                fetchCourseData();
              }
            } else {
              // For uploads, refresh everything
              removeProcessingJob(job.job_id);
              fetchCourseData();
            }
          },
          onError: (error: string) => {
            console.error('Job error:', error);
            pollingJobsRef.current.delete(job.job_id);
            removeProcessingJob(job.job_id);
          }
        });
      });
    } catch (error) {
      console.error('Failed to load processing jobs:', error);
    }
  }

  function updateJobProgress(jobId: string, progress: number, status: string) {
    setProcessingJobs(prev => prev.map(job =>
      job.job_id === jobId ? { ...job, progress, status } : job
    ));
  }

  function removeProcessingJob(jobId: string) {
    setProcessingJobs(prev => prev.filter(job => job.job_id !== jobId));

    // Also remove from session storage
    try {
      // Remove from upload jobs
      const stored = sessionStorage.getItem('processingJobs');
      if (stored) {
        const allJobs = JSON.parse(stored);
        const updated = allJobs.filter((job: any) => job.job_id !== jobId);
        sessionStorage.setItem('processingJobs', JSON.stringify(updated));
      }

      // Remove from lesson jobs
      sessionStorage.removeItem(`lesson-job-${jobId}`);
    } catch (error) {
      console.error('Failed to update session storage:', error);
    }
  }

  async function fetchCourseData() {
    try {
      // Fetch course details
      const courseRes = await fetch(`/api/courses/${courseId}`);
      if (courseRes.ok) {
        const courseData = await courseRes.json();
        setCourse(courseData);
      }

      // Fetch documents for this course
      const docsRes = await fetch(`/api/documents?course_id=${courseId}`);
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        const docs = docsData.documents || [];
        setDocuments(docs);

        // Fetch concepts for all documents
        await fetchConceptsForDocuments(docs);
      }
    } catch (error) {
      console.error('Failed to fetch course data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchConceptsForDocuments(docs: Document[]) {
    try {
      // Fetch both concept mastery data and sections for each document
      const dataPromises = docs.map(async (doc: Document) => {
        try {
          const masteryUrl = doc.chapter
            ? `/api/concepts/mastery?document_id=${doc.id}&chapter=${encodeURIComponent(doc.chapter)}`
            : `/api/concepts/mastery?document_id=${doc.id}`;

          const sectionsUrl = doc.chapter
            ? `/api/sections/mastery?document_id=${doc.id}&chapter=${encodeURIComponent(doc.chapter)}`
            : `/api/sections/mastery?document_id=${doc.id}`;

          const [conceptsRes, sectionsRes] = await Promise.all([
            fetch(masteryUrl),
            fetch(sectionsUrl)
          ]);

          const chapterKey = doc.chapter || 'Uncategorized';
          let concepts: any[] = [];
          let sections: any[] = [];

          if (conceptsRes.ok) {
            const data = await conceptsRes.json();
            concepts = data.concepts || [];
          }

          if (sectionsRes.ok) {
            const data = await sectionsRes.json();
            sections = data.sections || [];
          }

          return { chapterKey, concepts, sections, documentId: doc.id };
        } catch (error) {
          console.error(`Failed to fetch data for document ${doc.id}:`, error);
        }
        return null;
      });

      const results = await Promise.all(dataPromises);
      const conceptsMap: Record<string, ConceptWithMastery[]> = {};
      const sectionsMap: Record<string, SectionWithMastery[]> = {};
      const conceptsByDocMap: Record<string, ConceptWithMastery[]> = {};
      const sectionsByDocMap: Record<string, SectionWithMastery[]> = {};

      // Deduplicate concepts and sections by ID (for chapter-based view)
      const seenConceptIds = new Set<string>();
      const seenSectionIds = new Set<string>();

      for (const result of results) {
        if (result) {
          // Initialize chapter arrays if needed
          if (!conceptsMap[result.chapterKey]) {
            conceptsMap[result.chapterKey] = [];
          }
          if (!sectionsMap[result.chapterKey]) {
            sectionsMap[result.chapterKey] = [];
          }

          // Initialize document arrays
          conceptsByDocMap[result.documentId] = result.concepts;
          sectionsByDocMap[result.documentId] = result.sections;

          // Add unique concepts (for chapter-based view)
          for (const concept of result.concepts) {
            if (!seenConceptIds.has(concept.id)) {
              seenConceptIds.add(concept.id);
              conceptsMap[result.chapterKey].push(concept);
            }
          }

          // Add unique sections (for chapter-based view)
          for (const section of result.sections) {
            if (!seenSectionIds.has(section.id)) {
              seenSectionIds.add(section.id);
              sectionsMap[result.chapterKey].push(section);
            }
          }
        }
      }

      // Map concepts to their parent sections for chapter-based view
      for (const chapterKey in sectionsMap) {
        const chapterConcepts = conceptsMap[chapterKey] || [];

        sectionsMap[chapterKey] = sectionsMap[chapterKey].map(section => {
          // Find all concepts belonging to this section
          const sectionConcepts = chapterConcepts
            .filter(c => c.section_id === section.id)
            .map(c => ({
              id: c.id,
              name: c.name,
              concept_number: c.concept_number,
              lesson_position: c.lesson_position ?? 0,
              mastery_level: c.mastery_level,
              accuracy: c.accuracy
            }))
            .sort((a, b) => a.lesson_position - b.lesson_position);

          return {
            ...section,
            concepts: sectionConcepts
          };
        });
      }

      // Map concepts to their parent sections for document-based view
      for (const docId in sectionsByDocMap) {
        const docConcepts = conceptsByDocMap[docId] || [];

        sectionsByDocMap[docId] = sectionsByDocMap[docId].map(section => {
          // Find all concepts belonging to this section
          const sectionConcepts = docConcepts
            .filter(c => c.section_id === section.id)
            .map(c => ({
              id: c.id,
              name: c.name,
              concept_number: c.concept_number,
              lesson_position: c.lesson_position ?? 0,
              mastery_level: c.mastery_level,
              accuracy: c.accuracy
            }))
            .sort((a, b) => a.lesson_position - b.lesson_position);

          return {
            ...section,
            concepts: sectionConcepts
          };
        });
      }

      setConceptsByChapter(conceptsMap);
      setSectionsByChapter(sectionsMap);
      setConceptsByDocument(conceptsByDocMap);
      setSectionsByDocument(sectionsByDocMap);
    } catch (error) {
      console.error('Failed to fetch concepts and sections:', error);
    }
  }

  async function fetchConceptsForCourse() {
    console.log('[courses] fetchConceptsForCourse - Refetching documents first');

    // IMPORTANT: Don't use 'documents' from closure - it may be stale!
    // Refetch documents to get the latest state
    try {
      const docsRes = await fetch(`/api/documents?course_id=${courseId}`);
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        const docs = docsData.documents || [];
        console.log('[courses] Refetched', docs.length, 'documents');

        // Update state with fresh documents
        setDocuments(docs);

        // Now fetch concepts for these fresh documents
        await fetchConceptsForDocuments(docs);
      } else {
        console.error('[courses] Failed to refetch documents:', docsRes.status);
      }
    } catch (error) {
      console.error('[courses] Error refetching documents:', error);
    }
  }

  function handleStartStudy(documentId: string, chapter: string | null) {
    router.push(`/learn?document_id=${documentId}&chapter=${encodeURIComponent(chapter || '')}`);
  }

  async function generateLessonForSection(section: SectionWithMastery, documentId: string, chapter: string | null) {
    console.log(`[courses] Generating lesson for section ${section.name}`);

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
        const data = await res.json();
        console.log('[courses] Received response:', data);

        // Check if it's a job (async generation) or existing lesson
        if (data.job_id) {
          // Lesson is being generated - add to processing jobs
          console.log(`[courses] Lesson generation queued: job_id=${data.job_id}`);

          // Store job in sessionStorage for persistence
          if (typeof window !== 'undefined') {
            const jobData = {
              job_id: data.job_id,
              document_id: documentId,
              section_id: section.id,
              section_name: section.name,
              section_number: section.section_number,
              chapter: chapter || null,
              course_id: courseId
            };
            sessionStorage.setItem(`lesson-job-${data.job_id}`, JSON.stringify(jobData));
          }

          // Add to processing jobs state
          setProcessingJobs(prev => [...prev, {
            job_id: data.job_id,
            document_id: documentId,
            section_id: section.id,
            section_name: section.name,
            section_number: section.section_number,
            type: 'lesson',
            progress: 0,
            status: 'queued',
            chapter: chapter || undefined
          }]);

          // Add to polling set to prevent duplicates
          pollingJobsRef.current.add(data.job_id);

          // Start polling for job completion
          createJobPoller(data.job_id, {
            interval: 2000,
            onProgress: (job: Job) => {
              console.log('[courses] Generation progress:', job.progress);
              updateJobProgress(data.job_id, job.progress, job.status);
            },
            onComplete: async (job: Job) => {
              console.log('[courses] Generation completed:', job);

              // Refresh concepts to show the new ones
              await fetchConceptsForCourse();

              // Remove from processing jobs
              pollingJobsRef.current.delete(data.job_id);
              removeProcessingJob(data.job_id);
            },
            onError: (error: string) => {
              console.error('[courses] Generation error:', error);
              pollingJobsRef.current.delete(data.job_id);
              removeProcessingJob(data.job_id);

              // Check if it's a retryable error
              const isOverloaded = error.includes('overloaded') || error.includes('503');

              if (isOverloaded) {
                const retry = confirm(
                  `⚠️ AI Service Temporarily Overloaded\n\n` +
                  `The AI service is currently experiencing high demand. ` +
                  `This usually resolves within a few seconds.\n\n` +
                  `Would you like to try again?`
                );

                if (retry) {
                  // Retry the generation
                  setTimeout(() => generateLessonForSection(section, documentId, chapter), 2000);
                }
              } else {
                alert(`Failed to generate lesson: ${error}\n\nPlease try again later.`);
              }
            }
          });
        } else if (data.lesson_id) {
          // Lesson already exists - navigate to it
          console.log(`[courses] Lesson already exists: lesson_id=${data.lesson_id}`);
          router.push(`/learn?document_id=${documentId}&chapter=${encodeURIComponent(chapter || '')}&section_id=${section.id}&concept_name=__section_overview__`);
        }
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Failed to generate lesson' }));
        const errorMessage = errorData.error || 'Failed to generate lesson';

        // Check if it's a retryable error
        const isOverloaded = errorMessage.includes('overloaded') || errorMessage.includes('503');

        if (isOverloaded) {
          const retry = confirm(
            `⚠️ AI Service Temporarily Overloaded\n\n` +
            `The AI service is currently experiencing high demand. ` +
            `This usually resolves within a few seconds.\n\n` +
            `Would you like to try again?`
          );

          if (retry) {
            // Retry the generation
            setTimeout(() => generateLessonForSection(section, documentId, chapter), 2000);
            return;
          }
        } else {
          alert(`Failed to generate lesson: ${errorMessage}\n\nPlease try again later.`);
        }
      }
    } catch (error) {
      console.error('[courses] Error generating lesson:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      // Check if it's a network error
      const isNetworkError = errorMsg.includes('network') || errorMsg.includes('fetch');

      if (isNetworkError) {
        const retry = confirm(
          `⚠️ Connection Error\n\n` +
          `Unable to reach the server. Please check your internet connection.\n\n` +
          `Would you like to try again?`
        );

        if (retry) {
          setTimeout(() => generateLessonForSection(section, documentId, chapter), 2000);
          return;
        }
      } else {
        alert('Failed to generate lesson. Please try again later.');
      }
    }
  }

  function openDeleteModal(documentId: string, title: string) {
    setDocumentToDelete({ id: documentId, title });
    setDeleteModalOpen(true);
  }

  // Helper function to render a document's study session (mastery grid)
  function renderDocumentSession(doc: Document, chapter: string) {
    const documentConcepts = conceptsByDocument[doc.id] || [];
    const documentSections = sectionsByDocument[doc.id] || [];

    const orderedConcepts = [...documentConcepts].sort((a, b) => {
      const sectionA = a.section_number ?? Number.MAX_SAFE_INTEGER;
      const sectionB = b.section_number ?? Number.MAX_SAFE_INTEGER;
      if (sectionA !== sectionB) {
        return sectionA - sectionB;
      }

      const conceptA = a.concept_number ?? Number.MAX_SAFE_INTEGER;
      const conceptB = b.concept_number ?? Number.MAX_SAFE_INTEGER;
      if (conceptA !== conceptB) {
        return conceptA - conceptB;
      }

      const lessonPosA = typeof a.lesson_position === 'number' ? a.lesson_position : Number.MAX_SAFE_INTEGER;
      const lessonPosB = typeof b.lesson_position === 'number' ? b.lesson_position : Number.MAX_SAFE_INTEGER;
      if (lessonPosA !== lessonPosB) {
        return lessonPosA - lessonPosB;
      }

      return a.name.localeCompare(b.name);
    });

    const orderedSections = [...documentSections].sort((a, b) => a.section_number - b.section_number);

    // Convert concepts to skills
    const conceptSkills: SkillSquare[] = orderedConcepts.map((concept) => ({
      id: concept.id,
      name: concept.name,
      masteryLevel: concept.mastery_level,
      sectionNumber: concept.section_number || undefined,
      sectionName: concept.section_name || undefined,
      conceptNumber: concept.concept_number ?? undefined,
      lessonPosition: typeof concept.lesson_position === 'number' ? concept.lesson_position : undefined,
      description: `${concept.section_name || 'Section'} - ${concept.accuracy}% accuracy`,
      onClick: () => {
        if (concept.section_id) {
          router.push(`/learn?document_id=${doc.id}&chapter=${encodeURIComponent(doc.chapter || '')}&section_id=${concept.section_id}&concept_name=${encodeURIComponent(concept.name)}`);
        } else {
          handleStartStudy(doc.id, doc.chapter);
        }
      }
    }));

    // Create section overview squares and add placeholders
    const skillsWithOverviews: SkillSquare[] = [];

    orderedSections.forEach((section) => {
      const isGenerating = processingJobs.some(job =>
        job.type === 'lesson' &&
        job.section_id === section.id &&
        (job.chapter || 'Uncategorized') === chapter &&
        job.status !== 'completed'
      );

      skillsWithOverviews.push({
        id: `overview-${section.id}`,
        name: `${section.name} - Overview`,
        masteryLevel: section.concepts_generated ? section.mastery_level : (isGenerating ? 'loading' : 'not_started'),
        sectionNumber: section.section_number,
        sectionName: section.name,
        description: section.concepts_generated
          ? (section.description || `Section ${section.section_number} Overview`)
          : isGenerating
          ? 'Generating concepts...'
          : `Click to generate section ${section.section_number}`,
        onClick: isGenerating ? undefined : () => {
          if (section.concepts_generated) {
            router.push(`/learn?document_id=${doc.id}&chapter=${encodeURIComponent(doc.chapter || '')}&section_id=${section.id}&concept_name=__section_overview__`);
          } else {
            generateLessonForSection(section, doc.id, doc.chapter);
          }
        },
        isOverview: true
      });

      if (isGenerating) {
        const job = processingJobs.find(j => j.section_id === section.id);
        const progress = job?.progress || 0;

        Array.from({ length: placeholdersPerRow }, (_, index) => {
          skillsWithOverviews.push({
            id: `loading-${section.id}-${index}`,
            name: section.name || 'Generating...',
            masteryLevel: 'loading' as MasteryLevel,
            sectionNumber: section.section_number,
            sectionName: section.name,
            description: `${section.name || 'Section'} - Generating... ${progress}%`,
            onClick: () => {}
          });
        });
      }

      const sectionConcepts = conceptSkills.filter(
        skill => skill.sectionNumber === section.section_number
      );
      skillsWithOverviews.push(...sectionConcepts);
    });

    const conceptsWithoutSection = conceptSkills.filter(skill => !skill.sectionNumber);
    skillsWithOverviews.push(...conceptsWithoutSection);

    return skillsWithOverviews;
  }

  async function handleDeleteDocument() {
    if (!documentToDelete) return;

    setDeleteError(null);

    try {
      const res = await fetch(`/api/documents/${documentToDelete.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to delete document');
      }

      const result = await res.json();
      console.log('Document deleted:', result);

      // Refresh the documents list
      fetchCourseData();
      setDocumentToDelete(null);
    } catch (error) {
      console.error('Failed to delete document:', error);
      setDeleteError(error instanceof Error ? error.message : 'Network error. Please check your connection.');
    }
  }

  async function handleViewMarkdown(chapterSourceId: string, documentTitle: string, chapterTitle: string) {
    try {
      const token = await getToken();
      if (!token) {
        alert('Authentication required');
        return;
      }

      const response = await fetch(`${getBackendUrl()}/tier2/chapter-markdown/${chapterSourceId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch markdown');
      }

      const data = await response.json();
      setMarkdownContent(data.markdown_content || '');
      setMarkdownTitle(`${documentTitle} - ${chapterTitle}`);
      setIsMarkdownViewerOpen(true);
    } catch (error) {
      console.error('[CoursePage] Error fetching markdown:', error);
      alert('Failed to load markdown content. Please try again.');
    }
  }

  async function handleReassignChapter(sourceId: string, newChapterNumber: number | null) {
    try {
      const token = await getToken();
      if (!token) {
        alert('Authentication required');
        return;
      }

      const response = await fetch(`${getBackendUrl()}/tier2/chapter-markdown/${sourceId}/reassign`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chapterNumber: newChapterNumber })
      });

      if (!response.ok) {
        throw new Error('Failed to reassign chapter');
      }

      console.log(`[CoursePage] Successfully reassigned source ${sourceId} to chapter ${newChapterNumber}`);

      // Refetch chapter sources to update UI
      await refetchChapterSources();
    } catch (error) {
      console.error('[CoursePage] Error reassigning chapter:', error);
      alert('Failed to reassign chapter. Please try again.');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="h-4 w-24 skeleton rounded" />
            <div className="h-9 w-64 skeleton rounded-lg" />
            <div className="h-4 w-48 skeleton rounded" />
          </div>
          <div className="h-10 w-40 skeleton rounded-lg" />
        </div>
        <div className="h-96 skeleton rounded-xl" />
      </div>
    );
  }

  if (!course) {
    return (
      <Card className="text-center py-16 animate-fade-in">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-20 h-20 bg-danger-100 dark:bg-danger-900/40 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-danger-600 dark:text-danger-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Course not found</h2>
          <p className="text-neutral-600 dark:text-neutral-300">
            The course you're looking for doesn't exist or has been deleted.
          </p>
        </div>
      </Card>
    );
  }

  // Group documents by chapter
  const documentsByChapter = documents.reduce((acc, doc) => {
    const chapter = doc.chapter || 'Uncategorized';
    if (!acc[chapter]) {
      acc[chapter] = [];
    }
    acc[chapter].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  // Include chapters from processing jobs that don't have documents yet
  processingJobs.forEach(job => {
    const chapter = job.chapter || 'Uncategorized';
    if (!documentsByChapter[chapter]) {
      documentsByChapter[chapter] = [];
    }
  });

  const chapters = Object.keys(documentsByChapter).sort((a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <div>
            <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">{course.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {course.code && (
                <Badge variant="primary" size="md">
                  {course.code}
                </Badge>
              )}
              {course.term && (
                <Badge variant="neutral" size="md">
                  {course.term}
                </Badge>
              )}
              {course.exam_date && (
                <Badge variant="warning" size="md" dot>
                  Exam: {(() => {
                    // Parse date string as local date to avoid timezone issues
                    // Handle both "YYYY-MM-DD" and ISO timestamp formats
                    const dateStr = course.exam_date.split('T')[0]; // Extract date part if ISO timestamp
                    const [year, month, day] = dateStr.split('-').map(Number);
                    const localDate = new Date(year, month - 1, day);
                    return localDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    });
                  })()}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button variant="primary" size="lg" onClick={() => isTier('tier2') ? setIsTier2UploadModalOpen(true) : setIsUploadModalOpen(true)}>
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {isTier('tier2') ? 'Upload Textbook/Lecture Note' : 'Upload Materials'}
        </Button>
      </div>

      {deleteError && (
        <div className="flex items-start gap-3 rounded-lg border border-danger-200 dark:border-danger-800/50 bg-danger-50 dark:bg-danger-900/20 p-4 animate-slide-down">
          <svg className="w-5 h-5 text-danger-600 dark:text-danger-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-danger-800 dark:text-danger-300">Delete Failed</p>
            <p className="text-sm text-danger-700 dark:text-danger-400 mt-1">{deleteError}</p>
          </div>
          <button
            onClick={() => setDeleteError(null)}
            className="text-danger-500 dark:text-danger-400 hover:text-danger-700 dark:hover:text-danger-300 transition-colors"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {documents.length === 0 && processingJobs.length === 0 ? (
        <Card className="text-center py-16 animate-fade-in">
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">No materials uploaded yet</h3>
            <p className="text-neutral-600 dark:text-neutral-300">
              Upload your textbooks, lecture notes, and practice problems to get started with AI-powered learning.
            </p>
            <Button variant="primary" size="lg" onClick={() => isTier('tier2') ? setIsTier2UploadModalOpen(true) : setIsUploadModalOpen(true)}>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {isTier('tier2') ? 'Upload Your First Textbook/Lecture Note' : 'Upload Your First Document'}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {chapters.map((chapter) => {
            // Get all tier 1 documents in this chapter
            const chapterDocs = documentsByChapter[chapter] || [];

            return (
              <div key={chapter} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                    {chapter === 'Uncategorized' ? chapter : `Chapter ${chapter}`}
                  </h2>
                </div>

                {/* Tier 1: Document-Based Study Sessions */}
                {chapterDocs.map((doc) => {
                  const skills = renderDocumentSession(doc, chapter);

                  // Skip rendering if document has no sections/concepts yet
                  if (skills.length === 0) return null;

                  return (
                    <div key={doc.id} ref={gridContainerRef} className="space-y-3">
                      {/* Document Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/40 rounded-lg flex items-center justify-center">
                            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                              {doc.title}
                            </h3>
                            {doc.material_type && (
                              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                {doc.material_type} • {doc.pages} pages
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={() => openDeleteModal(doc.id, doc.title)}
                          variant="danger"
                          size="sm"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </Button>
                      </div>

                      {/* Document Mastery Grid */}
                      <Card hover={false}>
                        <MasteryGrid
                          title="Concept Progress"
                          skills={skills}
                          showSectionDividers={true}
                        />
                      </Card>
                    </div>
                  );
                })}

                {/* Tier 2 Chapter Sources */}
                <div className="space-y-4">
                  {(() => {
                    // Extract chapter number from chapter string
                    // Handle both "Chapter 1" format, plain "1" format, and "Uncategorized"
                    let chapterKey: number | string | null = null;
                    if (chapter === 'Uncategorized') {
                      chapterKey = 'uncategorized';
                    } else {
                      const chapterMatch = chapter.match(/Chapter\s+(\d+)/i);
                      if (chapterMatch) {
                        chapterKey = parseInt(chapterMatch[1], 10);
                      } else {
                        // Try parsing directly as number (for plain "1", "2", etc.)
                        const parsed = parseInt(chapter, 10);
                        if (!isNaN(parsed)) {
                          chapterKey = parsed;
                        }
                      }
                    }
                    const sources = chapterKey ? chapterSources[chapterKey] : [];

                    // Only show section if there are tier 2 sources
                    if (!sources || sources.length === 0) return null;

                    return (
                      <>
                        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Tier 2 Sources</h3>
                        <div className="grid gap-4">
                          {sources.map((source) => (
                        <Card key={source.id} padding="md" hover className="group border-2 border-purple-200 dark:border-purple-800/50">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center">
                                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                  </svg>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                                      {source.documentTitle}
                                    </h4>
                                    <Badge variant="primary" size="sm">Tier 2</Badge>
                                  </div>
                                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                                    {source.chapterTitle}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    {source.pageStart && source.pageEnd && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                        Pages {source.pageStart}–{source.pageEnd}
                                      </span>
                                    )}
                                    {source.pageStart && source.pageEnd && (
                                      <span className="text-xs text-neutral-400 dark:text-neutral-600">•</span>
                                    )}
                                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                      {new Date(source.createdAt).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                      })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Chapter Reassignment Dropdown */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs text-neutral-600 dark:text-neutral-400">Move to:</label>
                                <select
                                  value={source.chapterNumber ?? 'uncategorized'}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const newChapter = value === 'uncategorized' ? null : parseInt(value, 10);
                                    handleReassignChapter(source.id, newChapter);
                                  }}
                                  className="text-sm border border-neutral-300 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 hover:border-primary-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                                >
                                  <option value="uncategorized">Uncategorized</option>
                                  {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                                    <option key={num} value={num}>Chapter {num}</option>
                                  ))}
                                </select>
                              </div>
                              <Button
                                onClick={() => handleViewMarkdown(source.id, source.documentTitle, source.chapterTitle)}
                                variant="primary"
                                size="sm"
                              >
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                View Markdown
                              </Button>
                            </div>
                          </div>
                        </Card>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDocumentToDelete(null);
        }}
        onConfirm={handleDeleteDocument}
        title="Delete Document"
        message={`Are you sure you want to delete "${documentToDelete?.title}"? This will permanently delete the document, all sections, all generated lessons, and the PDF file. This action cannot be undone.`}
        confirmText="Delete Document"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        preselectedCourseId={courseId}
      />

      {/* Tier 2 Upload Modal */}
      <Tier2UploadModal
        isOpen={isTier2UploadModalOpen}
        onClose={() => setIsTier2UploadModalOpen(false)}
        preselectedCourseId={courseId}
      />

      {/* Chapter Selection Modal (Tier 2 Multi-Chapter) */}
      {chapterSelectionData && (
        <ChapterSelectionModal
          isOpen={isChapterSelectionOpen}
          onClose={() => {
            setIsChapterSelectionOpen(false);
            setChapterSelectionData(null);
          }}
          documentId={chapterSelectionData.documentId}
          documentName={chapterSelectionData.documentName}
          storageKey={chapterSelectionData.storageKey}
          courseId={courseId}
          chapters={chapterSelectionData.chapters}
        />
      )}

      {/* Markdown Viewer Modal (Tier 2) */}
      <MarkdownViewerModal
        isOpen={isMarkdownViewerOpen}
        onClose={() => setIsMarkdownViewerOpen(false)}
        markdown={markdownContent}
        title={markdownTitle}
      />
    </div>
  );
}
