import { NextRequest, NextResponse } from 'next/server';
import { createProxyResponse } from '../_utils/proxy-response';
import { getBackendToken } from '../_utils/get-backend-token';
import { getBackendUrl } from '../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/sections?document_id=X - Get sections for a document
export async function GET(request: NextRequest) {
  try {
    const token = await getBackendToken();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('document_id');

    if (!documentId) {
      return NextResponse.json({ error: 'document_id is required' }, { status: 400 });
    }

    const backendResponse = await fetch(
      `${getBackendUrl()}/sections?document_id=${encodeURIComponent(documentId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return createProxyResponse(backendResponse);
  } catch (error) {
    console.error('[api/sections] GET proxy failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'proxy_failed', detail: message },
      { status: 500 }
    );
  }
}
