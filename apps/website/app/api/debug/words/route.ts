// Historical diagnostic endpoint exposed samples of protected vocabulary without
// learner authentication. It must not serve learning content in any environment.
export async function GET(): Promise<Response> {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}
