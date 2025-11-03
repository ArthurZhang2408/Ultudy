import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { createProxyResponse } from '../_utils/proxy-response';
import { getBackendUrl } from '../../../lib/api';

export async function GET(request: NextRequest) {
  const { getToken } = await auth();
  const token = await getToken();

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
}
