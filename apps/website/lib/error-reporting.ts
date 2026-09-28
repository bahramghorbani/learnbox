/**
 * Structured server error capture for LearnBox (LB-B02).
 *
 * v1.0.0 had no error aggregation: a server fault surfaced only as an unstructured stack trace in
 * container logs that nobody watched. This module emits one single-line JSON record per captured
 * error so the host-side log scanner can count, fingerprint and alert on them.
 *
 * Privacy/security boundary. Captured records are operational telemetry, not learner data:
 *  - no phone numbers, OTP codes, session cookies, tokens or connection strings may be emitted;
 *  - message text is redacted through `redactSensitive` before it leaves the process;
 *  - request context is limited to method + route template, never a full URL with query values.
 * This is also what the LB-B04 privacy notice describes, so the two must stay consistent.
 */

export type CapturedError = {
  readonly kind: 'learnbox.error';
  readonly fingerprint: string;
  readonly name: string;
  readonly message: string;
  readonly route?: string;
  readonly method?: string;
  readonly occurredAt: string;
  readonly revision?: string;
};

export type CaptureContext = {
  readonly route?: string;
  readonly method?: string;
};

const secretPatterns: readonly RegExp[] = [
  // Connection strings, including credentials embedded in the authority section.
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
  // Bearer/authorization values.
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  // Telegram bot tokens.
  /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g,
  // Iranian mobile numbers in local or international form.
  /(?:\+?98|0)9\d{9}\b/g,
  // Explicit key=value secrets.
  /\b(?:password|passwd|secret|token|api[_-]?key|apikey|cookie|authorization)\b\s*[=:]\s*\S+/gi,
  // Long opaque values that look like signed session material.
  /\bv\d\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
];

/** Replaces anything that could be a credential or personal identifier with `[redacted]`. */
export function redactSensitive(input: string): string {
  let output = input;
  for (const pattern of secretPatterns) output = output.replace(pattern, '[redacted]');
  return output;
}

/**
 * A stable short fingerprint so repeated occurrences of the same fault aggregate into one alert
 * instead of paging once per request. Derived from the error name, the redacted message shape and
 * the route — never from values that vary per user.
 */
export function fingerprintError(name: string, message: string, route?: string): string {
  const normalised = redactSensitive(message)
    // Collapse varying numbers and quoted values so one fault yields one fingerprint.
    .replace(/\d+/g, '#')
    .replace(/["'][^"']*["']/g, '"…"')
    .trim()
    .slice(0, 200);
  const basis = `${name}|${normalised}|${route ?? ''}`;

  // FNV-1a: deterministic, dependency-free, and adequate for grouping (not a security hash).
  let hash = 0x811c9dc5;
  for (let index = 0; index < basis.length; index += 1) {
    hash ^= basis.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildCapturedError(
  error: unknown,
  context: CaptureContext = {},
  options: { clock?: () => Date; revision?: string } = {},
): CapturedError {
  const clock = options.clock ?? (() => new Date());
  const name = error instanceof Error && error.name ? error.name : 'Error';
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = redactSensitive(rawMessage).slice(0, 300);

  return {
    kind: 'learnbox.error',
    fingerprint: fingerprintError(name, rawMessage, context.route),
    name,
    message,
    occurredAt: clock().toISOString(),
    ...(context.route ? { route: context.route } : {}),
    ...(context.method ? { method: context.method } : {}),
    ...(options.revision ? { revision: options.revision } : {}),
  };
}

/** Emits one capture record. Never throws: telemetry must not break a request. */
export function captureServerError(
  error: unknown,
  context: CaptureContext = {},
  sink: (line: string) => void = (line) => console.error(line),
): CapturedError | null {
  try {
    const captured = buildCapturedError(error, context, {
      revision: process.env.LEARNBOX_REVISION,
    });
    sink(JSON.stringify(captured));
    return captured;
  } catch {
    return null;
  }
}
