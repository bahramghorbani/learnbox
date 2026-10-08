import { normalizeImage, type ImageNormalization } from './image-normalization';

/**
 * Canonical slide rules, shared by the routes, the store and the tests.
 *
 * A "slide" is a row of the canonical `banners` table. There is no second slide model: this module
 * only describes what a valid slide looks like, so the Admin, the database and the learner contract
 * cannot disagree about it.
 */

/**
 * Owner decision: at most three slides may be active at once. Enforced in the database transaction
 * (see PostgresPresentationSlidesStore), never only here.
 */
export const maximumActiveSlides = 3;

export const maximumSlideTitle = 120;
export const maximumSlideDescription = 280;
export const maximumSlideUrl = 512;

/**
 * Internal learner destinations. These are the learner's own screens, including the Store.
 *
 * `banners.link_type = 'screen'` already stores exactly this, and the learner route keeps its own
 * narrower allowlist until M4.3 widens it — so authoring a Store slide here is safe: an existing
 * learner build simply does not receive it.
 */
export const learnerScreens = ['today', 'words', 'progress', 'profile', 'store'] as const;
export type LearnerScreen = (typeof learnerScreens)[number];

export type SlideDestination =
  | { kind: 'screen'; screen: LearnerScreen }
  | { kind: 'pack'; packId: string }
  | { kind: 'url'; url: string };

/** `packs.id` is a canonical text slug, not a uuid. Mirrors the Store and content-packs routes. */
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;

const blockedHostSuffixes = ['.local', '.internal', '.localhost', '.home', '.lan'];
const ipv4Pattern = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * A destination the product may hand to a learner's browser.
 *
 * Deliberately strict, because this value ends up in a tap target inside the app: https only (no
 * javascript:, data:, intent: or http:), no embedded credentials, no custom port, and a real public
 * hostname — never an IP literal, a bare label or a private-network suffix, which is how a slide
 * could otherwise be pointed at an internal service.
 */
export function parseSafeExternalUrl(raw: string): string | undefined {
  if (raw.length > maximumSlideUrl) return undefined;
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
  return href.length > maximumSlideUrl ? undefined : href;
}

function isLearnerScreen(value: unknown): value is LearnerScreen {
  return typeof value === 'string' && (learnerScreens as readonly string[]).includes(value);
}

/** Validates a client-supplied destination. Anything not explicitly allowed is rejected. */
export function parseSlideDestination(value: unknown): SlideDestination | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  switch (candidate.kind) {
    case 'screen':
      return isLearnerScreen(candidate.screen)
        ? { kind: 'screen', screen: candidate.screen }
        : undefined;
    case 'pack':
      return typeof candidate.packId === 'string' && packIdPattern.test(candidate.packId)
        ? { kind: 'pack', packId: candidate.packId }
        : undefined;
    case 'url': {
      if (typeof candidate.url !== 'string') return undefined;
      const url = parseSafeExternalUrl(candidate.url.trim());
      return url ? { kind: 'url', url } : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * The stored `link_type`/`link_url` pair as a destination, or undefined when the row predates the
 * Slider Manager and holds something it would not accept today.
 *
 * Returning undefined instead of throwing matters: the existing sample banners stay listed and
 * stay deactivatable, they are simply reported as having no canonical destination.
 */
export function readStoredDestination(
  linkType: unknown,
  linkUrl: unknown,
): SlideDestination | undefined {
  if (typeof linkUrl !== 'string' || linkUrl.length === 0) return undefined;
  if (linkType === 'screen') {
    return isLearnerScreen(linkUrl) ? { kind: 'screen', screen: linkUrl } : undefined;
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

/** The columns a destination maps onto. `banners.link_type` already has exactly these three values. */
export function toStoredDestination(destination: SlideDestination): {
  linkType: 'screen' | 'pack' | 'url';
  linkUrl: string;
} {
  switch (destination.kind) {
    case 'screen':
      return { linkType: 'screen', linkUrl: destination.screen };
    case 'pack':
      return { linkType: 'pack', linkUrl: destination.packId };
    case 'url':
      return { linkType: 'url', linkUrl: destination.url };
  }
}

/**
 * A slide image is a wide banner, so it is checked against a landscape shape. The intake pipeline
 * is the shared one, so a slide image is decoded and re-encoded exactly like the splash.
 */
const slideImageShape = {
  maximumInputBytes: 6 * 1024 * 1024,
  minimumWidth: 720,
  minimumHeight: 240,
  minimumAspectRatio: 1.2,
  maximumAspectRatio: 4,
} as const;

export function normalizeSlideImage(bytes: Buffer): Promise<ImageNormalization> {
  return normalizeImage(bytes, slideImageShape);
}
