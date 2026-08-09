export type InviteGateMode = 'local-prototype' | 'server-invite';

export function resolveInviteGateMode(value?: string): InviteGateMode {
  return value === 'true' ? 'server-invite' : 'local-prototype';
}
