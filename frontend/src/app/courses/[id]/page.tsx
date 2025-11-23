'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { MasteryGrid, type SkillSquare, type MasteryLevel } from '../../../components/MasteryGrid';
import { Button, Card, Badge, ConfirmModal, UploadModal } from '@/components/ui';
import { createJobPoller, type Job } from '@/lib/jobs';
import { FormattedText } from '@/components/FormattedText';

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

type ChapterInfo = {
  chapter_number: string;
  title: string;
  page_start: number;
  page_end: number;
  status: 'queued' | 'processing' | 'completed';
  section_id?: string;
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
  // Chapter extraction metadata
  phase?: 'chapters_detected' | 'extracting_chapters';
  chapters_list?: ChapterInfo[];
  total_chapters?: number;
  current_chapter?: number;
  current_chapter_info?: ChapterInfo;
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

type SectionWithMastery = {
  id: string;
  section_number: number;
  name: string;
  description: string | null;
  mastery_level: MasteryLevel;
  concepts_generated: boolean;
  page_start: number | null;
  page_end: number | null;
  markdown_text?: string; // 🆕 TESTING: Chapter markdown for debugging
  chapter?: string; // 🆕 TESTING: Chapter number
};

export default function CoursePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = params.id as string;
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [conceptsByChapter, setConceptsByChapter] = useState<Record<string, ConceptWithMastery[]>>({});
  const [sectionsByChapter, setSectionsByChapter] = useState<Record<string, SectionWithMastery[]>>({});
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{ id: string; title: string } | null>(null);
  const [processingJobs, setProcessingJobs] = useState<ProcessingJob[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const pollingJobsRef = useRef<Set<string>>(new Set());
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [placeholdersPerRow, setPlaceholdersPerRow] = useState(14); // Default fallback
  const [showRawMarkdown, setShowRawMarkdown] = useState<Record<string, boolean>>({}); // Track raw/rendered per section

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
        console.log('[courses] Upload progress:', job.progress, job.status, 'data:', job.data);
        updateJobProgress(uploadJobId, job.progress, job.status, job.data);
      },
      onComplete: async (job: Job) => {
        console.log('[courses] Upload completed:', job);
        pollingJobsRef.current.delete(uploadJobId);

        // Remove all chapter jobs for this upload (if multi-chapter PDF)
        setProcessingJobs(prev => prev.filter(j =>
          j.job_id !== uploadJobId && !j.job_id.startsWith(`${uploadJobId}-ch-`)
        ));

        // Refresh course data FIRST to show the new document
        await fetchCourseData();
        // Then remove processing job to avoid "No material uploaded yet" flash
        removeProcessingJob(uploadJobId);
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

        // Also check for chapter jobs (multi-chapter PDFs)
        // If chapter jobs exist, we need to keep polling the parent job
        const parentJobsWithChapters: string[] = [];
        courseUploadJobs.forEach((parentJob: any) => {
          const chapterJobsKey = `chapter-jobs-${parentJob.job_id}`;
          const chapterJobsStored = sessionStorage.getItem(chapterJobsKey);
          if (chapterJobsStored) {
            try {
              const chapterJobsData = JSON.parse(chapterJobsStored);
              const chapterJobs = chapterJobsData.map((chJob: any) => ({
                job_id: chJob.job_id,
                document_id: chJob.document_id,
                title: chJob.title,
                type: 'upload' as const,
                progress: 0,
                status: 'queued',
                chapter: chJob.chapter,
                phase: 'extracting_chapters'
              }));
              allJobs.push(...chapterJobs);
              console.log('[courses] Loaded', chapterJobs.length, 'chapter jobs for parent job', parentJob.job_id);

              // Keep track of parent jobs with chapters (don't show them in UI, but keep polling them)
              parentJobsWithChapters.push(parentJob.job_id);
            } catch (e) {
              console.error('[courses] Failed to parse chapter jobs:', e);
            }
          }
        });

        // Remove parent jobs from display (but we'll still poll them)
        const jobsToDisplay = allJobs.filter(job => !parentJobsWithChapters.includes(job.job_id));
        allJobs.length = 0;
        allJobs.push(...jobsToDisplay);

        // Start polling for parent jobs with chapters
        parentJobsWithChapters.forEach(parentJobId => {
          if (pollingJobsRef.current.has(parentJobId)) {
            return; // Already polling
          }

          console.log('[courses] Starting poller for parent job with chapters:', parentJobId);
          pollingJobsRef.current.add(parentJobId);

          createJobPoller(parentJobId, {
            interval: 2000,
            onProgress: (jobData: Job) => {
              console.log('[courses] Parent job progress:', jobData.progress, jobData.data);
              updateJobProgress(parentJobId, jobData.progress, jobData.status, jobData.data);
            },
            onComplete: async (jobData: Job) => {
              console.log('[courses] Parent job completed');
              pollingJobsRef.current.delete(parentJobId);

              // Remove all chapter jobs
              setProcessingJobs(prev => prev.filter(j => !j.job_id.startsWith(`${parentJobId}-ch-`)));

              // Refresh and cleanup
              await fetchCourseData();
              removeProcessingJob(parentJobId);
            },
            onError: (error: string) => {
              console.error('[courses] Parent job error:', error);
              pollingJobsRef.current.delete(parentJobId);
              removeProcessingJob(parentJobId);
            }
          });
        });
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

      // IMPORTANT: Use callback form to avoid overwriting jobs that were added from URL
      setProcessingJobs(prev => {
        // Keep any jobs that are already being polled (from URL redirect)
        const existingJobIds = prev.map(j => j.job_id);
        const newJobs = allJobs.filter(j => !existingJobIds.includes(j.job_id));

        console.log('[courses] Merging', newJobs.length, 'new jobs with', prev.length, 'existing jobs');
        return [...prev, ...newJobs];
      });

      // Start polling for each job (but NOT chapter jobs - they're polled via parent job)
      allJobs.forEach((job) => {
        // Skip chapter jobs - they're UI-only constructs, polled via parent job
        if (job.job_id.includes('-ch-')) {
          console.log('[courses] Skipping poller for chapter job (polled via parent):', job.job_id);
          return;
        }

        if (pollingJobsRef.current.has(job.job_id)) {
          return; // Already polling
        }

        pollingJobsRef.current.add(job.job_id);

        createJobPoller(job.job_id, {
          interval: 2000,
          onProgress: (jobData: Job) => {
            updateJobProgress(job.job_id, jobData.progress, jobData.status, jobData.data);
          },
          onComplete: async (jobData: Job) => {
            pollingJobsRef.current.delete(job.job_id);

            // For lesson generation, refresh concepts FIRST, then remove job
            if (job.type === 'lesson') {
              console.log('[courses] Lesson generation completed, refreshing concepts');
              await fetchConceptsForCourse();
              console.log('[courses] Concepts refreshed, removing job from UI');
              removeProcessingJob(job.job_id);
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

  function updateJobProgress(jobId: string, progress: number, status: string, metadata?: any) {
    console.log('[courses] updateJobProgress called:', { jobId, progress, status, metadata });

    setProcessingJobs(prev => {
      let updated = [...prev];

      // Handle chapters_detected: create separate job for each chapter
      if (metadata?.phase === 'chapters_detected' && metadata.chapters_list) {
        console.log('[courses] ✅ Chapters detected! Creating', metadata.chapters_list.length, 'individual chapter jobs');

        // Find the parent job
        const parentJob = updated.find(j => j.job_id === jobId);
        if (!parentJob) {
          console.warn('[courses] ⚠️ Parent job not found in state:', jobId);
          return prev;
        }

        console.log('[courses] Parent job found:', parentJob);

        // Remove the parent job (we'll show individual chapter jobs instead)
        updated = updated.filter(j => j.job_id !== jobId);

        // Create individual jobs for each chapter
        const chapterJobs: ProcessingJob[] = metadata.chapters_list.map((ch: ChapterInfo) => ({
          job_id: `${jobId}-ch-${ch.chapter_number}`,
          document_id: parentJob.document_id,
          title: ch.title,
          type: 'upload' as const,
          progress: 0,
          status: 'queued',
          chapter: ch.chapter_number,
          phase: 'extracting_chapters',
          current_chapter_info: ch
        }));

        updated.push(...chapterJobs);
        console.log('[courses] ✅ Created chapter jobs:', chapterJobs.map(j => j.job_id));

        // Persist chapter jobs to sessionStorage
        try {
          const chapterJobsData = chapterJobs.map(job => ({
            job_id: job.job_id,
            parent_job_id: jobId,
            document_id: job.document_id,
            title: job.title,
            chapter: job.chapter,
            course_id: courseId
          }));
          sessionStorage.setItem(`chapter-jobs-${jobId}`, JSON.stringify(chapterJobsData));
          console.log('[courses] ✅ Persisted chapter jobs to sessionStorage');
        } catch (e) {
          console.error('[courses] ❌ Failed to persist chapter jobs:', e);
        }

        return updated;
      }

      // Handle chapter progress updates
      if (metadata?.current_chapter_info) {
        const chapterJobId = `${jobId}-ch-${metadata.current_chapter_info.chapter_number}`;
        console.log('[courses] 📊 Chapter progress update for:', chapterJobId, 'progress:', progress);

        // Check if chapter job exists
        const chapterJobExists = updated.some(j => j.job_id === chapterJobId);

        if (!chapterJobExists && metadata.chapters_list) {
          // Chapter jobs don't exist yet (probably missed chapters_detected after refresh)
          // Create them now using chapters_list from metadata
          console.log('[courses] 🔄 Chapter job missing! Creating all chapter jobs from chapters_list');

          const parentJob = updated.find(j => j.job_id === jobId);
          if (parentJob) {
            // Remove parent job
            updated = updated.filter(j => j.job_id !== jobId);

            // Create all chapter jobs
            const chapterJobs: ProcessingJob[] = metadata.chapters_list.map((ch: ChapterInfo) => ({
              job_id: `${jobId}-ch-${ch.chapter_number}`,
              document_id: parentJob.document_id,
              title: ch.title,
              type: 'upload' as const,
              progress: ch.chapter_number === metadata.current_chapter_info.chapter_number ? progress : 0,
              status: ch.chapter_number === metadata.current_chapter_info.chapter_number ? 'processing' : 'queued',
              chapter: ch.chapter_number,
              phase: 'extracting_chapters',
              current_chapter_info: ch
            }));

            updated.push(...chapterJobs);
            console.log('[courses] ✅ Created', chapterJobs.length, 'chapter jobs retroactively');

            // Persist to sessionStorage
            try {
              const chapterJobsData = chapterJobs.map(job => ({
                job_id: job.job_id,
                parent_job_id: jobId,
                document_id: job.document_id,
                title: job.title,
                chapter: job.chapter,
                course_id: courseId
              }));
              sessionStorage.setItem(`chapter-jobs-${jobId}`, JSON.stringify(chapterJobsData));
            } catch (e) {
              console.error('[courses] Failed to persist chapter jobs:', e);
            }
          }
        } else {
          // Update existing chapter job
          updated = updated.map(job => {
            if (job.job_id === chapterJobId) {
              console.log('[courses] ✅ Found matching chapter job, updating progress');
              return {
                ...job,
                progress: progress,
                status: 'processing',
                phase: 'extracting_chapters'
              };
            }
            return job;
          });
        }

        return updated;
      }

      // Handle chapter completion
      if (metadata?.completed_chapter) {
        const chapterJobId = `${jobId}-ch-${metadata.completed_chapter.chapter_number}`;
        console.log('[courses] ✅ Chapter completed:', chapterJobId);

        // Trigger refresh to show the new section
        console.log('[courses] Refreshing course data to show new chapter');
        fetchCourseData();

        // Remove the completed chapter job immediately
        updated = updated.filter(job => job.job_id !== chapterJobId);
        console.log('[courses] Removed completed chapter job from state');

        return updated;
      }

      // Default: update the job normally (for single-chapter uploads)
      return updated.map(job =>
        job.job_id === jobId ? { ...job, progress, status } : job
      );
    });
  }

  function removeProcessingJob(jobId: string) {
    setProcessingJobs(prev => prev.filter(job => job.job_id !== jobId && !job.job_id.startsWith(`${jobId}-ch-`)));

    // Also remove from session storage
    try {
      // Remove from upload jobs
      const stored = sessionStorage.getItem('processingJobs');
      if (stored) {
        const allJobs = JSON.parse(stored);
        const updated = allJobs.filter((job: any) => job.job_id !== jobId);
        sessionStorage.setItem('processingJobs', JSON.stringify(updated));
      }

      // Remove chapter jobs
      sessionStorage.removeItem(`chapter-jobs-${jobId}`);

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

      // Deduplicate concepts and sections by ID
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

          // Add unique concepts
          for (const concept of result.concepts) {
            if (!seenConceptIds.has(concept.id)) {
              seenConceptIds.add(concept.id);
              conceptsMap[result.chapterKey].push(concept);
            }
          }

          // Add unique sections
          for (const section of result.sections) {
            if (!seenSectionIds.has(section.id)) {
              seenSectionIds.add(section.id);
              sectionsMap[result.chapterKey].push(section);
            }
          }
        }
      }

      setConceptsByChapter(conceptsMap);
      setSectionsByChapter(sectionsMap);
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
              updateJobProgress(data.job_id, job.progress, job.status, job.data);
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
        <Button variant="primary" size="lg" onClick={() => setIsUploadModalOpen(true)}>
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload Materials
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
            <Button variant="primary" size="lg" onClick={() => setIsUploadModalOpen(true)}>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Your First Document
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {chapters.map((chapter) => {
            const chapterConcepts = conceptsByChapter[chapter] || [];
            const chapterSections = sectionsByChapter[chapter] || [];

            const orderedConcepts = [...chapterConcepts].sort((a, b) => {
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

            // Sort sections by section_number
            const orderedSections = [...chapterSections].sort((a, b) => a.section_number - b.section_number);

            // Convert concepts to skills for the mastery grid
            const conceptSkills: SkillSquare[] = orderedConcepts.map((concept) => {
              return {
                id: concept.id,
                name: concept.name,
                masteryLevel: concept.mastery_level,
                sectionNumber: concept.section_number || undefined,
                sectionName: concept.section_name || undefined,
                conceptNumber: concept.concept_number ?? undefined,
                lessonPosition: typeof concept.lesson_position === 'number' ? concept.lesson_position : undefined,
                description: `${concept.section_name || 'Section'} - ${concept.accuracy}% accuracy`,
                onClick: () => {
                  // Find the document for this chapter
                  const doc = documentsByChapter[chapter]?.[0];
                  if (doc) {
                    // Navigate to the specific concept using concept name (more robust than index)
                    if (concept.section_id) {
                      router.push(`/learn?document_id=${doc.id}&chapter=${encodeURIComponent(doc.chapter || '')}&section_id=${concept.section_id}&concept_name=${encodeURIComponent(concept.name)}`);
                    } else {
                      handleStartStudy(doc.id, doc.chapter);
                    }
                  }
                }
              };
            });

            // Group concepts by section and create section overview squares
            const skillsWithOverviews: SkillSquare[] = [];
            const doc = documentsByChapter[chapter]?.[0];

            // Add section overview squares before concepts, with loading placeholders if generating
            orderedSections.forEach((section) => {
              // Check if this section is currently generating
              const isGenerating = processingJobs.some(job =>
                job.type === 'lesson' &&
                job.section_id === section.id &&
                (job.chapter || 'Uncategorized') === chapter &&
                job.status !== 'completed'
              );

              // Add section overview square FIRST
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
                  if (doc) {
                    if (section.concepts_generated) {
                      // Navigate to overview page
                      router.push(`/learn?document_id=${doc.id}&chapter=${encodeURIComponent(doc.chapter || '')}&section_id=${section.id}&concept_name=__section_overview__`);
                    } else {
                      // Generate lesson and stay on this page
                      generateLessonForSection(section, doc.id, doc.chapter);
                    }
                  }
                },
                isOverview: true
              });

              // Add loading placeholders if generating (exactly one row dynamically calculated)
              if (isGenerating) {
                const job = processingJobs.find(j => j.section_id === section.id);
                const progress = job?.progress || 0;

                // Use dynamically calculated number of placeholders to fill exactly one row
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

              // Add concepts for this section
              const sectionConcepts = conceptSkills.filter(
                skill => skill.sectionNumber === section.section_number
              );
              skillsWithOverviews.push(...sectionConcepts);
            });

            // Add any concepts without a section (fallback)
            const conceptsWithoutSection = conceptSkills.filter(skill => !skill.sectionNumber);
            skillsWithOverviews.push(...conceptsWithoutSection);

            // Use skillsWithOverviews directly (loading placeholders are now integrated)
            const skills: SkillSquare[] = skillsWithOverviews;

            return (
              <div key={chapter} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                    {chapter === 'Uncategorized' ? chapter : `Chapter ${chapter}`}
                  </h2>
                </div>

                {/* 🎯 TESTING: Section Content Debugging Display (Grouped by Chapter) */}
                {orderedSections.some(s => s.markdown_text) && (
                  <div className="space-y-6">
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                        🧪 TESTING MODE: Section Content Preview
                      </h3>
                      <p className="text-xs text-yellow-700 dark:text-yellow-400">
                        This displays all sections extracted from the PDF, grouped by chapter. Hybrid extraction splits multi-chapter PDFs automatically.
                      </p>
                    </div>

                    {/* Group sections by chapter for display */}
                    {(() => {
                      // Group sections by their chapter field
                      const sectionsByChapter = orderedSections.reduce((acc, section) => {
                        if (!section.markdown_text) return acc;
                        const chapterNum = section.chapter || chapter || 'Unknown';

                        // Debug logging
                        console.log('[Course Page] Section:', section.name, 'chapter field:', section.chapter, 'using:', chapterNum);

                        if (!acc[chapterNum]) acc[chapterNum] = [];
                        acc[chapterNum].push(section);
                        return acc;
                      }, {} as Record<string, typeof orderedSections>);

                      return Object.entries(sectionsByChapter).map(([chapterNum, sections]) => (
                        <div key={chapterNum} className="space-y-4">
                          <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 dark:border-blue-600 p-4">
                            <h3 className="text-lg font-bold text-blue-900 dark:text-blue-200">
                              Chapter {chapterNum}
                            </h3>
                            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                              {sections.length} section{sections.length !== 1 ? 's' : ''} extracted
                              {sections[0]?.page_start && sections[0]?.page_end &&
                                ` • Pages ${sections[0].page_start}-${sections[0].page_end}`
                              }
                            </p>
                          </div>

                          {sections.map((section, idx) => {
                            const isRaw = showRawMarkdown[section.id] || false;
                            return (
                              <Card key={section.id} padding="lg" hover={false}>
                                <div className="space-y-4">
                                  <div className="border-b border-neutral-200 dark:border-neutral-700 pb-3">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-1 rounded">
                                            Section {idx + 1}
                                          </span>
                                          <h4 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                                            {section.name}
                                          </h4>
                                        </div>
                                        {section.description && (
                                          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                                            {section.description}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <Button
                                          onClick={() => setShowRawMarkdown(prev => ({
                                            ...prev,
                                            [section.id]: !isRaw
                                          }))}
                                          variant="secondary"
                                          size="sm"
                                        >
                                          {isRaw ? (
                                            <>
                                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                              </svg>
                                              Rendered
                                            </>
                                          ) : (
                                            <>
                                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                              </svg>
                                              Raw
                                            </>
                                          )}
                                        </Button>
                                        <div className="text-xs text-neutral-500 dark:text-neutral-500">
                                          {section.markdown_text?.length.toLocaleString() ?? 0} chars
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div className={isRaw ? "font-mono text-sm bg-neutral-50 dark:bg-neutral-900 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap" : "prose prose-neutral dark:prose-invert max-w-none"}>
                                    {section.markdown_text && (
                                      isRaw ? (
                                        <>{section.markdown_text}</>
                                      ) : (
                                        <FormattedText>{section.markdown_text}</FormattedText>
                                      )
                                    )}
                                  </div>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                )}

                {/* Concept Mastery Grid */}
                <div ref={gridContainerRef}>
                  <Card hover={false}>
                    <MasteryGrid
                      title="Concept Progress"
                      skills={skills}
                      showSectionDividers={true}
                    />
                  </Card>
                </div>

                {/* Documents List */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Course Materials</h3>
                  <div className="grid gap-4">
                    {/* Processing Jobs - Filter by chapter, exclude completed jobs, and hide if document already exists */}
                    {processingJobs.filter(job => {
                      // Filter by chapter and type
                      if ((job.chapter || 'Uncategorized') !== chapter || job.type !== 'upload') {
                        return false;
                      }
                      // Exclude completed jobs
                      if (job.status === 'completed') {
                        return false;
                      }
                      // Hide job if the document already exists in the documents list
                      const documentExists = documentsByChapter[chapter]?.some(doc => doc.id === job.document_id);
                      if (documentExists) {
                        return false;
                      }
                      return true;
                    }).map((job) => (
                      <Card key={job.job_id} padding="md" className="bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 w-10 h-10 bg-primary-500 dark:bg-primary-600 rounded-lg flex items-center justify-center animate-pulse">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold text-primary-900 dark:text-primary-300">
                                  {job.title}
                                </h4>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  {job.status === 'processing' ? (
                                    <>
                                      <Badge variant="warning" size="sm">
                                        Processing...
                                      </Badge>
                                      <svg className="w-4 h-4 text-warning-600 dark:text-warning-400 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                    </>
                                  ) : (
                                    <Badge variant="neutral" size="sm">
                                      Queued
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}

                    {documentsByChapter[chapter].map((doc) => (
                      <Card key={doc.id} padding="md" hover className="group">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 w-10 h-10 bg-primary-100 dark:bg-primary-900/40 rounded-lg flex items-center justify-center">
                                <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <div>
                                <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-primary-700 dark:group-hover:text-primary-400 transition-colors">
                                  {doc.title}
                                </h4>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  {doc.material_type && (
                                    <Badge variant="neutral" size="sm">
                                      {doc.material_type}
                                    </Badge>
                                  )}
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {doc.pages} pages
                                  </span>
                                  <span className="text-xs text-neutral-400 dark:text-neutral-600">•</span>
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {new Date(doc.uploaded_at).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                  </span>
                                </div>
                              </div>
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
                      </Card>
                    ))}
                  </div>
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
    </div>
  );
}
