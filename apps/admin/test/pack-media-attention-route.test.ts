import { describe, expect, it, vi } from 'vitest';
import { createPackMediaJobResolveRoute } from '../lib/server/admin-pack-media-job-routes';
import { hashAdminSecret } from '../lib/server/admin-session';

const origin = 'https://admin.learnboxapp.com';
const config = {
  enabled: true as const,
  origin,
  rpId: 'admin.learnboxapp.com',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-20T15:00:00Z');
const actor = '55555555-5555-4555-8555-555555555555';
const jobId = '22222222-2222-4222-8222-222222222222';
const itemId = '11111111-1111-4111-8111-111111111111';
const csrf = 'c'.repeat(43);
const session = 's'.repeat(43);

function route(recent = true) {
  const service = {
    resolve: vi.fn(async () => ({ status: 'applied' as const, job: { id: jobId } })),
  };
  const handler = createPackMediaJobResolveRoute({
    enabled: true,
    config,
    environment: {},
    now: () => now,
    sessionStore: {
      findActiveSession: async () => ({
        userId: actor,
        csrfHash: hashAdminSecret(csrf, config.tokenHashKey),
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        recentAuthenticatedAt: recent ? now : new Date(now.getTime() - 10 * 60_000),
      }),
      touchSession: async () => true,
    },
    service: service as never,
  });
  function request(options: { requestOrigin?: string; csrf?: string; confirm?: boolean } = {}) {
    return new Request(`${origin}/api/content/media/jobs/resolve`, {
      method: 'POST',
      headers: {
        origin: options.requestOrigin ?? origin,
        'content-type': 'application/json',
        cookie: `__Host-learnbox_admin_session=${session}`,
        'x-learnbox-csrf-token': options.csrf ?? csrf,
      },
      body: JSON.stringify({
        jobId,
        itemId,
        action: 'retry',
        reason: 'reviewed previous charge',
        confirmedPotentialDuplicateCharge: options.confirm ?? false,
      }),
    });
  }
  return { service, handler, request };
}

describe('pack-media resolution route guards', () => {
  it('refuses cross-origin, invalid CSRF and stale reauthentication before the service', async () => {
    const active = route();
    expect(
      (await active.handler(active.request({ requestOrigin: 'https://evil.example' }))).status,
    ).toBe(400);
    expect((await active.handler(active.request({ csrf: 'x'.repeat(43) }))).status).toBe(400);
    expect(active.service.resolve).not.toHaveBeenCalled();
    const stale = route(false);
    expect((await stale.handler(stale.request())).status).toBe(428);
    expect(stale.service.resolve).not.toHaveBeenCalled();
  });
});
