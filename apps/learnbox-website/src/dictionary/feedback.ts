// Dictionary feedback from visitors: searches that found nothing and error reports on a word.
// Appended as JSON lines to one file in LEARNBOX_DICTIONARY_FEEDBACK_DIR; Admin reads it.
// No IP, account or cookie is stored (ADR 0017: the site keeps no database credential).
import { appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const reportKinds = ['meaning', 'example', 'article', 'other'] as const;
export type Feedback =
  | { type: 'miss'; q: string }
  | { type: 'report'; lemma: string; kind: (typeof reportKinds)[number]; note: string };

const MAX_BYTES = 20 * 1024 * 1024;
// Letters (Latin incl. umlauts, Persian/Arabic), spaces, hyphen, apostrophe, ZWNJ. No digits/links.
const word = /^[\p{L}\p{M}][\p{L}\p{M} '\-\u200c]{0,38}[\p{L}\p{M}]$/u;
const clean = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\u200c' ? c : ' '))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

/** Validate an untrusted body; `exists` says whether a lemma is a real dictionary word. */
export function parseFeedback(body: unknown, exists: (lemma: string) => boolean): Feedback | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.type === 'miss') {
    const q = clean(b.q, 41); // over 40 fails the pattern instead of being cut
    return word.test(q) ? { type: 'miss', q } : null;
  }
  if (b.type === 'report') {
    const lemma = clean(b.lemma, 80);
    const kind = reportKinds.find((k) => k === b.kind);
    if (!kind || !lemma || !exists(lemma)) return null;
    return { type: 'report', lemma, kind, note: clean(b.note, 500) };
  }
  return null;
}

export function feedbackEnabled() {
  return Boolean(process.env.LEARNBOX_DICTIONARY_FEEDBACK_DIR);
}

/** Append one line; false when not configured or the file is full. */
export function recordFeedback(f: Feedback, at = new Date()): boolean {
  const dir = process.env.LEARNBOX_DICTIONARY_FEEDBACK_DIR;
  if (!dir) return false;
  const file = join(dir, 'feedback.jsonl');
  try {
    if (statSync(file).size > MAX_BYTES) return false;
  } catch {
    // first write creates the file
  }
  // ponytail: one capped file, no rotation; rotate monthly if 20 MB ever fills.
  appendFileSync(file, `${JSON.stringify({ ...f, at: at.toISOString() })}\n`, { mode: 0o644 });
  return true;
}

// ponytail: in-memory per-address limit (address never stored); one landing process.
const hits = new Map<string, { n: number; until: number }>();
export function allow(key: string, now = Date.now(), limit = 30, windowMs = 3_600_000) {
  if (hits.size > 10_000) hits.clear();
  const h = hits.get(key);
  if (!h || h.until < now) {
    hits.set(key, { n: 1, until: now + windowMs });
    return true;
  }
  return ++h.n <= limit;
}
