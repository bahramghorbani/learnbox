import { describe, expect, it, vi } from 'vitest';

import { ConsentGatedAnalyticsClient, createPrivacySafeAnalyticsEvent } from '../src/index.js';

describe('privacy-safe analytics events', () => {
  it('accepts only the documented coarse event fields', () => {
    expect(
      createPrivacySafeAnalyticsEvent(
        'free_pack_started',
        { content_version: 'v1', pack_id: 'learnbox_start_a1_essentials' },
        new Date('2026-07-28T10:00:00.000Z'),
      ),
    ).toEqual({
      name: 'free_pack_started',
      properties: { content_version: 'v1', pack_id: 'learnbox_start_a1_essentials' },
      occurredAt: '2026-07-28T10:00:00.000Z',
    });
  });

  it('rejects free text and unexpected fields before an event is created', () => {
    expect(() =>
      createPrivacySafeAnalyticsEvent('first_session_completed', {
        learner_note: 'شماره من 0912...',
        session_length_bucket: '10_15',
      }),
    ).toThrow('invalid properties');

    expect(() =>
      createPrivacySafeAnalyticsEvent('first_session_completed', {
        session_length_bucket: 'about ten minutes',
      }),
    ).toThrow('non-coarse property value');
  });

  it('does not deliver an event without explicit consent', async () => {
    const delivery = { deliver: vi.fn().mockResolvedValue(undefined) };
    const client = new ConsentGatedAnalyticsClient(delivery, 'unknown');

    await expect(
      client.track('first_session_completed', { session_length_bucket: '10_15' }),
    ).resolves.toBe(false);
    expect(delivery.deliver).not.toHaveBeenCalled();
  });

  it('delivers only after consent and only after validation', async () => {
    const delivery = { deliver: vi.fn().mockResolvedValue(undefined) };
    const client = new ConsentGatedAnalyticsClient(delivery, 'granted');

    await expect(
      client.track('personal_word_limit_reached', { limit_version: 'v1' }),
    ).resolves.toBe(true);
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
  });
});
