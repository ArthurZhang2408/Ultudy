import { NextRequest, NextResponse } from 'next/server';
import { createProxyResponse } from '../../_utils/proxy-response';
import { getBackendToken } from '../../_utils/get-backend-token';
import { getBackendUrl } from '../../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/documents/:id - Get document by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = await getBackendToken();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backendResponse = await fetch(
      `${getBackendUrl()}/documents/${params.id}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return createProxyResponse(backendResponse);
  } catch (error) {
    console.error('[api/documents/[id]] GET proxy failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'proxy_failed', detail: message },
      { status: 500 }
    );
  }
}

// DELETE /api/documents/:id - Delete document and all related content
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = await getBackendToken();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backendResponse = await fetch(
      `${getBackendUrl()}/documents/${params.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return createProxyResponse(backendResponse);
  } catch (error) {
    console.error('[api/documents/[id]] DELETE proxy failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'proxy_failed', detail: message },
      { status: 500 }
    );
  }
}
