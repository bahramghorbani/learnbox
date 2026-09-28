/**
 * HTTP boundary for learner-initiated account deletion (LB-B04).
 *
 * Deletion is destructive and irreversible, so this boundary is deliberately strict:
 *
 *  - POST only, same-origin JSON (reuses the canonical CSRF gate in `trusted-origin`), so a
 *    cross-site form or image tag can never trigger a deletion.
 *  - An authenticated learner session is required; the session subject alone decides WHICH account
 *    is deleted. A caller-supplied user id is never honoured, so one learner cannot delete another.
 *  - Re-authentication: the learner must retype their own phone number exactly as registered. This
 *    is the confirmation step appropriate to a phone-OTP auth model — the learner proves knowledge
 *    of the account identifier at the moment of deletion, which defeats an unattended shared device
 *    and any accidental single tap.
 *  - Idempotency: a repeated request with the same `requestId` returns the first result instead of
 *    attempting a second deletion, so a retry after a dropped connection is safe.
 *
 * The response never contains learner content, phone numbers or audit internals — only the outcome
 * and an opaque deletion id the learner can quote to support.
 */

import { isTrustedJsonMutation } from './trusted-origin';

export type DeletionOutcome =
  | { status: 'deleted'; deletionId: string }
  /** A retry of an already-completed deletion, carrying the original deletion id. */
  | { status: 'already_deleted'; deletionId: string }
  | { status: 'refused'; reason: 'privileged_account' };

export type AccountDeletionDependencies = {
  /** Returns the E.164 phone for the session subject, or null when unknown. */
  readAccountPhone(userId: string): Promise<string | null>;
  /** Performs the transactional deletion. Must be idempotent per requestId. */
  deleteAccount(input: { userId: string; requestId: string }): Promise<DeletionOutcome>;
};

const HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
} as const;

/** Digits only, so formatting differences never block a legitimate confirmation. */
function normalizePhone(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\D/g, '');
}

/**
 * True when the typed confirmation matches the account's registered phone.
 * Compares the last 10 digits so +98/0098/0 prefixes are all accepted.
 */
export function phoneConfirmationMatches(typed: string, registered: string): boolean {
  const a = normalizePhone(typed);
  const b = normalizePhone(registered);
  if (a.length < 10 || b.length < 10) return false;
  return a.slice(-10) === b.slice(-10);
}

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: HEADERS });
}

export async function handleAccountDeletionPost(
  request: Request,
  dependencies: AccountDeletionDependencies,
  readSubject: (request: Request) => string | null,
  environment: Record<string, string | undefined> = process.env,
): Promise<Response> {
  if (!isTrustedJsonMutation(request, { environment })) {
    return json({ error: 'validation' }, 400);
  }

  const subject = readSubject(request);
  if (!subject) return json({ error: 'identityUnavailable' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'validation' }, 400);
  }

  const payload = body as { confirmPhone?: unknown; requestId?: unknown } | null;
  const confirmPhone = typeof payload?.confirmPhone === 'string' ? payload.confirmPhone : '';
  const requestId = typeof payload?.requestId === 'string' ? payload.requestId.trim() : '';

  // A stable client-supplied id is what makes retry safe; without it we would risk a second
  // deletion pass on a network retry.
  if (!requestId || requestId.length > 100) return json({ error: 'validation' }, 400);
  if (!confirmPhone) return json({ error: 'confirmationRequired' }, 400);

  let registered: string | null;
  try {
    registered = await dependencies.readAccountPhone(subject);
  } catch {
    return json({ error: 'serverUnavailable' }, 503);
  }
  // No account behind a valid session: treat as an unusable identity rather than deleting nothing.
  if (!registered) return json({ error: 'identityUnavailable' }, 401);

  if (!phoneConfirmationMatches(confirmPhone, registered)) {
    return json({ error: 'confirmationMismatch' }, 403);
  }

  let outcome: DeletionOutcome;
  try {
    outcome = await dependencies.deleteAccount({ userId: subject, requestId });
  } catch {
    return json({ error: 'serverUnavailable' }, 503);
  }

  if (outcome.status === 'refused') {
    // Privileged accounts (owner/reviewer) cannot self-delete: their rows are referenced by the
    // content review audit chain. Support handles these deliberately.
    return json({ error: 'deletionUnavailable', reason: outcome.reason }, 409);
  }

  // A retry reports the same success with the original id: the learner's account IS deleted, so
  // claiming anything else would be untrue.
  return json({ status: 'deleted', deletionId: outcome.deletionId }, 200);
}
