/**
 * The one guard for browser state-changing requests (LB-B29).
 *
 * Every route that changes state on behalf of a browser — signed in or not — runs this before it
 * reads a session, a body or a database. Nothing else may call `isTrustedRequestOrigin`: a route
 * that re-implements the check is a route whose policy can drift (it did, before v1.2.1).
 *
 * Contract, identical for every guarded route:
 *  1. the HTTP method is the one the route declares;
 *  2. `Content-Type` is exactly `application/json` (optionally `; charset=utf-8`), which also stops
 *     the "simple request" form/text posts a hostile page can send without a CORS preflight;
 *  3. `Origin` is present and equals a configured public origin (see `trusted-origin.ts`).
 *
 * Any failure is `403 {"error":"request_rejected"}` with `cache-control: no-store`. The rejection
 * is deliberately silent: it does not say which of the three checks failed, does not touch cookies,
 * and never reaches authentication, so a foreign site cannot probe whether a session exists.
 *
 * Bearer-token routes (mobile) and hard-disabled routes are not guarded here by design; the route
 * inventory test (`test/mutation-route-inventory.test.ts`) forces every non-GET route to declare
 * which of those categories it belongs to.
 */

import {
  hasJsonContentType,
  isTrustedRequestOrigin,
  type EnvironmentSource,
} from './trusted-origin';

export type MutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface MutationGuardOptions {
  /** The single method this route accepts. */
  method: MutationMethod;
  /** Injectable for tests; defaults to `process.env`. */
  environment?: EnvironmentSource;
}

export const MUTATION_REJECTION_ERROR = 'request_rejected';

/** The one rejection every guarded route returns. */
export function mutationRejection(): Response {
  return Response.json(
    { error: MUTATION_REJECTION_ERROR },
    {
      status: 403,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    },
  );
}

/** True when the request passes method, content-type and Origin checks. */
export function isTrustedMutation(request: Request, options: MutationGuardOptions): boolean {
  if (request.method !== options.method) return false;
  if (!hasJsonContentType(request, true)) return false;
  return isTrustedRequestOrigin(request, options.environment ?? process.env);
}

/**
 * Route entry point: returns the rejection `Response` to send, or `null` to continue.
 *
 *   const rejected = guardMutation(request, { method: 'PATCH' });
 *   if (rejected) return rejected;
 */
export function guardMutation(request: Request, options: MutationGuardOptions): Response | null {
  return isTrustedMutation(request, options) ? null : mutationRejection();
}
