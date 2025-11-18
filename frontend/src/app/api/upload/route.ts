import { NextRequest, NextResponse } from 'next/server';

import { createProxyResponse } from '../_utils/proxy-response';
import { getBackendToken } from '../_utils/get-backend-token';
import { getBackendUrl } from '../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Increase timeout for larger PDF uploads
export const maxDuration = 60; // 60 seconds

export async function POST(request: NextRequest) {
  try {
    const token = await getBackendToken();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();

    // Check file size before forwarding (50MB limit)
    const file = formData.get('file') as File;
    if (file && file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50MB.' },
        { status: 413 }
      );
    }

    // Use new LLM-based structured extraction endpoint
    const backendResponse = await fetch(`${getBackendUrl()}/upload/pdf-structured`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    return createProxyResponse(backendResponse);
  } catch (error) {
    console.error('[api/upload] proxy failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'proxy_failed', detail: message },
      { status: 500 }
    );
  }
}
