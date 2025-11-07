import { NextRequest, NextResponse } from 'next/server';
import { createProxyResponse } from '../../_utils/proxy-response';
import { getBackendToken } from '../../_utils/get-backend-token';
import { getBackendUrl } from '../../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sections/generate - Extract sections from document
export async function POST(request: NextRequest) {
  try {
    const token = await getBackendToken();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const backendResponse = await fetch(`${getBackendUrl()}/sections/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return createProxyResponse(backendResponse);
  } catch (error) {
    console.error('[api/sections/generate] POST proxy failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'proxy_failed', detail: message },
      { status: 500 }
    );
  }
}
