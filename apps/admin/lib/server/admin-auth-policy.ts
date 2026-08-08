export type DisabledAdminAuthConfig = { enabled: false };

export type EnabledAdminAuthConfig = {
  enabled: true;
  origin: string;
  rpId: string;
  tokenHashKey: string;
};

export type AdminAuthConfig = DisabledAdminAuthConfig | EnabledAdminAuthConfig;

type Environment = Record<string, string | undefined>;

export class AdminSecurityError extends Error {
  constructor(
    readonly code: 'feature_disabled' | 'untrusted_origin' | 'unsupported_content_type',
    message: string,
  ) {
    super(message);
    this.name = 'AdminSecurityError';
  }
}

export function readAdminAuthConfig(environment: Environment): AdminAuthConfig {
  if (environment.LEARNBOX_ADMIN_PASSKEY_ENABLED !== 'true') return { enabled: false };

  const originValue = environment.LEARNBOX_ADMIN_ORIGIN;
  const rpId = environment.LEARNBOX_ADMIN_RP_ID;
  const tokenHashKey = environment.LEARNBOX_ADMIN_TOKEN_HASH_KEY;
  if (!originValue) throw new Error('Admin HTTPS origin is required.');

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(originValue);
  } catch {
    throw new Error('Admin HTTPS origin is invalid.');
  }
  if (
    parsedOrigin.protocol !== 'https:' ||
    parsedOrigin.origin !== originValue ||
    parsedOrigin.pathname !== '/' ||
    parsedOrigin.username ||
    parsedOrigin.password
  ) {
    throw new Error('Admin origin must be an exact HTTPS origin.');
  }
  if (!rpId || rpId !== parsedOrigin.hostname) {
    throw new Error('Admin RP ID must exactly match the admin origin hostname.');
  }
  if (!tokenHashKey || Buffer.byteLength(tokenHashKey, 'utf8') < 32) {
    throw new Error('Admin token hash key must contain at least 32 bytes.');
  }

  return { enabled: true, origin: parsedOrigin.origin, rpId, tokenHashKey };
}

export function assertTrustedAdminMutation(
  request: Request,
  config: AdminAuthConfig,
  allowedContentTypes: readonly string[],
): asserts config is EnabledAdminAuthConfig {
  if (!config.enabled) {
    throw new AdminSecurityError('feature_disabled', 'Admin authentication is disabled.');
  }
  if (request.headers.get('origin') !== config.origin) {
    throw new AdminSecurityError('untrusted_origin', 'Request origin is not trusted.');
  }

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (!contentType || !allowedContentTypes.includes(contentType)) {
    throw new AdminSecurityError(
      'unsupported_content_type',
      'Request content type is not supported.',
    );
  }
}
