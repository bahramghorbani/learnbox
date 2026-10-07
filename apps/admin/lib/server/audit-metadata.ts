/**
 * Safe presentation of canonical `audit_logs.metadata` (Phase 3 / M3.3).
 *
 * `metadata` is JSONB written by six independent producers across Phase 1, 2 and 3, and new
 * producers will arrive after this viewer ships. It is therefore treated as UNTRUSTED display data:
 * this module decides what a reviewer may see, rather than the writers deciding by accident.
 *
 * Three rules, all failing closed on anything unexpected:
 *   1. Only a plain JSON object is read. A string, an array or null yields no details at all.
 *   2. A key that looks like a credential or an internal correlation id is listed but its value is
 *      replaced. The key stays visible so a reviewer knows the field exists and does not mistake
 *      redaction for absence — a silently dropped field is the kind of gap an audit trail must not
 *      have. The pattern is a DENYLIST on purpose: an allowlist would silently stop showing new
 *      fields that future producers add, which is the worse failure for an audit viewer.
 *   3. Every key and value is length-capped and flattened to a string, and the row count is
 *      bounded, so one oversized record can neither dominate the screen nor ship an unbounded
 *      payload to the browser.
 *
 * It never decodes, parses or follows anything inside a value. Rendering is React's job and React
 * escapes text, so a value containing markup is shown as the characters it is.
 */

/**
 * Credential-shaped and internal-correlation keys. `*_key` covers `idempotency_key` and
 * `decision_key`: real fields, but request-plumbing identifiers rather than facts about the action,
 * and exactly the kind of internal detail a support reviewer has no reason to read.
 */
const REDACTED_KEY =
  /(token|secret|password|passphrase|credential|authorization|cookie|signature|session|_key$|^key$|hash)/i;

const MAX_KEY = 60;
const MAX_VALUE = 200;
const MAX_DETAILS = 12;
/** Long enough for the 500-char support reason the mutation routes already enforce. */
const MAX_REASON = 500;

export type AuditDetail = { key: string; value: string; redacted: boolean };
export type AuditMetadataView = { reason: string | null; details: AuditDetail[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cap(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/** One metadata value as one line of text. Unknown shapes become JSON, never a thrown error. */
function flatten(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return cap(value, MAX_VALUE);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return cap(JSON.stringify(value) ?? '—', MAX_VALUE);
  } catch {
    return '—';
  }
}

export function summariseAuditMetadata(metadata: unknown): AuditMetadataView {
  if (!isPlainObject(metadata)) return { reason: null, details: [] };

  const reason =
    typeof metadata.reason === 'string' && metadata.reason.trim().length > 0
      ? cap(metadata.reason.trim(), MAX_REASON)
      : null;

  const details: AuditDetail[] = [];
  for (const [rawKey, rawValue] of Object.entries(metadata)) {
    if (details.length >= MAX_DETAILS) break;
    // The reason has its own first-class field; repeating it as a detail row would be noise.
    if (rawKey === 'reason') continue;
    const key = cap(rawKey, MAX_KEY);
    if (REDACTED_KEY.test(rawKey)) {
      details.push({ key, value: '•••', redacted: true });
      continue;
    }
    details.push({ key, value: flatten(rawValue), redacted: false });
  }

  return { reason, details };
}
