import { readAdminAuthConfig, type AdminAuthConfig } from './admin-auth-policy';

type Environment = Record<string, string | undefined>;

/**
 * Dedicated default-off runtime gate for the read-only Content & Packs workspace routes (Phase 1,
 * Milestone 1.1). Reads stay unavailable unless `LEARNBOX_ADMIN_CONTENT_PACKS_ENABLED=true` AND
 * the Passkey auth runtime is enabled, because every request must resolve a canonical session
 * actor. Configuring this flag never authorizes migration execution, staging or Production
 * activation, and it grants no mutation capability.
 */
export function readAdminContentPacksConfig(environment: Environment): AdminAuthConfig {
  if (environment.LEARNBOX_ADMIN_CONTENT_PACKS_ENABLED !== 'true') return { enabled: false };
  const auth = readAdminAuthConfig(environment);
  if (!auth.enabled) return { enabled: false };
  return auth;
}
