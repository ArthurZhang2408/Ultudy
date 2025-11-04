import { NextRequest, NextResponse } from 'next/server';
import { createProxyResponse } from '../../_utils/proxy-response';
import { getBackendToken } from '../../_utils/get-backend-token';
import { getBackendUrl } from '../../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/progress/overview - Get user's progress dashboard
export async function GET(request: NextRequest) {
  try {
    const token = await getBackendToken();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Forward query parameters (e.g., course_id)
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const url = `${getBackendUrl()}/progress/overview${queryString ? `?${queryString}` : ''}`;

    const backendResponse = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return createProxyResponse(backendResponse);
  } catch (error) {
    console.error('[api/progress/overview] GET proxy failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'proxy_failed', detail: message },
      { status: 500 }
    );
  }
}
