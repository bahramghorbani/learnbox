import { SCHEDULER_V2_ENGINE_VERSION } from '@learnbox/learning-engine';

/**
 * LB-B35 CP7: fail-closed schema preflight for `LEARNBOX_SCHEDULER_V2=true`.
 *
 * Scheduler V2 stamps `review_events.engine_version` (migration 0023). If that column is missing or has an
 * incompatible shape, V2 must NOT be activated and must NOT silently fall back to V1: the operator gets a
 * precise error and every review write is refused until the schema is right (or the flag is turned off).
 * With the flag off nothing here runs, so the application keeps working without 0023.
 */

export interface SchemaQueryable {
  query(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export class SchedulerV2PreflightError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      'LEARNBOX_SCHEDULER_V2=true was refused: the database does not satisfy the scheduler V2 schema ' +
        `requirements (${problems.join('; ')}). Apply migration 0023_learning_persistence ` +
        'to this database, or set LEARNBOX_SCHEDULER_V2=false. Scheduler V2 never falls back to V1 silently.',
    );
    this.name = 'SchedulerV2PreflightError';
  }
}

export function isSchedulerV2Enabled(environment: Record<string, string | undefined>): boolean {
  return environment.LEARNBOX_SCHEDULER_V2 === 'true';
}

/**
 * Decides from `pg_get_constraintdef` whether the CHECK admits `version`. Postgres normalises
 * `BETWEEN 1 AND 100` to `(engine_version >= 1) AND (engine_version <= 100)`, so both spellings are read.
 * Anything it cannot positively recognise is treated as NOT accepting (fail closed).
 */
export function constraintAcceptsEngineVersion(definition: string, version: number): boolean {
  const between = /engine_version\s+BETWEEN\s+(\d+)\s+AND\s+(\d+)/i.exec(definition);
  if (between) return Number(between[1]) <= version && version <= Number(between[2]);
  const lower = /engine_version\s*>=\s*(\d+)/i.exec(definition);
  const upper = /engine_version\s*<=\s*(\d+)/i.exec(definition);
  const strictUpper = /engine_version\s*<\s*(\d+)/i.exec(definition);
  if (!lower || (!upper && !strictUpper)) return false;
  if (Number(lower[1]) > version) return false;
  if (upper && version > Number(upper[1])) return false;
  if (strictUpper && version >= Number(strictUpper[1])) return false;
  return true;
}

/** Throws `SchedulerV2PreflightError` unless every V2 schema requirement holds. Read-only. */
export async function verifySchedulerV2Schema(db: SchemaQueryable): Promise<void> {
  const problems: string[] = [];

  const columns = await db.query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'review_events'
        AND column_name IN ('engine_version', 'response')`,
  );
  const byName = new Map(
    columns.rows.map((row) => [String(row.column_name), String(row.data_type)]),
  );
  if (!byName.has('engine_version')) problems.push('review_events.engine_version is missing');
  else if (byName.get('engine_version') !== 'smallint')
    problems.push(
      `review_events.engine_version is ${byName.get('engine_version')}, expected smallint`,
    );
  if (!byName.has('response')) problems.push('review_events.response is missing');

  if (byName.has('engine_version')) {
    // The CHECK must exist and accept the V2 stamp; a stricter or different constraint would reject writes.
    const constraint = await db.query(
      `SELECT pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'review_events' AND c.conname = 'review_events_engine_version_valid'`,
    );
    const definition = constraint.rows[0]?.definition;
    if (typeof definition !== 'string') {
      problems.push('constraint review_events_engine_version_valid is missing');
    } else {
      if (!constraintAcceptsEngineVersion(definition, SCHEDULER_V2_ENGINE_VERSION)) {
        problems.push(
          `constraint review_events_engine_version_valid does not accept engine_version ${SCHEDULER_V2_ENGINE_VERSION}`,
        );
      }
    }
  }

  if (problems.length > 0) throw new SchedulerV2PreflightError(problems);
}

/**
 * Memoises a successful preflight for the process lifetime. A FAILED preflight is never cached: it is
 * re-evaluated on the next call, so fixing the schema re-enables V2 without a restart, and until then every
 * call keeps failing closed.
 */
export function createSchedulerV2Preflight(db: SchemaQueryable): () => Promise<void> {
  let verified: Promise<void> | null = null;
  return () => {
    if (verified) return verified;
    const attempt = verifySchedulerV2Schema(db);
    verified = attempt;
    attempt.catch(() => {
      if (verified === attempt) verified = null;
    });
    return attempt;
  };
}
