import { describe, expect, it, vi } from 'vitest';

import {
  resumableItems,
  runPackMedia,
  scanPackMedia,
  type PackMediaResult,
} from '../app/components/card-media-bulk';

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

describe('whole-pack media completion', () => {
  it('lists only media that is actually needed, and makes no provider call while scanning', async () => {
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
    expect(scan.generating).toHaveLength(1);
    expect(scan.unverifiable).toEqual([{ cardId: 'b', label: 'die Birne', kind: 'image' }]);
    expect(scan.unreadable).toEqual([{ cardId: 'c', label: 'das Ei' }]);
  });

  it('does not start another paid request after its panel is closed mid-call', async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    let panelOpen = true;
    const generate = vi
      .fn()
      .mockImplementationOnce(async () => {
        await first;
        return { ok: true };
      })
      .mockResolvedValue({ ok: true });
    const results: PackMediaResult[] = [];
    const running = runPackMedia(
      [
        { cardId: 'a', label: 'A', kind: 'image' },
        { cardId: 'b', label: 'B', kind: 'image' },
      ],
      {
        generate,
        onResult: (result) => results.push(result),
        shouldContinue: () => panelOpen,
      },
    );

    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    panelOpen = false;
    release();
    await running;

    expect(generate).toHaveBeenCalledTimes(1);
    expect(results).toEqual([]);
  });

  it('stops without retrying an in-flight item after an already-generating conflict', async () => {
    const items = [
      { cardId: 'a', label: 'A', kind: 'image' as const },
      { cardId: 'b', label: 'B', kind: 'image' as const },
      { cardId: 'c', label: 'C', kind: 'image' as const },
    ];
    const generate = vi.fn().mockResolvedValue({ ok: false, code: 'already_generating' });
    const results: PackMediaResult[] = [];

    await runPackMedia(items, { generate, onResult: (result) => results.push(result) });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.status)).toEqual(['in_progress', 'stopped', 'stopped']);
    expect(resumableItems(results).map((item) => item.cardId)).toEqual(['b', 'c']);
  });

  it('stops at the first failure, then resumes only the failed and untouched items', async () => {
    const items = [
      { cardId: 'a', label: 'A', kind: 'image' as const },
      { cardId: 'b', label: 'B', kind: 'image' as const },
      { cardId: 'c', label: 'C', kind: 'image' as const },
    ];
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, code: 'provider_failed', message: 'failed' });
    const results: PackMediaResult[] = [];
    await runPackMedia(items, { generate, onResult: (result) => results.push(result) });
    expect(results.map((result) => result.status)).toEqual(['generated', 'failed', 'stopped']);
    expect(generate).toHaveBeenCalledTimes(2);

    const resume = resumableItems(results);
    expect(resume.map((item) => item.cardId)).toEqual(['b', 'c']);
    const retry = vi.fn().mockResolvedValue({ ok: true, status: 'not_needed' });
    const second: PackMediaResult[] = [];
    await runPackMedia(resume, { generate: retry, onResult: (result) => second.push(result) });
    expect(second.map((result) => result.status)).toEqual(['not_needed', 'not_needed']);
  });
});
