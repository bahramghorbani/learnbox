type OtpPurpose = 'sign_in';
type RequestChallengeOutcome =
  | { status: 'created'; challengeId: string; expiresAt: Date; resendAvailableAt: Date }
  | { status: 'rate_limited'; scope: 'phone' | 'ip'; retryAfterMs: number };
type VerifyOutcome =
  | { status: 'verified'; accessToken: string; refreshToken: string }
  | { status: 'verification_failed' };
type RefreshOutcome =
  | { status: 'rotated'; accessToken: string; refreshToken: string }
  | { status: 'authentication_failed' };

export type MobileAuthHttpDependencies = {
  hashClientIp(clientIp: string): string;
  requestChallenge(input: {
    phoneE164: string;
    clientIpHash: string;
    purpose: OtpPurpose;
  }): Promise<RequestChallengeOutcome>;
  verify(input: {
    challengeId: string;
    code: string;
    installationId: string;
    phone: string;
  }): Promise<VerifyOutcome>;
  refresh(input: { sessionId: string; refreshToken: string }): Promise<RefreshOutcome>;
  revoke(accessToken: string): Promise<boolean>;
};

type BoundaryOptions = { development?: boolean };
type JsonObject = Record<string, unknown>;
const maximumBodyBytes = 4096;
const jsonHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

export async function handleMobileOtpRequest(
  request: Request,
  dependencies: MobileAuthHttpDependencies,
  options: BoundaryOptions = {},
): Promise<Response> {
  const body = await readBody(request, ['phone'], options);
  const phoneE164 = body && normalizeIranianPhone(body.phone);
  const clientIp = readClientIp(request);
  if (!phoneE164 || !clientIp) return error('validation', 400);
  try {
    const outcome = await dependencies.requestChallenge({
      phoneE164,
      clientIpHash: dependencies.hashClientIp(clientIp),
      purpose: 'sign_in',
    });
    if (outcome.status === 'rate_limited') {
      return error('rateLimited', 429, {
        'retry-after': String(Math.ceil(outcome.retryAfterMs / 1000)),
      });
    }
    return json(
      {
        challengeId: outcome.challengeId,
        expiresAt: outcome.expiresAt.toISOString(),
        resendAvailableAt: outcome.resendAvailableAt.toISOString(),
      },
      201,
    );
  } catch {
    return error('serverUnavailable', 503);
  }
}

export async function handleMobileOtpVerification(
  request: Request,
  dependencies: MobileAuthHttpDependencies,
  options: BoundaryOptions = {},
): Promise<Response> {
  const body = await readBody(request, ['challengeId', 'code', 'installationId', 'phone'], options);
  if (!body) return error('validation', 400);
  const input = {
    challengeId: string(body.challengeId),
    code: normalizeDigits(body.code),
    installationId: string(body.installationId),
    phone: string(body.phone),
  };
  if (
    !/^[A-Za-z0-9_-]{16,128}$/.test(input.challengeId) ||
    !/^\d{5}$/.test(input.code) ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(input.installationId) ||
    !normalizeIranianPhone(input.phone)
  )
    return error('validation', 400);
  try {
    const outcome = await dependencies.verify(input);
    return outcome.status === 'verified'
      ? json({ accessToken: outcome.accessToken, refreshToken: outcome.refreshToken }, 200)
      : error('invalidChallenge', 400);
  } catch {
    return error('serverUnavailable', 503);
  }
}

export async function handleMobileSessionRefresh(
  request: Request,
  dependencies: MobileAuthHttpDependencies,
  options: BoundaryOptions = {},
): Promise<Response> {
  const body = await readBody(request, ['refreshToken', 'sessionId'], options);
  if (!body) return error('validation', 400);
  const input = { sessionId: string(body.sessionId), refreshToken: string(body.refreshToken) };
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.sessionId) ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.refreshToken)
  )
    return error('validation', 400);
  try {
    const outcome = await dependencies.refresh(input);
    return outcome.status === 'rotated'
      ? json({ accessToken: outcome.accessToken, refreshToken: outcome.refreshToken }, 200)
      : error('invalidToken', 401);
  } catch {
    return error('serverUnavailable', 503);
  }
}

export async function handleMobileSessionRevoke(
  request: Request,
  dependencies: MobileAuthHttpDependencies,
  options: BoundaryOptions = {},
): Promise<Response> {
  const body = await readBody(request, [], options);
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._-]{1,2048})$/.exec(authorization);
  if (!body || !match) return error('validation', 400);
  try {
    if (!(await dependencies.revoke(match[1]))) return error('invalidToken', 401);
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch {
    return error('serverUnavailable', 503);
  }
}

async function readBody(
  request: Request,
  keys: readonly string[],
  { development = process.env.NODE_ENV === 'development' }: BoundaryOptions,
): Promise<JsonObject | null> {
  if (request.method !== 'POST' || !isSecure(request, development)) return null;
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? ''))
    return null;
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) return null;
  try {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBodyBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const body = value as JsonObject;
    const actual = Object.keys(body).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length &&
      actual.every((key, index) => key === expected[index])
      ? body
      : null;
  } catch {
    return null;
  }
}

function isSecure(request: Request, development: boolean): boolean {
  const url = new URL(request.url);
  return (
    url.protocol === 'https:' ||
    (development &&
      url.protocol === 'http:' &&
      ['127.0.0.1', '::1', 'localhost'].includes(url.hostname))
  );
}
function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function normalizeIranianPhone(value: unknown): string | null {
  const digits = normalizeDigits(value).replace(/[\s-]/g, '');
  const national = digits.replace(/^\+98/, '0').replace(/^0098/, '0').replace(/^98/, '0');
  return /^09\d{9}$/.test(national) ? `+98${national.slice(1)}` : null;
}
function normalizeDigits(value: unknown): string {
  return string(value).replace(/[۰-۹٠-٩]/g, (digit) =>
    String('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'.indexOf(digit) % 10),
  );
}
function readClientIp(request: Request): string | null {
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length <= 128 ? first : null;
}
function error(
  code: 'validation' | 'invalidChallenge' | 'invalidToken' | 'rateLimited' | 'serverUnavailable',
  status: number,
  headers: Record<string, string> = {},
): Response {
  return json({ error: code }, status, headers);
}
function json(body: JsonObject, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...jsonHeaders, ...headers } });
}
