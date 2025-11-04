import { NextRequest, NextResponse } from 'next/server';
import { createProxyResponse } from '../../../_utils/proxy-response';
import { getBackendToken } from '../../../_utils/get-backend-token';
import { getBackendUrl } from '../../../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/documents/:id/metadata - Update document metadata
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const token = await getBackendToken();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const backendResponse = await fetch(`${getBackendUrl()}/documents/${id}/metadata`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return createProxyResponse(backendResponse);
  } catch (error) {
    console.error('[api/documents/:id/metadata] POST proxy failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'proxy_failed', detail: message },
      { status: 500 }
    );
  }
}
