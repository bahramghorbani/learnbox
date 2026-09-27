/**
 * Canonical public-origin trust for browser mutation endpoints.
 *
 * Why this exists: Next.js standalone builds `request.url` from the internal
 * listen address (HOSTNAME, typically `0.0.0.0`). Behind a TLS-terminating
 * reverse proxy the internal URL therefore never equals the browser's real
 * `Origin`, so a naive `new URL(origin).origin === new URL(request.url).origin`
 * same-origin check rejects every legitimate browser request.
 *
 * Trust model:
 *  - The canonical public origin is supplied by configuration
 *    (`LEARNBOX_PUBLIC_APP_ORIGIN`), never inferred from the request.
 *  - `X-Forwarded-*` headers are attacker-controlled on any deployment whose
 *    proxy does not strip them, so they are NEVER consulted.
 *  - Comparison is exact on scheme + host + port, so lookalike hosts, suffix
 *    hosts, other schemes and other ports are rejected.
 *  - Fail closed: configured-but-unparseable yields an empty allowlist, and a
 *    missing/malformed `Origin` is rejected.
 *  - When nothing is configured the check falls back to the request's own
 *    origin, preserving strict same-origin behaviour for local development and
 *    tests without ever widening production trust.
 */

const ORIGIN_VARIABLE = 'LEARNBOX_PUBLIC_APP_ORIGIN';

/** Minimal shape of an environment map; `process.env` satisfies it. */
export type EnvironmentSource = Record<string, string | undefined>;

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (!parsed.hostname) return null;
  return parsed.origin;
}

/**
 * Configured canonical origins. Returns `null` when unconfigured so callers can
 * fall back to strict same-origin; returns `[]` when configured but invalid so
 * callers fail closed instead of silently trusting the request.
 */
export function configuredPublicOrigins(
  environment: EnvironmentSource = process.env,
): string[] | null {
  const raw = environment[ORIGIN_VARIABLE];
  if (raw === undefined || raw.trim() === '') return null;
  const origins = raw
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter((entry): entry is string => entry !== null);
  return Array.from(new Set(origins));
}

/**
 * True when the request's `Origin` header is an allowed public origin for a
 * browser mutation. A missing or malformed `Origin` is always rejected.
 */
export function isTrustedRequestOrigin(
  request: Request,
  environment: EnvironmentSource = process.env,
): boolean {
  const header = request.headers.get('origin');
  if (!header) return false;
  const origin = normalizeOrigin(header);
  if (!origin) return false;

  const configured = configuredPublicOrigins(environment);
  if (configured !== null) return configured.includes(origin);

  // Unconfigured: strict same-origin against the request's own URL.
  let requestOrigin: string | null;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }
  return requestOrigin === origin;
}

/** JSON content type required for browser mutation endpoints. */
export function hasJsonContentType(request: Request, exact: boolean): boolean {
  const contentType = request.headers.get('content-type') ?? '';
  return exact
    ? /^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)
    : contentType.toLowerCase().startsWith('application/json');
}

/** Full gate for a same-origin JSON browser mutation. */
export function isTrustedJsonMutation(
  request: Request,
  options: { exactContentType?: boolean; environment?: EnvironmentSource } = {},
): boolean {
  if (request.method !== 'POST') return false;
  if (!hasJsonContentType(request, options.exactContentType ?? false)) return false;
  return isTrustedRequestOrigin(request, options.environment ?? process.env);
}
