import { describe, expect, it } from 'vitest';

import { scanPackMedia } from '../app/components/card-media-bulk';

const kinds = ['image', 'word_audio', 'sentence_audio'] as const;
const state = (overrides: Record<string, Record<string, unknown>> = {}) =>
  kinds.map((kind) => ({
    kind,
    accepted: null,
    latestCandidate: null,
    acceptedValidity: null,
    latestValidity: null,
    needsGeneration: true,
    ...overrides[kind],
  })) as never;

describe('whole-pack media scan', () => {
  it('lists only media that is actually needed and makes no provider call', async () => {
    const scan = await scanPackMedia(
      [
        { cardId: 'a', label: 'der Apfel' },
        { cardId: 'b', label: 'die Birne' },
        { cardId: 'c', label: 'das Ei' },
      ],
      async (cardId) =>
        cardId === 'a'
          ? state({
              image: { acceptedValidity: 'valid', needsGeneration: false },
              word_audio: {
                latestCandidate: { status: 'ready' },
                latestValidity: 'valid',
                needsGeneration: false,
              },
              sentence_audio: { latestCandidate: { status: 'generating' }, needsGeneration: false },
            })
          : cardId === 'b'
            ? state({ image: { acceptedValidity: 'unverifiable', needsGeneration: false } })
            : undefined,
    );

    expect(scan.needed.map((item) => `${item.cardId}:${item.kind}`)).toEqual([
      'b:word_audio',
      'b:sentence_audio',
    ]);
    expect(scan.awaitingAcceptance).toEqual([
      { cardId: 'a', label: 'der Apfel', kind: 'word_audio' },
    ]);
    expect(scan.generating).toEqual([{ cardId: 'a', label: 'der Apfel', kind: 'sentence_audio' }]);
    expect(scan.unverifiable).toEqual([{ cardId: 'b', label: 'die Birne', kind: 'image' }]);
    expect(scan.unreadable).toEqual([{ cardId: 'c', label: 'das Ei' }]);
  });
});
