import type { InviteCheckOutcome } from '../../api/dist/alpha/invite-access.service.js';

export type InviteHttpDependencies = {
  hashClientIp(clientIp: string): string;
  checkInvite(input: { code: string; ipHash: string }): Promise<InviteCheckOutcome>;
  consentVersion: string;
};

const jsonHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

export async function handleInviteCheck(
  request: Request,
  dependencies: InviteHttpDependencies,
): Promise<Response> {
  if (!isTrustedJsonPost(request)) return jsonResponse({ error: 'request_rejected' }, 403);

  const body = await readJsonObject(request);
  const code = typeof body?.code === 'string' ? body.code : '';
  const clientIp = readClientIp(request);
  if (!code || !clientIp) return jsonResponse({ error: 'invite_invalid' }, 400);

  try {
    const outcome = await dependencies.checkInvite({
      code,
      ipHash: dependencies.hashClientIp(clientIp),
    });
    if (outcome.status === 'invalid') {
      return jsonResponse({ error: 'invite_invalid' }, 400);
    }
    if (outcome.status === 'limited') {
      return jsonResponse({ error: 'invite_limited' }, 403);
    }
    if (outcome.status === 'rate_limited') {
      return jsonResponse({ error: 'invite_limited' }, 429, {
        'retry-after': String(Math.ceil(outcome.retryAfterMs / 1000)),
      });
    }
    return new Response(null, {
      status: 204,
      headers: { 'cache-control': 'no-store' },
    });
  } catch {
    return jsonResponse({ error: 'invite_unavailable' }, 503);
  }
}

function isTrustedJsonPost(request: Request): boolean {
  if (request.method !== 'POST') return false;
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return false;
  }
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readClientIp(request: Request): string | null {
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length <= 128 ? first : null;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, { status, headers: { ...jsonHeaders, ...extraHeaders } });
}
