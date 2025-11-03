import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { createProxyResponse } from '../../_utils/proxy-response';
import { getBackendUrl } from '../../../../lib/api';

export async function POST(request: NextRequest) {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.text();
  const contentType = request.headers.get('content-type') ?? 'application/json';

  const backendResponse = await fetch(`${getBackendUrl()}/study/lesson`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType
    },
    body
  });

  return createProxyResponse(backendResponse);
}
