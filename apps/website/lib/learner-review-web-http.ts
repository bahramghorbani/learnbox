import {
  MobileReviewBatchRequestError,
  parseMobileReviewBatchRequest,
} from '../../api/dist/reviews/mobile-review-batch.request.js';
import type { MobileReviewBatchItemOutcome } from '../../api/dist/reviews/mobile-review-batch.service.js';
import type { MobileReviewReconciliationResult } from '../../api/dist/reviews/postgres-review-event.store.js';

type BoundaryOptions = { development?: boolean };
type JsonObject = Record<string, unknown>;

export type WebReviewDependencies = {
  submit(input: {
    userId: string;
    items: Array<{
      contentId: string;
      grade: 'forgot' | 'hard' | 'remembered' | 'mastered';
      occurredAt: Date;
      clientEventId: string;
    }>;
  }): Promise<MobileReviewBatchItemOutcome[]>;
  readReconciliation(input: {
    userId: string;
    after: string;
  }): Promise<MobileReviewReconciliationResult>;
};

const MAX_BODY_BYTES = 16_384;
const MAX_POSTGRES_BIGINT = '9223372036854775807';
const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

/**
 * Cookie-authenticated Web review boundary. Identity is read only from the
 * signed HttpOnly learner session; browser-supplied tokens and user IDs are
 * intentionally ignored. Same-origin JSON is mandatory before any write.
 */
export async function handleWebReviewBatchPost(
  request: Request,
  dependencies: WebReviewDependencies,
  readSubject: (request: Request) => string | null,
  options: BoundaryOptions = {},
): Promise<Response> {
  if (
    request.method !== 'POST' ||
    !isSecure(request, options.development ?? process.env.NODE_ENV === 'development')
  ) {
    return error('validation', 400);
  }

  const subject = readSubject(request);
  if (!subject) return error('invalidToken', 401);
  if (!isTrustedSameOriginJsonPost(request)) return error('request_rejected', 403);

  const body = await readJsonBody(request);
  if (body === null || (isRecord(body) && 'reconciliationCursor' in body)) {
    return error('validation', 400);
  }

  try {
    const parsed = parseMobileReviewBatchRequest(body, subject);
    const outcomes = await dependencies.submit({ userId: parsed.userId, items: parsed.items });
    return json({ outcomes }, 200);
  } catch (cause) {
    if (cause instanceof MobileReviewBatchRequestError) return error('validation', 400);
    return error('serverUnavailable', 503);
  }
}

export async function handleWebReviewReconciliationGet(
  request: Request,
  dependencies: WebReviewDependencies,
  readSubject: (request: Request) => string | null,
  options: BoundaryOptions = {},
): Promise<Response> {
  if (
    request.method !== 'GET' ||
    !isSecure(request, options.development ?? process.env.NODE_ENV === 'development')
  ) {
    return error('validation', 400);
  }

  const subject = readSubject(request);
  if (!subject) return error('invalidToken', 401);
  const after = new URL(request.url).searchParams.get('after') ?? '0';
  if (!isNonNegativePostgresBigInt(after)) return error('validation', 400);

  try {
    return json(
      { reconciliation: await dependencies.readReconciliation({ userId: subject, after }) },
      200,
    );
  } catch {
    return error('serverUnavailable', 503);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTrustedSameOriginJsonPost(request: Request): boolean {
  if (
    !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')
  ) {
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

function isSecure(request: Request, development: boolean): boolean {
  const url = new URL(request.url);
  return (
    url.protocol === 'https:' ||
    (development &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname))
  );
}

function isNonNegativePostgresBigInt(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const normalized = value.replace(/^0+/, '') || '0';
  return (
    normalized.length < MAX_POSTGRES_BIGINT.length ||
    (normalized.length === MAX_POSTGRES_BIGINT.length && normalized <= MAX_POSTGRES_BIGINT)
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
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

function error(
  code: 'validation' | 'invalidToken' | 'request_rejected' | 'serverUnavailable',
  status: number,
): Response {
  return json({ error: code }, status);
}

function json(body: JsonObject, status: number): Response {
  return Response.json(body, { status, headers: JSON_HEADERS });
}
