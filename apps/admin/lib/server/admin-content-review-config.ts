import { readAdminAuthConfig, type AdminAuthConfig } from './admin-auth-policy';

type Environment = Record<string, string | undefined>;

/**
 * Dedicated default-off runtime gate for the persisted content-review queue, check and decision
 * routes (PDR-008). Reads and mutations stay unavailable unless
 * `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED=true` AND the Passkey auth runtime is enabled, because
 * every request must resolve a canonical session actor. Configuring this flag never authorizes
 * migration execution, staging or Production activation.
 */
export function readAdminContentReviewConfig(environment: Environment): AdminAuthConfig {
  if (environment.LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED !== 'true') return { enabled: false };
  const auth = readAdminAuthConfig(environment);
  if (!auth.enabled) return { enabled: false };
  return auth;
}
