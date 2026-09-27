// Disabled for Web/PWA v1: this legacy endpoint is not part of the canonical release.
export async function POST(): Promise<Response> {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
