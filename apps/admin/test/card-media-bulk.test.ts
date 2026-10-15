import { describe, expect, it, vi } from 'vitest';

import { BULK_MEDIA_CARD_CAP, runBulkCardMediaGeneration } from '../app/components/card-media-bulk';

const cards = Array.from({ length: BULK_MEDIA_CARD_CAP + 1 }, (_, index) => ({
  cardId: `card-${index}`,
  label: `Card ${index}`,
}));

describe('bulk card media runner', () => {
  it('skips accepted/pending candidates, caps work, and never accepts media', async () => {
    const generate = vi.fn().mockResolvedValue({ ok: true });
    const accept = vi.fn();
    const results: string[] = [];
    await runBulkCardMediaGeneration(cards, 'image', {
      loadState: async (cardId) =>
        cardId === 'card-0'
          ? [{ kind: 'image', accepted: {} as never, latestCandidate: null }]
          : cardId === 'card-1'
            ? [{ kind: 'image', accepted: null, latestCandidate: { status: 'ready' } as never }]
            : [],
      generate,
      onResult: (result) => results.push(result.status),
    });

    expect(generate).toHaveBeenCalledTimes(BULK_MEDIA_CARD_CAP - 2);
    expect(results.slice(0, 2)).toEqual(['skipped', 'skipped']);
    expect(accept).not.toHaveBeenCalled();
  });

  it('flags blocked DAS audio and stops at a provider error', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: 'das_voice_unconfigured', message: 'blocked' })
      .mockResolvedValueOnce({ ok: false, code: 'provider_failed', message: 'failed' });
    const results: string[] = [];
    await runBulkCardMediaGeneration(cards.slice(0, 3), 'audio', {
      loadState: async () => [],
      generate,
      onResult: (result) => results.push(result.status),
    });

    expect(results).toEqual(['blocked', 'failed']);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
