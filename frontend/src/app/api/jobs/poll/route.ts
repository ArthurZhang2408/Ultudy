/**
 * Job Polling API Route
 * POST /api/jobs/poll - Poll multiple jobs at once
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { job_ids } = body;

    if (!Array.isArray(job_ids) || job_ids.length === 0) {
      return NextResponse.json(
        { error: 'job_ids array is required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/jobs/poll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId
      },
      body: JSON.stringify({ job_ids })
    });

    if (!response.ok) {
      throw new Error('Failed to poll jobs');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error polling jobs:', error);
    return NextResponse.json(
      { error: 'Failed to poll jobs' },
      { status: 500 }
    );
  }
}
