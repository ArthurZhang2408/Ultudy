import { NextResponse } from 'next/server';

import { createProxyResponse } from '../../_utils/proxy-response';
import { getBackendToken } from '../../_utils/get-backend-token';
import { getBackendUrl } from '../../../../lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const token = await getBackendToken();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backendResponse = await fetch(`${getBackendUrl()}/admin/embed-probe`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    return createProxyResponse(backendResponse);
  } catch (error) {
    console.error('[api/admin/embed-probe] proxy failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'proxy_failed', detail: message },
      { status: 500 }
    );
  }
}
