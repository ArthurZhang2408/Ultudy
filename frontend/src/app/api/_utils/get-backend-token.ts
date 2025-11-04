import { auth } from '@clerk/nextjs/server';

const tokenTemplate =
  process.env.CLERK_JWT_TEMPLATE ?? process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE;

export async function getBackendToken() {
  const { userId, getToken } = await auth();

  if (!userId) {
    return null;
  }

  if (typeof getToken !== 'function') {
    throw new Error('Clerk getToken helper is unavailable in this runtime');
  }

  return tokenTemplate ? getToken({ template: tokenTemplate }) : getToken();
}
