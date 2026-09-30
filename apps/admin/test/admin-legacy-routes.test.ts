import { describe, expect, it } from 'vitest';

import { legacyAdminRouteGate, legacyAdminRoutesEnabled } from '../lib/server/admin-legacy-routes';

describe('legacy Admin route hard-disable (LB-B30)', () => {
  it('is off by default and returns a fixed no-store 404', async () => {
    expect(legacyAdminRoutesEnabled({})).toBe(false);
    const response = legacyAdminRouteGate({});
    expect(response?.status).toBe(404);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(await response?.text()).toBe('Not found');
  });

  it('cannot be enabled in a production build whatever the flag says', () => {
    const env = { NODE_ENV: 'production', LEARNBOX_ADMIN_LEGACY_ROUTES_ENABLED: 'true' };
    expect(legacyAdminRoutesEnabled(env)).toBe(false);
    expect(legacyAdminRouteGate(env)?.status).toBe(404);
  });

  it('only opens outside production with the exact flag value', () => {
    expect(
      legacyAdminRoutesEnabled({
        NODE_ENV: 'development',
        LEARNBOX_ADMIN_LEGACY_ROUTES_ENABLED: 'true',
      }),
    ).toBe(true);
    expect(
      legacyAdminRouteGate({
        NODE_ENV: 'development',
        LEARNBOX_ADMIN_LEGACY_ROUTES_ENABLED: 'true',
      }),
    ).toBeUndefined();
    for (const value of ['1', 'TRUE', 'yes', '']) {
      expect(
        legacyAdminRoutesEnabled({
          NODE_ENV: 'development',
          LEARNBOX_ADMIN_LEGACY_ROUTES_ENABLED: value,
        }),
      ).toBe(false);
    }
  });
});
