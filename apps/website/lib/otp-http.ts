type OtpPurpose = 'sign_in';

type RequestChallengeInput = {
  phoneE164: string;
  clientIpHash: string;
  purpose: OtpPurpose;
};

type RequestChallengeOutcome =
  | {
      status: 'created';
      challengeId: string;
      expiresAt: Date;
      resendAvailableAt: Date;
    }
  | { status: 'rate_limited'; scope: 'phone' | 'ip'; retryAfterMs: number };

type VerifyChallengeInput = {
  challengeId: string;
  code: string;
  purpose: OtpPurpose;
};

type VerifyChallengeOutcome = { status: 'verified'; phoneHash: string } | { status: 'rejected' };

export type OtpHttpDependencies = {
  hashClientIp(clientIp: string): string;
  requestChallenge(input: RequestChallengeInput): Promise<RequestChallengeOutcome>;
  verifyChallenge(input: VerifyChallengeInput): Promise<VerifyChallengeOutcome>;
  createSession(subject: string): string;
};

const jsonHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

export async function handleOtpRequest(
  request: Request,
  dependencies: OtpHttpDependencies,
): Promise<Response> {
  if (!isTrustedJsonPost(request)) return jsonResponse({ error: 'request_rejected' }, 403);

  const body = await readJsonObject(request);
  const phoneE164 = normalizeIranianPhone(body?.phone);
  const clientIp = readClientIp(request);
  if (!phoneE164 || !clientIp) return jsonResponse({ error: 'request_invalid' }, 400);

  try {
    const outcome = await dependencies.requestChallenge({
      phoneE164,
      clientIpHash: dependencies.hashClientIp(clientIp),
      purpose: 'sign_in',
    });
    if (outcome.status === 'rate_limited') {
      return jsonResponse({ error: 'request_limited' }, 429, {
        'retry-after': String(Math.ceil(outcome.retryAfterMs / 1000)),
      });
    }
    return jsonResponse(
      {
        challengeId: outcome.challengeId,
        expiresAt: outcome.expiresAt.toISOString(),
        resendAvailableAt: outcome.resendAvailableAt.toISOString(),
      },
      201,
    );
  } catch {
    return jsonResponse({ error: 'delivery_unavailable' }, 503);
  }
}

export async function handleOtpVerification(
  request: Request,
  dependencies: OtpHttpDependencies,
): Promise<Response> {
  if (!isTrustedJsonPost(request)) return jsonResponse({ error: 'request_rejected' }, 403);

  const body = await readJsonObject(request);
  const challengeId = typeof body?.challengeId === 'string' ? body.challengeId : '';
  const code = normalizeDigits(body?.code);
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(challengeId) || !/^\d{5}$/.test(code)) {
    return jsonResponse({ error: 'verification_failed' }, 400);
  }

  try {
    const outcome = await dependencies.verifyChallenge({ challengeId, code, purpose: 'sign_in' });
    if (outcome.status !== 'verified') {
      return jsonResponse({ error: 'verification_failed' }, 400);
    }

    const cookie = serializeSessionCookie(dependencies.createSession(outcome.phoneHash), request);
    return new Response(null, {
      status: 204,
      headers: { 'cache-control': 'no-store', 'set-cookie': cookie },
    });
  } catch {
    return jsonResponse({ error: 'verification_unavailable' }, 503);
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

function normalizeIranianPhone(value: unknown): string | null {
  const digits = normalizeDigits(value).replace(/\D/g, '');
  const national = digits.startsWith('0') ? digits.slice(1) : digits;
  return /^9\d{9}$/.test(national) ? `+98${national}` : null;
}

function normalizeDigits(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function readClientIp(request: Request): string | null {
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length <= 128 ? first : null;
}

function serializeSessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `learnbox_alpha_session=${token}; Path=/; Max-Age=28800; HttpOnly${secure}; SameSite=Lax`;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, { status, headers: { ...jsonHeaders, ...extraHeaders } });
}
