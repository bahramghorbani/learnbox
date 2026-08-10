import { describe, expect, it, vi } from 'vitest';

import {
  ConsentGatedAnalyticsClient,
  createPrivacySafeAnalyticsEvent,
  isAnalyticsEventName,
} from '../src/index.js';

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

  it('rejects an invalid event timestamp before an event is created', () => {
    expect(() =>
      createPrivacySafeAnalyticsEvent(
        'free_pack_started',
        { content_version: 'v1', pack_id: 'learnbox_start_a1_essentials' },
        new Date('not-a-date'),
      ),
    ).toThrow('Analytics event time must be valid.');
  });

  it('rejects a property value that is not coarse and stable', () => {
    // Whitespace and mixed-case values are not coarse identifiers.
    expect(() =>
      createPrivacySafeAnalyticsEvent('free_pack_started', {
        content_version: 'V1 has spaces',
        pack_id: 'learnbox_start_a1_essentials',
      }),
    ).toThrow('non-coarse property value');
  });

  it('recognizes documented event names and rejects unknown ones', () => {
    expect(isAnalyticsEventName('free_pack_started')).toBe(true);
    expect(isAnalyticsEventName('paywall_viewed')).toBe(true);
    expect(isAnalyticsEventName('not_a_real_event')).toBe(false);
    expect(isAnalyticsEventName('')).toBe(false);
  });

  it('does not deliver with explicit denied consent', async () => {
    const delivery = { deliver: vi.fn().mockResolvedValue(undefined) };
    const client = new ConsentGatedAnalyticsClient(delivery, 'denied');

    await expect(
      client.track('first_session_completed', { session_length_bucket: '10_15' }),
    ).resolves.toBe(false);
    expect(delivery.deliver).not.toHaveBeenCalled();
  });

  it('propagates a delivery failure after validation', async () => {
    const delivery = { deliver: vi.fn().mockRejectedValue(new Error('network down')) };
    const client = new ConsentGatedAnalyticsClient(delivery, 'granted');

    await expect(
      client.track('first_session_completed', { session_length_bucket: '10_15' }),
    ).rejects.toThrow('network down');
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
  });
});
