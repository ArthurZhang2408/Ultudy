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

    // Check total file size before forwarding (50MB limit)
    const files = formData.getAll('files') as File[];
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    if (totalSize > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Total file size too large. Maximum total size is 50MB.' },
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
