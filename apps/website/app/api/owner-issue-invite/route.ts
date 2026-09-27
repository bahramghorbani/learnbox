// Legacy unauthenticated invite issuer is intentionally disabled. The owner-only
// /api/owner/alpha-invite route is the supported, authenticated issuance path.
export async function GET(): Promise<Response> {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}
