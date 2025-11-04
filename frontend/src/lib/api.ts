export function getBackendUrl() {
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
}

function parseErrorMessage(payload: unknown, status: number) {
  if (!payload) {
    return `Request failed with status ${status}`;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload === 'object' && payload && 'error' in payload) {
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === 'string' && errorValue.trim()) {
      return errorValue;
    }
  }

  return `Request failed with status ${status}`;
}

/**
 * API client for calling Next.js API routes from the browser.
 * @param path - API endpoint path
 * @param init - Fetch options
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || undefined);

  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!headers.has('Content-Type') && init.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, response.status));
  }

  return payload as T;
}
