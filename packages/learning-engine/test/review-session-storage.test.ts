import { describe, expect, it } from 'vitest';

import { createMemoryStorage, loadReviewSession, saveReviewSession } from '../src/index.js';

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
