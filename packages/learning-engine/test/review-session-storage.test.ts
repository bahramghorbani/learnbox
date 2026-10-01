import { describe, expect, it } from 'vitest';

import {
  decideResume,
  createMemoryStorage,
  loadReviewSession,
  resolveResumeIndex,
  saveReviewSession,
} from '../src/index.js';

describe('review session storage', () => {
  it('restores the next card for an interrupted device-local review', () => {
    const storage = createMemoryStorage();
    saveReviewSession(storage, 'review-session', { nextCardIndex: 1 });

    expect(loadReviewSession(storage, 'review-session')).toEqual({ nextCardIndex: 1 });
  });

  it('discards malformed session state instead of resuming an unknown card', () => {
    const storage = createMemoryStorage();
    storage.setItem('review-session', JSON.stringify({ nextCardIndex: -1 }));

    expect(loadReviewSession(storage, 'review-session')).toBeNull();
    expect(storage.getItem('review-session')).toBeNull();
  });
});

describe('resume by card identity (LB-B35 CP4)', () => {
  const queue = ['a', 'b', 'c'];

  it('follows the saved card to its new position when the queue was rebuilt in another order', () => {
    expect(resolveResumeIndex({ nextCardIndex: 2, nextCardId: 'c' }, ['x', 'a', 'b', 'c'])).toBe(3);
    expect(resolveResumeIndex({ nextCardIndex: 0, nextCardId: 'a' }, ['c', 'b', 'a'])).toBe(2);
  });

  it('a saved card that is no longer queued restarts at the start instead of skipping unseen cards', () => {
    expect(resolveResumeIndex({ nextCardIndex: 2, nextCardId: 'gone' }, queue)).toBeNull();
  });

  it('a legacy index-only record keeps the v1.2.1 meaning', () => {
    expect(resolveResumeIndex({ nextCardIndex: 1 }, queue)).toBe(1);
    expect(resolveResumeIndex({ nextCardIndex: 3 }, queue)).toBeNull();
  });

  it('nothing to resume for an empty queue or no record', () => {
    expect(resolveResumeIndex(null, queue)).toBeNull();
    expect(resolveResumeIndex({ nextCardIndex: 0, nextCardId: 'a' }, [])).toBeNull();
  });

  it('round-trips the identity, still loads index-only records, and rejects a malformed identity', () => {
    const storage = createMemoryStorage();
    saveReviewSession(storage, 'k', { nextCardIndex: 1, nextCardId: 'b' });
    expect(loadReviewSession(storage, 'k')).toEqual({ nextCardIndex: 1, nextCardId: 'b' });
    storage.setItem('k', JSON.stringify({ nextCardIndex: 1 }));
    expect(loadReviewSession(storage, 'k')).toEqual({ nextCardIndex: 1 });
    for (const bad of [
      { nextCardIndex: 1, nextCardId: 7 },
      { nextCardIndex: 1, nextCardId: '' },
    ]) {
      storage.setItem('k', JSON.stringify(bad));
      expect(loadReviewSession(storage, 'k')).toBeNull();
    }
  });
});

describe('resume decision with a not-yet-loaded queue (LB-B35 CP4 defect found in staging)', () => {
  const saved = { nextCardIndex: 3, nextCardId: 'bett' };
  const queue = ['apfel', 'bahnhof', 'bett', 'brot', 'danke'];

  it('keeps the record while the queue has not loaded (empty queue means unknown, not "nothing due")', () => {
    expect(decideResume(saved, [], false)).toEqual({ action: 'wait' });
    expect(decideResume({ nextCardIndex: 2 }, [], false)).toEqual({ action: 'wait' });
  });

  it('card identity wins over a stale position once the queue has loaded', () => {
    expect(decideResume(saved, queue, true)).toEqual({ action: 'resume', index: 2 });
  });

  it('follows the card after a reorder', () => {
    expect(decideResume(saved, ['bett', 'apfel', 'bahnhof'], true)).toEqual({
      action: 'resume',
      index: 0,
    });
  });

  it('follows the card after earlier cards disappear', () => {
    expect(decideResume(saved, ['bett', 'brot'], true)).toEqual({ action: 'resume', index: 0 });
  });

  it('clears only when a LOADED queue no longer contains the card', () => {
    expect(decideResume(saved, ['apfel', 'brot'], true)).toEqual({ action: 'clear' });
    expect(decideResume(saved, [], true)).toEqual({ action: 'clear' });
  });

  it('legacy index-only record: honoured by index, cleared when out of range', () => {
    expect(decideResume({ nextCardIndex: 2 }, queue, true)).toEqual({ action: 'resume', index: 2 });
    expect(decideResume({ nextCardIndex: 9 }, queue, true)).toEqual({ action: 'clear' });
  });

  it('no record: nothing to resume', () => {
    expect(decideResume(null, queue, true)).toEqual({ action: 'clear' });
  });
});
