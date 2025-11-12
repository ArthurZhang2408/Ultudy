import { NextRequest, NextResponse } from 'next/server';
import { getBackendToken } from '../../_utils/get-backend-token';
import { getBackendUrl } from '../../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MasteryLevel = 'not_started' | 'introduced' | 'understood' | 'proficient' | 'mastered';

// GET /api/sections/mastery?document_id=X&chapter=Y - Get sections with mastery info
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

    // Fetch sections
    const sectionsUrl = chapter
      ? `${getBackendUrl()}/sections?document_id=${encodeURIComponent(documentId)}&chapter=${encodeURIComponent(chapter)}`
      : `${getBackendUrl()}/sections?document_id=${encodeURIComponent(documentId)}`;

    const sectionsResponse = await fetch(sectionsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!sectionsResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: sectionsResponse.status });
    }

    const sectionsData = await sectionsResponse.json();
    const sections = sectionsData.sections || [];

    // Fetch progress data to get concept mastery
    const progressUrl = `${getBackendUrl()}/progress/overview`;
    const progressResponse = await fetch(progressUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    let conceptMastery: Record<string, { mastery_state: string; accuracy: number }> = {};

    if (progressResponse.ok) {
      const progressData = await progressResponse.json();

      // Build a map of concept_id -> mastery data
      if (progressData.content_mastery?.by_chapter) {
        for (const chapterData of Object.values(progressData.content_mastery.by_chapter) as any[]) {
          if (chapterData.concepts) {
            for (const concept of chapterData.concepts) {
              conceptMastery[concept.id] = {
                mastery_state: concept.mastery_state,
                accuracy: concept.accuracy || 0
              };
            }
          }
        }
      }
    }

    // Calculate mastery level for each section based on its concepts
    const sectionsWithMastery = sections.map((section: any) => {
      let masteryLevel: MasteryLevel = 'not_started';

      // If section has been studied (concepts_generated is true), determine mastery
      if (section.concepts_generated) {
        // For now, mark as 'introduced' if concepts exist
        // This will be updated when we have actual concept mastery data per section
        masteryLevel = 'introduced';
      }

      return {
        id: section.id,
        section_number: section.section_number,
        name: section.name,
        description: section.description,
        mastery_level: masteryLevel,
        concepts_generated: section.concepts_generated,
        page_start: section.page_start,
        page_end: section.page_end
      };
    });

    return NextResponse.json({
      sections: sectionsWithMastery,
      document_id: documentId,
      chapter
    });
  } catch (error) {
    console.error('[api/sections/mastery] GET failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'fetch_failed', detail: message },
      { status: 500 }
    );
  }
}
