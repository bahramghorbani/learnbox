/**
 * Phase 4 / M4.3 — the canonical learner slider rule.
 *
 * ONE definition of what the learner receives, used by the slide route, by the slide-image route
 * and by the tests. The Admin (M4.2) decides what a valid slide IS; this module decides which of
 * those slides a learner GETS, and both halves are compared against each other in
 * `apps/website/test/m4.3-learner-slider-db.test.ts` so the two can never drift apart silently.
 *
 * Deliberately dependency-free: no `pg`, no React, no environment access. It is a rule, not a
 * connection, which is what lets a test import it and ask the same questions production asks.
 */

/**
 * Owner decision: at most three slides reach a learner. The Admin enforces the same number on the
 * write side inside a transaction (`maximumActiveSlides`); this is the delivery half of the rule,
 * so a database that somehow holds more active rows — a legacy state, a manual edit, a row that
 * predates the Slider Manager — still cannot produce a four-slide carousel.
 */
export const maximumDeliveredSlides = 3;

/**
 * More candidates are read than are delivered, so ONE unusable row cannot shrink the slider.
 * A legacy active banner pointing at `http://`, at a retired screen or at nothing at all is
 * excluded below; without this headroom it would also silently cost the learner a real slide.
 */
export const slideCandidateLimit = 8;

/** The learner's own screens. Mirrors `LearnerDestination` in `app/components/LearnerNav.tsx`. */
export const deliverableScreens = ['today', 'words', 'progress', 'profile', 'store'] as const;
export type DeliverableScreen = (typeof deliverableScreens)[number];

export type SlideDestination =
  | { kind: 'screen'; screen: DeliverableScreen }
  | { kind: 'pack'; packId: string }
  | { kind: 'url'; url: string };

/** `packs.id` is a canonical text slug, not a uuid. Mirrors the Store and the Admin. */
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;

/** `banners.id` is TEXT (`banner_xxxxxxxx`), so a path segment is matched, never interpolated. */
const slideIdPattern = /^[A-Za-z0-9_-]{3,64}$/;

export function isSlideId(value: string): boolean {
  return slideIdPattern.test(value);
}

const maximumUrlLength = 512;
const blockedHostSuffixes = ['.local', '.internal', '.localhost', '.home', '.lan'];
const ipv4Pattern = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * An external destination the app may hand to a learner's browser.
 *
 * Revalidated HERE, on delivery, and not merely trusted because the Admin validated it on the way
 * in: the row can be older than the rule, or edited by any future writer, and this is the last
 * point before the value becomes a tap target. https only (no javascript:, data:, intent:, http:),
 * no embedded credentials, no custom port, and a real public hostname — never an IP literal, a bare
 * label or a private-network suffix, which is how a slide could otherwise point at an internal
 * service. Identical to the Admin's `parseSafeExternalUrl`; the M4.3 database suite asserts the two
 * accept and reject exactly the same inputs.
 */
export function parseSafeExternalUrl(raw: string): string | undefined {
  if (raw.length > maximumUrlLength) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  if (url.username || url.password) return undefined;
  if (url.port) return undefined;
  const host = url.hostname.toLowerCase();
  if (host.length > 253 || !host.includes('.')) return undefined;
  if (ipv4Pattern.test(host) || host.includes(':')) return undefined;
  if (host === 'localhost' || blockedHostSuffixes.some((suffix) => host.endsWith(suffix))) {
    return undefined;
  }
  const href = url.toString();
  return href.length > maximumUrlLength ? undefined : href;
}

function isDeliverableScreen(value: string): value is DeliverableScreen {
  return (deliverableScreens as readonly string[]).includes(value);
}

/**
 * The stored `link_type`/`link_url` pair as a destination a learner may be sent to, or undefined
 * when the row holds something this product will not navigate to.
 *
 * Undefined is a normal answer, not an error: the pre-existing Production sample banners and any
 * row authored before the Slider Manager stay in the table untouched — they are simply not
 * delivered, instead of breaking the carousel or being shown as a dead tap target.
 */
export function readDeliverableDestination(
  linkType: unknown,
  linkUrl: unknown,
): SlideDestination | undefined {
  if (typeof linkUrl !== 'string' || linkUrl.length === 0) return undefined;
  if (linkType === 'screen') {
    return isDeliverableScreen(linkUrl) ? { kind: 'screen', screen: linkUrl } : undefined;
  }
  if (linkType === 'pack') {
    return packIdPattern.test(linkUrl) ? { kind: 'pack', packId: linkUrl } : undefined;
  }
  if (linkType === 'url') {
    const url = parseSafeExternalUrl(linkUrl);
    return url ? { kind: 'url', url } : undefined;
  }
  return undefined;
}

/**
 * The scheduling and activation window, as one SQL fragment used by BOTH the slide route and the
 * slide-image route.
 *
 * Shared on purpose: image bytes must obey the same rule as the slide that carries them, otherwise
 * a deactivated or expired slide's image would stay fetchable by id after the Admin retired it.
 */
export const deliverableSlidePredicate = `is_active = true
     AND (starts_at IS NULL OR starts_at <= NOW())
     AND (ends_at IS NULL OR ends_at >= NOW())
     AND link_type IN ('screen', 'pack', 'url')
     AND link_url IS NOT NULL`;

/**
 * Candidate slides for a learner, newest-authored last within a `sort_order`.
 *
 * `image_data IS NOT NULL` rather than `image_data`: the learner response says only WHETHER a slide
 * has an image, never the bytes — those are fetched one at a time from the protected image route,
 * so private bytes cannot ride along inside a JSON payload or a disk cache. `id` closes the
 * ordering so two slides sharing a `sort_order` and a `created_at` still arrive in a stable order.
 */
export const learnerSlidesSql = `SELECT id, title, description, background_color, link_type, link_url,
          image_data IS NOT NULL AS has_image
     FROM banners
    WHERE ${deliverableSlidePredicate}
    ORDER BY sort_order ASC, created_at DESC, id ASC
    LIMIT ${slideCandidateLimit}`;

/** The bytes of ONE slide image, gated by the same delivery rule as the slide itself. */
export const learnerSlideImageSql = `SELECT image_data
     FROM banners
    WHERE id = $1
      AND image_data IS NOT NULL
      AND ${deliverableSlidePredicate}
    LIMIT 1`;

/** Every slide image is normalized to WebP by the Admin on the way in (M4.2). */
export const slideImageMediaType = 'image/webp';

/**
 * What a learner client receives for one slide.
 *
 * Only what the carousel needs to render and navigate. Deliberately absent: `image_data` (bytes),
 * `image_url` (the legacy third-party URL column), `link_target`, `sort_order`, `is_active`,
 * `starts_at`/`ends_at` and `created_at` — scheduling and activation are server concerns, and
 * shipping them would tell every learner about slides and timings they do not have.
 */
export type DeliveredSlide = {
  id: string;
  title: string;
  description: string | null;
  backgroundColor: string | null;
  destination: SlideDestination;
  hasImage: boolean;
};

type SlideRow = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  background_color?: unknown;
  link_type?: unknown;
  link_url?: unknown;
  has_image?: unknown;
};

/** A CSS colour the app itself authored. Anything else falls back to the theme colour. */
const colorPattern = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Rows to the delivered slider: destinations revalidated, unusable rows dropped, the owner's
 * maximum applied last so the cap counts slides a learner can actually use.
 */
export function toDeliveredSlides(rows: readonly SlideRow[]): DeliveredSlide[] {
  const slides: DeliveredSlide[] = [];
  for (const row of rows) {
    if (slides.length >= maximumDeliveredSlides) break;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (!isSlideId(id) || title.length === 0) continue;
    const destination = readDeliverableDestination(row.link_type, row.link_url);
    if (!destination) continue;
    const description = typeof row.description === 'string' ? row.description.trim() : '';
    const backgroundColor =
      typeof row.background_color === 'string' && colorPattern.test(row.background_color.trim())
        ? row.background_color.trim()
        : null;
    slides.push({
      id,
      title,
      description: description.length > 0 ? description : null,
      backgroundColor,
      destination,
      hasImage: row.has_image === true,
    });
  }
  return slides;
}
