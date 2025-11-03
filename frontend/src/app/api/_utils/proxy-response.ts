export function createProxyResponse(backendResponse: Response) {
  const headers = new Headers(backendResponse.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  headers.delete('connection');

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers
  });
}
