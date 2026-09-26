export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/logout — clears the session cookie */
export async function POST(): Promise<Response> {
  const isSecure = process.env.NODE_ENV === 'production';
  const cookie = `learnbox_alpha_session=; Path=/; Max-Age=0; HttpOnly${isSecure ? '; Secure' : ''}; SameSite=Lax`;
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': cookie, 'cache-control': 'no-store' },
  });
}
