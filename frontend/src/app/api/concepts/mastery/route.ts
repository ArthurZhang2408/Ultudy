import { NextRequest, NextResponse } from 'next/server';
import { getBackendToken } from '../../_utils/get-backend-token';
import { getBackendUrl } from '../../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MasteryLevel = 'not_started' | 'in_progress' | 'completed' | 'incorrect';

// GET /api/concepts/mastery?document_id=X&chapter=Y - Get concepts with mastery info
export async function GET(request: NextRequest) {
  try {
    const token = await getBackendToken();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('document_id');
    const chapter = searchParams.get('chapter');

    if (!documentId) {
      return NextResponse.json({ error: 'document_id is required' }, { status: 400 });
    }

    // Fetch progress data to get concept mastery (filtered by document_id)
    const progressUrl = `${getBackendUrl()}/progress/overview?document_id=${encodeURIComponent(documentId)}`;
    const progressResponse = await fetch(progressUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!progressResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch progress' }, { status: progressResponse.status });
    }

    const progressData = await progressResponse.json();

    // Build concept mastery data
    const concepts: any[] = [];

    if (progressData.content_mastery?.by_chapter) {
      for (const [chapterKey, chapterData] of Object.entries(progressData.content_mastery.by_chapter) as [string, any][]) {
        // Filter by chapter if specified
        if (chapter && chapterKey !== chapter) {
          continue;
        }

        if (chapterData.concepts) {
          for (const concept of chapterData.concepts) {
            // Determine mastery level based on check-in results
            let masteryLevel: MasteryLevel = 'not_started';

            const totalAttempts = concept.total_attempts || 0;
            const correctAttempts = concept.correct_attempts || 0;
            const accuracy = concept.accuracy || 0;

            if (totalAttempts === 0) {
              masteryLevel = 'not_started';
            } else if (accuracy === 100) {
              masteryLevel = 'completed';
            } else if (accuracy === 0) {
              masteryLevel = 'incorrect';
            } else {
              masteryLevel = 'in_progress';
            }

            concepts.push({
              id: concept.id,
              name: concept.name,
              chapter: chapterKey,
              section_id: concept.section_id || null,
              concept_number: concept.concept_number || null,
              mastery_level: masteryLevel,
              accuracy,
              total_attempts: totalAttempts,
              correct_attempts: correctAttempts
            });
          }
        }
      }
    }

    // Fetch sections to get section numbers for each concept
    const sectionsUrl = chapter
      ? `${getBackendUrl()}/sections?document_id=${encodeURIComponent(documentId)}&chapter=${encodeURIComponent(chapter)}`
      : `${getBackendUrl()}/sections?document_id=${encodeURIComponent(documentId)}`;

    const sectionsResponse = await fetch(sectionsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    let sectionMap: Record<string, { section_number: number; name: string }> = {};

    if (sectionsResponse.ok) {
      const sectionsData = await sectionsResponse.json();
      const sections = sectionsData.sections || [];

      for (const section of sections) {
        sectionMap[section.id] = {
          section_number: section.section_number,
          name: section.name
        };
      }
    }

    console.log('[concepts/mastery] Total concepts found:', concepts.length);
    console.log('[concepts/mastery] Section map:', sectionMap);
    console.log('[concepts/mastery] First concept section_id:', concepts[0]?.section_id);

    // Attach section info to concepts
    const conceptsWithSections = concepts.map(concept => {
      const hasSection = concept.section_id && sectionMap[concept.section_id];
      return {
        ...concept,
        section_number: hasSection ? sectionMap[concept.section_id].section_number : null,
        section_name: hasSection ? sectionMap[concept.section_id].name : null
      };
    });

    console.log('[concepts/mastery] First concept with section:', conceptsWithSections[0]);

    // Sort by chapter, section_number, then by concept_number (lesson order)
    // This preserves the order concepts appear in lessons
    conceptsWithSections.sort((a, b) => {
      if (a.chapter !== b.chapter) {
        return a.chapter.localeCompare(b.chapter, undefined, { numeric: true });
      }
      if (a.section_number !== b.section_number) {
        return (a.section_number || 999) - (b.section_number || 999);
      }
      // Sort by concept_number (from database) to preserve lesson order
      // Fallback to name if concept_number is missing (for old data)
      if (a.concept_number !== null && b.concept_number !== null) {
        return a.concept_number - b.concept_number;
      }
      if (a.concept_number !== null) return -1;
      if (b.concept_number !== null) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      concepts: conceptsWithSections,
      document_id: documentId,
      chapter
    });
  } catch (error) {
    console.error('[api/concepts/mastery] GET failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'fetch_failed', detail: message },
      { status: 500 }
    );
  }
}
