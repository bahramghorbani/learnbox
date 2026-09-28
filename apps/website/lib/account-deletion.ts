/**
 * Account deletion domain model (LB-B04).
 *
 * Deleting a LearnBox account removes the learner's live personal and learning data while keeping
 * two deliberately narrow traces:
 *
 *  - a privacy-minimised deletion audit record (`account_deletion_events`), so a later support,
 *    fraud or restoration dispute can be investigated without keeping the account;
 *  - durable purchase-ownership evidence (`purchase_ownership_claims`), so a legitimately bought
 *    pack can be reclaimed after deleting and recreating an account.
 *
 * What is NOT retained: phone number, first name, review history, schedules, sessions, OTP
 * material, reconciliation cursors, or any secret. The audit record references the learner only by
 * the existing non-reversible HMAC phone hash.
 *
 * Owner decision (2026-09-28): the phone number is released immediately on deletion, so the same
 * person can re-register at once. That is why `users` rows are deleted rather than tombstoned —
 * `users.phone_e164` is UNIQUE and a tombstone would permanently block re-registration.
 *
 * This module is pure: it decides the plan and builds the audit record. Executing SQL is the
 * store's job, which keeps the ordering rules testable without a database.
 */

/** The written policy this deletion executes under. Recorded in every audit row. */
export const ACCOUNT_DELETION_POLICY_VERSION = '2026-09-28.v1';

export type DeletionActor = 'learner' | 'owner_support';

export type DeletionCounts = {
  readonly reviewEventsRemoved: number;
  readonly schedulesRemoved: number;
  readonly sessionsRemoved: number;
  readonly purchasesPreserved: number;
};

export type DeletionAuditRecord = {
  readonly subjectHash: string;
  readonly priorUserId: string;
  readonly requestedAt: string;
  readonly status: 'completed' | 'failed';
  readonly actor: DeletionActor;
  readonly policyVersion: string;
  readonly counts: DeletionCounts;
};

/**
 * Tables holding live learner data, in the order they must be cleared.
 *
 * This list is derived from the live schema, not from assumption: of the twelve foreign keys to
 * `users(id)`, only three declare ON DELETE CASCADE, so deleting the user row first fails on every
 * other referencing table. Children are cleared first and `users` is removed at the end.
 *
 * Deliberately excluded:
 *  - `purchase_events` — durable purchase evidence is promoted into `purchase_ownership_claims`
 *    before these rows go, so a deleted account cannot destroy a paid entitlement.
 *  - `audit_logs` — operational trail retained with the learner reference nulled, never deleted.
 *  - `admin_*` and `content_review_*` — owner/reviewer records, not learner data.
 */
export const LEARNER_DATA_TABLES: readonly string[] = [
  'review_events',
  'card_schedules',
  'learner_reconciliation_cursors',
  'mobile_learner_sessions',
  'user_packs',
  'payment_logs',
];

/**
 * Tables that must never be touched by an account deletion. Content, catalogue, owner and
 * content-review records belong to LearnBox, not to the learner, and destroying them would damage
 * other users or the audit chain.
 */
export const PROTECTED_TABLES: readonly string[] = [
  'cards',
  'card_versions',
  'pack_cards',
  'packs',
  'billing_products',
  'content_review_checks',
  'content_review_decisions',
  'admin_owner',
  'admin_role_assignments',
  'admin_sessions',
  'admin_passkey_credentials',
  'audit_logs',
];

export type DeletionPlanStep =
  | { readonly kind: 'assert_deletable' }
  | { readonly kind: 'preserve_purchase_evidence' }
  | { readonly kind: 'delete_rows'; readonly table: string }
  | { readonly kind: 'anonymise_audit_logs' }
  | { readonly kind: 'delete_user' }
  | { readonly kind: 'write_audit' };

/**
 * The fixed execution order for a deletion.
 *
 * `assert_deletable` runs first: an account bound to the owner/admin identity or carrying content
 * review decisions is refused outright rather than partially deleted, because those records are
 * NOT NULL references that a deletion must never destroy.
 *
 * Purchase evidence is preserved next: if the transaction later aborts, the worst case is a
 * harmless duplicate-safe claim row, never a destroyed entitlement. The audit record is written
 * last so it can carry accurate disposition counts.
 */
export function buildDeletionPlan(): readonly DeletionPlanStep[] {
  return [
    { kind: 'assert_deletable' },
    { kind: 'preserve_purchase_evidence' },
    ...LEARNER_DATA_TABLES.map((table) => ({ kind: 'delete_rows' as const, table })),
    { kind: 'anonymise_audit_logs' },
    { kind: 'delete_user' },
    { kind: 'write_audit' },
  ];
}

/** Guard against a plan that would ever target content or owner data. */
export function planTouchesProtectedTable(plan: readonly DeletionPlanStep[]): boolean {
  return plan.some((step) => step.kind === 'delete_rows' && PROTECTED_TABLES.includes(step.table));
}

export function buildDeletionAudit(input: {
  readonly subjectHash: string;
  readonly priorUserId: string;
  readonly requestedAt: Date;
  readonly actor: DeletionActor;
  readonly counts: DeletionCounts;
  readonly status?: 'completed' | 'failed';
}): DeletionAuditRecord {
  if (!input.subjectHash) throw new Error('deletion audit requires a subject hash');
  if (!input.priorUserId) throw new Error('deletion audit requires the prior user id');

  return {
    subjectHash: input.subjectHash,
    priorUserId: input.priorUserId,
    requestedAt: input.requestedAt.toISOString(),
    status: input.status ?? 'completed',
    actor: input.actor,
    policyVersion: ACCOUNT_DELETION_POLICY_VERSION,
    counts: input.counts,
  };
}

/**
 * Fields the audit record is allowed to contain. Used by tests to prove no personal data has crept
 * into the audit trail as the schema evolves.
 */
export const ALLOWED_AUDIT_FIELDS: readonly string[] = [
  'subjectHash',
  'priorUserId',
  'requestedAt',
  'status',
  'actor',
  'policyVersion',
  'counts',
];

/**
 * Keys permitted anywhere inside a serialised audit record, including nested count fields.
 * Anything outside this set is treated as a leak, which makes the check fail closed when a future
 * change adds a field rather than silently allowing it.
 */
const ALLOWED_AUDIT_KEYS: readonly string[] = [
  ...ALLOWED_AUDIT_FIELDS,
  'reviewEventsRemoved',
  'schedulesRemoved',
  'sessionsRemoved',
  'purchasesPreserved',
];

/** Value shapes that must never appear in an audit record regardless of the field they sit in. */
const PERSONAL_VALUE_PATTERNS: readonly RegExp[] = [
  /(?:\+?98|0)9\d{9}/, // Iranian phone number, local or international.
  /v\d\.[A-Za-z0-9_-]{16,}\./, // Signed session material.
];

/**
 * True when a serialised audit record carries a field it must never have, or a value that looks
 * like personal or credential data.
 *
 * Checks keys against an allowlist rather than scanning the whole document for substrings: the
 * legitimate count field `sessionsRemoved` contains the word "session" but holds only an integer.
 */
export function auditRecordLeaksPersonalData(record: DeletionAuditRecord): boolean {
  const walk = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') {
      return PERSONAL_VALUE_PATTERNS.some((pattern) => pattern.test(value));
    }
    if (typeof value !== 'object') return false;
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => !ALLOWED_AUDIT_KEYS.includes(key) || walk(nested),
    );
  };

  return walk(record);
}
