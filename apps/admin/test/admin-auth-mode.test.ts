import { describe, expect, it } from 'vitest';

import { resolveAdminAuthMode } from '../app/admin-auth-mode';

describe('resolveAdminAuthMode', () => {
  it('keeps the local prototype unless the public UI flag is exactly true', () => {
    expect(resolveAdminAuthMode()).toBe('local-prototype');
    expect(resolveAdminAuthMode('TRUE')).toBe('local-prototype');
    expect(resolveAdminAuthMode('true')).toBe('server-passkey');
  });
});
