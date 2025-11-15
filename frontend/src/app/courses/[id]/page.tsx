'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { MasteryGrid, type SkillSquare, type MasteryLevel } from '../../../components/MasteryGrid';
import { Button, Card, Badge, ConfirmModal } from '@/components/ui';
import { createJobPoller, type Job } from '@/lib/jobs';

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
  title: string;
  type: 'upload';
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{ id: string; title: string } | null>(null);
  const [processingJobs, setProcessingJobs] = useState<ProcessingJob[]>([]);
  const pollingJobsRef = useRef<Set<string>>(new Set());

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
        // Refresh course data to show the new document
        fetchCourseData();
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

  function loadProcessingJobs() {
    try {
      const stored = sessionStorage.getItem('processingJobs');
      if (stored) {
        const allJobs = JSON.parse(stored);
        const courseJobs = allJobs.filter((job: any) => job.course_id === courseId);
        setProcessingJobs(courseJobs.map((job: any) => ({
          ...job,
          progress: 0,
          status: 'queued'
        })));

        // Start polling for each job
        courseJobs.forEach((job: any) => {
          createJobPoller(job.job_id, {
            interval: 2000,
            onProgress: (jobData: Job) => {
              updateJobProgress(job.job_id, jobData.progress, jobData.status);
            },
            onComplete: (jobData: Job) => {
              removeProcessingJob(job.job_id);
              fetchCourseData();
            },
            onError: (error: string) => {
              console.error('Job error:', error);
              removeProcessingJob(job.job_id);
            }
          });
        });
      }
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
      const stored = sessionStorage.getItem('processingJobs');
      if (stored) {
        const allJobs = JSON.parse(stored);
        const updated = allJobs.filter((job: any) => job.job_id !== jobId);
        sessionStorage.setItem('processingJobs', JSON.stringify(updated));
      }
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

        // Fetch concept mastery data for each document
        const conceptPromises = docs.map(async (doc: Document) => {
          try {
            const masteryUrl = doc.chapter
              ? `/api/concepts/mastery?document_id=${doc.id}&chapter=${encodeURIComponent(doc.chapter)}`
              : `/api/concepts/mastery?document_id=${doc.id}`;

            const res = await fetch(masteryUrl);

            if (res.ok) {
              const data = await res.json();
              const chapterKey = doc.chapter || 'Uncategorized';
              return { chapterKey, concepts: data.concepts || [] };
            }
          } catch (error) {
            console.error(`Failed to fetch concept mastery for document ${doc.id}:`, error);
          }
          return null;
        });

        const conceptResults = await Promise.all(conceptPromises);
        const conceptsMap: Record<string, ConceptWithMastery[]> = {};

        // Deduplicate concepts by ID
        const seenConceptIds = new Set<string>();

        for (const result of conceptResults) {
          if (result) {
            if (!conceptsMap[result.chapterKey]) {
              conceptsMap[result.chapterKey] = [];
            }

            // Only add concepts we haven't seen before
            for (const concept of result.concepts) {
              if (!seenConceptIds.has(concept.id)) {
                seenConceptIds.add(concept.id);
                conceptsMap[result.chapterKey].push(concept);
              }
            }
          }
        }

        setConceptsByChapter(conceptsMap);
      }
    } catch (error) {
      console.error('Failed to fetch course data:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleStartStudy(documentId: string, chapter: string | null) {
    router.push(`/learn?document_id=${documentId}&chapter=${encodeURIComponent(chapter || '')}`);
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
          <Link href="/courses">
            <Button variant="primary">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Courses
            </Button>
          </Link>
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
        <div className="space-y-3">
          <Link href="/courses" className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300 hover:text-primary-700 dark:hover:text-primary-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to courses
          </Link>
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
                  Exam: {new Date(course.exam_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Link href={`/upload?course_id=${course.id}`}>
          <Button variant="primary" size="lg">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Materials
          </Button>
        </Link>
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

      {documents.length === 0 ? (
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
            <Link href={`/upload?course_id=${course.id}`}>
              <Button variant="primary" size="lg">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Your First Document
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {chapters.map((chapter) => {
            const chapterConcepts = conceptsByChapter[chapter] || [];

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

            // Convert concepts to skills for the mastery grid
            const skills: SkillSquare[] = orderedConcepts.map((concept) => {
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

            return (
              <div key={chapter} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                    {chapter === 'Uncategorized' ? chapter : `Chapter ${chapter}`}
                  </h2>
                  <Button
                    onClick={() => {
                      const doc = documentsByChapter[chapter]?.[0];
                      if (doc) {
                        handleStartStudy(doc.id, doc.chapter);
                      }
                    }}
                    variant="primary"
                    disabled={processingJobs.some(job => (job.chapter || 'Uncategorized') === chapter)}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    {processingJobs.some(job => (job.chapter || 'Uncategorized') === chapter) ? 'Processing...' : 'Start Studying'}
                  </Button>
                </div>

                {/* Concept Mastery Grid */}
                {skills.length > 0 && (
                  <Card hover={false}>
                    <MasteryGrid
                      title="Concept Progress"
                      skills={skills}
                      columns={15}
                      showSectionDividers={true}
                    />
                  </Card>
                )}

                {/* Documents List */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Course Materials</h3>
                  <div className="grid gap-4">
                    {/* Processing Jobs - Filter by chapter */}
                    {processingJobs.filter(job => (job.chapter || 'Uncategorized') === chapter).map((job) => (
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
                                  <Badge variant="primary" size="sm">
                                    Processing...
                                  </Badge>
                                  <span className="text-xs text-primary-700 dark:text-primary-400">
                                    {job.status === 'processing' ? `${job.progress}%` : job.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {/* Progress bar */}
                            {job.status === 'processing' && (
                              <div className="w-full bg-primary-200 dark:bg-primary-800 rounded-full h-2">
                                <div
                                  className="bg-primary-600 dark:bg-primary-500 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${job.progress}%` }}
                                />
                              </div>
                            )}
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
    </div>
  );
}
