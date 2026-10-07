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

/**
 * Separate default-off gate for the commercial Store surface (Phase 2, Milestone 2.1).
 *
 * Additionally requires the Content & Packs read workspace, because a Store listing references a
 * canonical pack and an operator must be able to see the pack they are listing. Enabling this flag
 * authorizes commercial listing state only: it grants no learner-facing Store, no entitlement, no
 * acquisition, no payment capability, and no migration, staging or Production activation authority.
 */
export function readAdminStoreConfig(environment: Environment): AdminAuthConfig {
  if (environment.LEARNBOX_ADMIN_STORE_ENABLED !== 'true') return { enabled: false };
  return readAdminContentPacksConfig(environment);
}

/**
 * Separate default-off gate for the user support surface (Phase 3, Milestone 3.1).
 *
 * Unlike the Store gate this does NOT require the Content & Packs workspace: account support is
 * not a content capability and an operator suspending an abusive account has no reason to hold
 * content permissions. It still requires the Passkey auth runtime, because every support action
 * must resolve a canonical Admin actor to record in the audit trail.
 *
 * Enabling this flag authorizes reading the canonical user list and changing one account's
 * status. It grants no entitlement, no learning-state, no deletion and no content capability, and
 * no migration, staging or Production activation authority.
 */
export function readAdminSupportConfig(environment: Environment): AdminAuthConfig {
  if (environment.LEARNBOX_ADMIN_SUPPORT_ENABLED !== 'true') return { enabled: false };
  return readAdminAuthConfig(environment);
}
