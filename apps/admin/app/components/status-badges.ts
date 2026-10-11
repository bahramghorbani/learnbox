/**
 * Canonical status → approved badge treatment, shared.
 *
 * `PACK_BADGE` and `packStatusBadges` were byte-identical copies in two workspaces (LB-B53): the
 * dashboard could not import the content workspace's copy without dragging a 48 KB client
 * component into the home bundle. This module carries the maps alone — no components, no state,
 * no fetches — so both screens read the same truth at a few hundred bytes.
 *
 * Values mirror the frozen prototype's `packBadge()`; tones are the approved `b-*` classes.
 * Canonical status strings stay exactly as the database writes them.
 */

export type BadgeTreatment = readonly [tone: string, label: string];

/** Canonical `packs.status`. */
export const PACK_BADGE: Record<string, BadgeTreatment> = {
  draft: ['b-grey', 'پیش‌نویس'],
  ai_generated: ['b-grey', 'ساخته‌شده با هوش مصنوعی'],
  needs_review: ['b-amber', 'در انتظار بررسی'],
  approved: ['b-amber', 'تأییدشده'],
  published: ['b-green', 'منتشر شده'],
  archived: ['b-grey', 'بایگانی‌شده'],
};

/** Canonical `cards.status`. */
export const CARD_BADGE: Record<string, BadgeTreatment> = {
  draft: ['b-grey', 'پیش‌نویس'],
  auto_validated: ['b-amber', 'در انتظار بررسی'],
  needs_review: ['b-amber', 'در انتظار بررسی'],
  approved: ['b-green', 'تأییدشده'],
  published: ['b-green', 'منتشر شده'],
  rejected: ['b-rose', 'ردشده'],
  deprecated: ['b-grey', 'بایگانی‌شده'],
};

/** An unmapped status prints itself rather than disappearing behind a guessed label. */
export function badgeFor(map: Record<string, BadgeTreatment>, status: string): BadgeTreatment {
  return map[status] ?? ['b-grey', status];
}
