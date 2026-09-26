export type InviteGateMode = 'local-prototype' | 'server-invite';

export function resolveInviteGateMode(value?: string): InviteGateMode {
  // 'true' = require invite code (alpha testing)
  // anything else (including 'false', undefined) = skip invite gate (production)
  return value === 'true' ? 'server-invite' : 'local-prototype';
}
