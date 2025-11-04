// frontend/src/app/api/whoami/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId, getToken } = await auth();  // <-- await here
  const token = await getToken().catch(() => null);
  return NextResponse.json({ userId: userId ?? null, hasToken: !!token });
}
