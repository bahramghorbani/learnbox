import { readAdminAuthConfig, type AdminAuthConfig } from './admin-auth-policy';

type Environment = Record<string, string | undefined>;

export function readAdminDictionaryEditorialConfig(environment: Environment): AdminAuthConfig {
  if (environment.LEARNBOX_ADMIN_DICTIONARY_EDITORIAL_ENABLED !== 'true') {
    return { enabled: false };
  }
  return readAdminAuthConfig(environment);
}
