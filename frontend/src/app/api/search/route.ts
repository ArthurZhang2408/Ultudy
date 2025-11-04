import { NextRequest, NextResponse } from 'next/server';

import { createProxyResponse } from '../_utils/proxy-response';
import { getBackendToken } from '../_utils/get-backend-token';
import { getBackendUrl } from '../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = await getBackendToken();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backendUrl = new URL(`${getBackendUrl()}/search`);
    request.nextUrl.searchParams.forEach((value, key) => {
      backendUrl.searchParams.append(key, value);
    });

    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    return createProxyResponse(backendResponse);
  } catch (error) {
    console.error('[api/search] proxy failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'proxy_failed', detail: message },
      { status: 500 }
    );
  }
}
