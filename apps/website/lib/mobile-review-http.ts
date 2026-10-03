import type { ReviewGrade } from '@learnbox/learning-engine';
import {
  SCHEDULER_REJECTED_CODE,
  SCHEDULER_REJECTED_STATUS,
  schedulerRejectedBody,
} from '@learnbox/learning-engine';
import {
  MobileReviewBatchCapabilityError,
  MobileReviewBatchRequestError,
  parseMobileReviewBatchRequestSalvaging,
} from '../../api/dist/reviews/mobile-review-batch.request.js';
import {
  MobileReviewBatchError,
  type MobileReviewBatchItemOutcome,
} from '../../api/dist/reviews/mobile-review-batch.service.js';

type JsonObject = Record<string, unknown>;
/**
 * CP17 F5: `binaryResponses` must be threaded from `LEARNBOX_BINARY_REVIEW` exactly as the
 * learner-web boundary already does. Omitting it silently disabled binary acceptance on the
 * Native endpoint even with the Production flag ON.
 */
type BoundaryOptions = { development?: boolean; binaryResponses?: boolean };

export type AccessVerification =
  { status: 'valid'; claims: { sub: string } } | { status: 'invalid' };

export type MobileReviewHttpDependencies = {
  verifyAccessToken(token: string): AccessVerification;
  submit(input: {
    userId: string;
    items: Array<{
      contentId: string;
      grade: ReviewGrade;
      occurredAt: Date;
      clientEventId: string;
    }>;
  }): Promise<MobileReviewBatchItemOutcome[]>;
};

export type MobileReviewReconciliation = {
  cursor: string;
  nextCursor: string;
  hasMore: boolean;
  events: Array<{ clientEventId: string; eventId: string; appliedAt: string }>;
};

export type MobileReviewReconciliationDependencies = {
  verifyAccessToken(token: string): AccessVerification;
  readReconciliation(input: { userId: string; after: string }): Promise<MobileReviewReconciliation>;
};

const MAX_BODY_BYTES = 16_384;
const MAX_POSTGRES_BIGINT = '9223372036854775807';
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
  let parsed: ReturnType<typeof parseMobileReviewBatchRequestSalvaging>;
  try {
    // CP17 F5: honour the server-side binary acceptance flag, defaulting to the environment
    // exactly like the learner-web boundary. CP17 F1: salvage valid items instead of letting
    // one terminally-invalid event reject the whole batch.
    parsed = parseMobileReviewBatchRequestSalvaging(body, verification.claims.sub, {
      binaryResponses: options.binaryResponses ?? process.env.LEARNBOX_BINARY_REVIEW === 'true',
    });
  } catch (parseError) {
    // CP17 F5: a capability gap is transient and server-side. Answer 503 (retryable) so a flag
    // regression never converts real learner reviews into terminal rejections.
    if (parseError instanceof MobileReviewBatchCapabilityError) {
      return error('serverUnavailable', 503);
    }
    if (parseError instanceof MobileReviewBatchRequestError) return error('validation', 400);
    throw parseError;
  }

  // A terminally-invalid item is reported per-item so the client can retire exactly that
  // event. It is never silently dropped and never submitted to the scheduler.
  const rejectedOutcomes = parsed.rejected.map((item) => ({
    status: 'rejected' as const,
    clientEventId: item.clientEventId,
    reason: 'validation' as const,
  }));

  if (parsed.items.length === 0) {
    // Nothing valid to submit: answer with the per-item verdicts rather than calling the
    // scheduler with an empty batch.
    return json({ outcomes: rejectedOutcomes }, 200);
  }

  try {
    const outcomes = await dependencies.submit({ userId: parsed.userId, items: parsed.items });
    return json({ outcomes: [...outcomes, ...rejectedOutcomes] }, 200);
  } catch (cause) {
    // LB-B35 CP7: deterministic scheduler refusal -> 422, not a retryable 503.
    if (cause instanceof MobileReviewBatchError && cause.code === SCHEDULER_REJECTED_CODE) {
      return schedulerRejected();
    }
    return error('serverUnavailable', 503);
  }
}

export async function handleMobileReviewGet(
  request: Request,
  dependencies: MobileReviewReconciliationDependencies,
  options: BoundaryOptions = {},
): Promise<Response> {
  if (
    request.method !== 'GET' ||
    !isSecure(request, options.development ?? process.env.NODE_ENV === 'development')
  )
    return error('validation', 400);

  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._-]{1,2048})$/.exec(authorization);
  if (!match) return error('invalidToken', 401);
  const verification = dependencies.verifyAccessToken(match[1]);
  if (verification.status !== 'valid') return error('invalidToken', 401);

  const after = new URL(request.url).searchParams.get('after') ?? '0';
  if (!isNonNegativePostgresBigInt(after)) return error('validation', 400);

  try {
    return json(
      {
        reconciliation: await dependencies.readReconciliation({
          userId: verification.claims.sub,
          after,
        }),
      },
      200,
    );
  } catch {
    return error('serverUnavailable', 503);
  }
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
  code: 'validation' | 'invalidToken' | typeof SCHEDULER_REJECTED_CODE | 'serverUnavailable',
  status: number,
): Response {
  return json({ error: code }, status);
}

/**
 * LB-B35 CP15 (Workstream A): the deterministic scheduler refusal is built from the canonical
 * contract in `@learnbox/learning-engine`, never from a local literal. See
 * `review-sync-wire-contract.ts` for why this indirection is load-bearing.
 */
function schedulerRejected(): Response {
  return json(schedulerRejectedBody(), SCHEDULER_REJECTED_STATUS);
}
function json(body: JsonObject, status: number): Response {
  return Response.json(body, { status, headers: JSON_HEADERS });
}
