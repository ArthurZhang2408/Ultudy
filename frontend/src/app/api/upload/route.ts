import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { createProxyResponse } from '../_utils/proxy-response';
import { getBackendUrl } from '../../../lib/api';

export async function POST(request: NextRequest) {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();

  const backendResponse = await fetch(`${getBackendUrl()}/upload/pdf`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  return createProxyResponse(backendResponse);
}
