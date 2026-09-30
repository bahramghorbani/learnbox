import {
  AdminSecurityError,
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';

/**
 * LB-B30: one shared entry point for every cookie-authenticated Admin mutation, with the same
 * response envelope as the learner app's `guardMutation` (LB-B29). It checks exact Origin and the
 * Content-Type allow-list and touches nothing else: no cookie, no session, no database. It MUST be
 * the first statement of a mutation route, before any session read.
 *
 * Returns `null` when the request may proceed, otherwise the complete rejection response.
 */
export function guardAdminMutation(
  request: Request,
  config: AdminAuthConfig,
  allowedContentTypes: readonly string[],
): Response | null {
  try {
    assertTrustedAdminMutation(request, config, allowedContentTypes);
    return null;
  } catch (error) {
    const headers = { 'cache-control': 'no-store', 'content-type': 'application/json' };
    const code = error instanceof AdminSecurityError ? error.code : 'request_rejected';
    if (code === 'feature_disabled') return new Response('Not found', { status: 404, headers });
    if (code === 'unsupported_content_type') {
      return new Response(JSON.stringify({ error: 'content_type_required' }), {
        status: 415,
        headers,
      });
    }
    return new Response(JSON.stringify({ error: 'request_rejected' }), { status: 403, headers });
  }
}

export type { EnabledAdminAuthConfig };
