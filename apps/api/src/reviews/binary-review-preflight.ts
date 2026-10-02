import type { SchemaQueryable } from './scheduler-v2-preflight.js';

/**
 * LB-B35 CP9 (N1): fail-closed schema preflight for `LEARNBOX_BINARY_REVIEW=true`.
 *
 * Binary review persists the canonical answer in `review_events.response`, a column that exists only
 * after migration 0023. Before this preflight existed, enabling the flag against a pre-0023 database
 * produced a raw INSERT failure that the service boundary mapped to a RETRYABLE `serverUnavailable`
 * 503: the operator got no actionable message and the client retried a request that could never
 * succeed. That was CP8 finding N1.
 *
 * This module mirrors `scheduler-v2-preflight.ts` deliberately: a POSITIVE assertion that the schema
 * can accept the write, raised BEFORE the transaction opens, reported under a distinct error name so
 * the boundary can classify it as deterministic (422 `schedulerRejected`) rather than transient.
 * With the flag off nothing here runs, so the application keeps working without 0023.
 */

/** Canonical values the 0023 CHECK admits. Any other value is a programming error, not a schema one. */
export const BINARY_REVIEW_RESPONSES: readonly ['known', 'unknown'] = Object.freeze([
  'known',
  'unknown',
] as const);

export class BinaryReviewPreflightError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      'LEARNBOX_BINARY_REVIEW=true was refused: the database does not satisfy the binary review ' +
        `schema requirements (${problems.join('; ')}). Apply migration 0023_learning_persistence ` +
        'to this database, or set LEARNBOX_BINARY_REVIEW=false. Nothing was persisted.',
    );
    this.name = 'BinaryReviewPreflightError';
  }
}

export function isBinaryReviewEnabled(environment: Record<string, string | undefined>): boolean {
  return environment.LEARNBOX_BINARY_REVIEW === 'true';
}

/**
 * Decides from `pg_get_constraintdef` whether the CHECK admits every canonical response value.
 * Anything it cannot positively recognise is treated as NOT accepting (fail closed) — a narrower or
 * rewritten constraint would reject writes at COMMIT time, which is exactly what must not happen.
 */
export function constraintAcceptsResponses(
  definition: string,
  values: readonly string[] = BINARY_REVIEW_RESPONSES,
): boolean {
  // Postgres normalises `response IN ('known','unknown')` to
  // `((response IS NULL) OR (response = ANY (ARRAY['known'::text, 'unknown'::text])))`.
  return values.every((value) => new RegExp(`'${value}'(::text)?`).test(definition));
}

/** Throws `BinaryReviewPreflightError` unless every binary-review schema requirement holds. Read-only. */
export async function verifyBinaryReviewSchema(db: SchemaQueryable): Promise<void> {
  const problems: string[] = [];

  const columns = await db.query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'review_events'
        AND column_name = 'response'`,
  );
  const responseType = columns.rows[0]?.data_type;

  if (responseType === undefined) {
    problems.push('review_events.response is missing');
  } else if (String(responseType) !== 'text') {
    problems.push(`review_events.response is ${String(responseType)}, expected text`);
  } else {
    // The CHECK must exist and accept both canonical values; a stricter constraint would reject writes.
    const constraint = await db.query(
      `SELECT pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'review_events' AND c.conname = 'review_events_response_valid'`,
    );
    const definition = constraint.rows[0]?.definition;
    if (typeof definition !== 'string') {
      problems.push('constraint review_events_response_valid is missing');
    } else if (!constraintAcceptsResponses(definition)) {
      problems.push(
        `constraint review_events_response_valid does not accept ${BINARY_REVIEW_RESPONSES.join(' and ')}`,
      );
    }
  }

  if (problems.length > 0) throw new BinaryReviewPreflightError(problems);
}

/**
 * Memoises a successful preflight for the process lifetime. A FAILED preflight is never cached: it is
 * re-evaluated on the next call, so applying 0023 re-enables binary review without a restart, and
 * until then every call keeps failing closed. Same contract as the scheduler V2 preflight.
 */
export function createBinaryReviewPreflight(db: SchemaQueryable): () => Promise<void> {
  let verified: Promise<void> | null = null;
  return () => {
    if (verified) return verified;
    const attempt = verifyBinaryReviewSchema(db);
    verified = attempt;
    attempt.catch(() => {
      if (verified === attempt) verified = null;
    });
    return attempt;
  };
}
