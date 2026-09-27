export type AdminAuthMode = 'local-prototype' | 'server-passkey';

export function resolveAdminAuthMode(
  value = process.env.NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED,
): AdminAuthMode {
  return value === 'true' ? 'server-passkey' : 'local-prototype';
}
