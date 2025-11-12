import { NextRequest, NextResponse } from 'next/server';
import { getBackendToken } from '../../_utils/get-backend-token';
import { getBackendUrl } from '../../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/lessons/concept-order?section_id=X
 * Returns just the concept names in lesson order for a given section
 */
export async function GET(request: NextRequest) {
  try {
    const token = await getBackendToken();
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get('section_id');

    if (!sectionId) {
      return NextResponse.json({ error: 'section_id is required' }, { status: 400 });
    }

    // Fetch lesson from backend
    const backendUrl = `${getBackendUrl()}/lessons?section_id=${encodeURIComponent(sectionId)}`;
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // No lesson exists yet for this section
      return NextResponse.json({ concept_names: [] });
    }

    const data = await response.json();
    const lesson = data.lesson || data;

    // Extract concept names in order
    const conceptNames: string[] = [];
    if (lesson.concepts && Array.isArray(lesson.concepts)) {
      for (const concept of lesson.concepts) {
        if (concept.name) {
          conceptNames.push(concept.name);
        }
      }
    }

    return NextResponse.json({ concept_names: conceptNames });
  } catch (error) {
    console.error('[api/lessons/concept-order] GET failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch concept order' },
      { status: 500 }
    );
  }
}
