import { describe, expect, it, vi } from 'vitest';

import { fetchWebLearnerProfile } from '../lib/learner-profile-web-client';

describe('web learner profile client', () => {
  it('accepts only exact masked identity and sends no credentials', async () => {
    const fetchMock = vi.fn(
      async () => ({ status: 200, json: async () => ({ maskedPhone: '0912***4567' }) }) as Response,
    );
    await expect(fetchWebLearnerProfile(fetchMock)).resolves.toEqual({
      status: 'ok',
      maskedPhone: '0912***4567',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/learner/profile',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  it('fails closed for unauthorized, malformed, non-string, extra-field, and network outcomes', async () => {
    expect(
      (
        await fetchWebLearnerProfile(
          vi.fn(async () => ({ status: 401, json: async () => ({}) }) as Response),
        )
      ).status,
    ).toBe('unauthorized');
    for (const body of [
      { maskedPhone: '+989****4567' },
      { maskedPhone: ['0912***4567'] },
      { maskedPhone: { value: '0912***4567' } },
      { maskedPhone: 91234567 },
      { maskedPhone: '0912***4567', rawPhone: '09121234567' },
    ]) {
      expect(
        (
          await fetchWebLearnerProfile(
            vi.fn(async () => ({ status: 200, json: async () => body }) as Response),
          )
        ).status,
      ).toBe('unavailable');
    }
    expect(
      (
        await fetchWebLearnerProfile(
          vi.fn(async () => {
            throw new Error('offline');
          }),
        )
      ).status,
    ).toBe('unavailable');
  });
});
