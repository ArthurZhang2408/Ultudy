import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
  const cookieHeader = request.headers.get('cookie') || '';

  try {
    const response = await fetch(`${backendUrl}/lessons/${params.id}`, {
      method: 'DELETE',
      headers: {
        'Cookie': cookieHeader,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error deleting lesson:', error);
    return NextResponse.json(
      { error: 'Failed to delete lesson' },
      { status: 500 }
    );
  }
}
