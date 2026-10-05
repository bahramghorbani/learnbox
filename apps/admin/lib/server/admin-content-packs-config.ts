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

/**
 * Separate default-off gate for Pack/Card WRITES (Phase 1, Milestone 1.2).
 *
 * The read flag above deliberately grants no mutation capability, so management needs its own
 * switch and additionally requires the read workspace to be on — a write surface with no readable
 * workspace is never a valid configuration. Enabling this flag authorizes draft authoring only:
 * publication stays behind the canonical review/release gates, and it grants no migration,
 * staging or Production activation authority.
 */
export function readAdminContentPacksManageConfig(environment: Environment): AdminAuthConfig {
  if (environment.LEARNBOX_ADMIN_CONTENT_PACKS_MANAGE_ENABLED !== 'true') return { enabled: false };
  return readAdminContentPacksConfig(environment);
}
