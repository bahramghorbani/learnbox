import { describe, expect, it, vi } from 'vitest';

import { createPackMediaRunnerRoute } from '../lib/server/admin-pack-media-job-routes';

const runnerToken = 'test-token-00000000000000000000000000000000';

const route = (environment: Record<string, string | undefined>, runOne = vi.fn()) =>
  createPackMediaRunnerRoute({
    enabled: true,
    config: { enabled: false },
    environment,
    service: { runOne } as never,
  });

describe('pack-media internal runner route', () => {
  it('stays hidden until an explicit runtime enablement', async () => {
    const response = await route({ LEARNBOX_PACK_MEDIA_RUNNER_TOKEN: runnerToken })(
      new Request('http://admin.test/api/internal/content/media/runner', { method: 'POST' }),
    );

    expect(response.status).toBe(404);
  });

  it('rejects a missing or wrong bearer token without calling the worker', async () => {
    const runOne = vi.fn();
    const handler = route(
      { LEARNBOX_PACK_MEDIA_RUNNER_ENABLED: 'true', LEARNBOX_PACK_MEDIA_RUNNER_TOKEN: runnerToken },
      runOne,
    );

    const response = await handler(
      new Request('http://admin.test/api/internal/content/media/runner', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-token' },
      }),
    );

    expect(response.status).toBe(401);
    expect(runOne).not.toHaveBeenCalled();
  });

  it('runs exactly one durable worker tick after machine authentication', async () => {
    const runOne = vi.fn(async () => ({ status: 'idle' }));
    const response = await route(
      { LEARNBOX_PACK_MEDIA_RUNNER_ENABLED: 'true', LEARNBOX_PACK_MEDIA_RUNNER_TOKEN: runnerToken },
      runOne,
    )(
      new Request('http://admin.test/api/internal/content/media/runner', {
        method: 'POST',
        headers: { authorization: `Bearer ${runnerToken}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'idle' });
    expect(runOne).toHaveBeenCalledTimes(1);
  });
});
