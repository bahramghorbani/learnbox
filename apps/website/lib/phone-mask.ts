/**
 * Canonical masking for the learner's phone number (LB-B03).
 *
 * Two endpoints had drifted apart while describing the same field: /api/learner/profile produced
 * `09xx***xxxx` (Latin digits, three stars) while /api/learner/profile/stats produced
 * `۰۹38****4003` — a Persian prefix welded onto Latin digits with four stars. The mixed-script form
 * renders as visibly broken text in a right-to-left interface, so both now share this helper.
 *
 * The mask is produced in canonical Latin form and converted to Persian digits at display time,
 * which keeps the value testable with a single regex and keeps presentation in the UI layer.
 */

const IRANIAN_E164 = /^\+989(\d{2})\d{3}(\d{4})$/;

/** `+989381234003` → `09383***4003`; anything else → null, never a partially masked string. */
export function maskIranianPhone(phoneE164: string): string | null {
  const match = IRANIAN_E164.exec(phoneE164);
  return match ? `09${match[1]}***${match[2]}` : null;
}

// Digit transliteration lives in app/persian-digits.ts; this module owns masking only.
