import {
  MobileReviewBatchRequestError,
  parseMobileReviewBatchRequest,
} from '../../api/dist/reviews/mobile-review-batch.request.js';
import type { MobileReviewBatchItemOutcome } from '../../api/dist/reviews/mobile-review-batch.service.js';

type JsonObject = Record<string, unknown>;
type BoundaryOptions = { development?: boolean };

export type AccessVerification =
  { status: 'valid'; claims: { sub: string } } | { status: 'invalid' };

export type MobileReviewHttpDependencies = {
  verifyAccessToken(token: string): AccessVerification;
  submit(input: {
    userId: string;
    items: Array<{
      contentId: string;
      grade: 'forgot' | 'hard' | 'remembered' | 'mastered';
      occurredAt: Date;
      clientEventId: string;
    }>;
  }): Promise<MobileReviewBatchItemOutcome[]>;
};

const MAX_BODY_BYTES = 16_384;
const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

export async function handleMobileReviewPost(
  request: Request,
  dependencies: MobileReviewHttpDependencies,
  options: BoundaryOptions = {},
): Promise<Response> {
  if (
    request.method !== 'POST' ||
    !isSecure(request, options.development ?? process.env.NODE_ENV === 'development')
  )
    return error('validation', 400);

  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._-]{1,2048})$/.exec(authorization);
  if (!match) return error('invalidToken', 401);
  const verification = dependencies.verifyAccessToken(match[1]);
  if (verification.status !== 'valid') return error('invalidToken', 401);

  const body = await readJsonBody(request);
  if (body === null) return error('validation', 400);
  let parsed: ReturnType<typeof parseMobileReviewBatchRequest>;
  try {
    parsed = parseMobileReviewBatchRequest(body, verification.claims.sub);
  } catch (parseError) {
    if (parseError instanceof MobileReviewBatchRequestError) return error('validation', 400);
    throw parseError;
  }

  try {
    const outcomes = await dependencies.submit({ userId: parsed.userId, items: parsed.items });
    return json({ outcomes }, 200);
  } catch {
    return error('serverUnavailable', 503);
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? ''))
    return null;
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
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
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname))
  );
}
function error(
  code: 'validation' | 'invalidToken' | 'serverUnavailable',
  status: number,
): Response {
  return json({ error: code }, status);
}
function json(body: JsonObject, status: number): Response {
  return Response.json(body, { status, headers: JSON_HEADERS });
}
