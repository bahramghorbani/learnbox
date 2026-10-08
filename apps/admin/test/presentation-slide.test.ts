import { describe, expect, it } from 'vitest';

import {
  learnerScreens,
  maximumActiveSlides,
  parseSafeExternalUrl,
  parseSlideDestination,
  readStoredDestination,
  toStoredDestination,
} from '../lib/server/presentation-slide.js';

/**
 * Phase 4 / Milestone 4.2 — the slide destination rules.
 *
 * A destination ends up as a tap target inside the learner app, so this is a trust boundary and not
 * a formatting concern: the accept list is tiny and everything else is refused.
 */

describe('slide destinations', () => {
  it('accepts exactly the five learner screens, including the Store', () => {
    expect([...learnerScreens]).toEqual(['today', 'words', 'progress', 'profile', 'store']);
    for (const screen of learnerScreens) {
      expect(parseSlideDestination({ kind: 'screen', screen })).toEqual({ kind: 'screen', screen });
    }
    for (const screen of ['admin', 'settings', 'TODAY', '', null, 42]) {
      expect(parseSlideDestination({ kind: 'screen', screen })).toBeUndefined();
    }
  });

  it('accepts a canonical pack id and nothing that could be a path or an injection', () => {
    expect(parseSlideDestination({ kind: 'pack', packId: 'start-a1' })).toEqual({
      kind: 'pack',
      packId: 'start-a1',
    });
    for (const packId of [
      '',
      'a',
      '../../etc/passwd',
      'Start-A1',
      "start'; DROP TABLE packs;--",
      'pack id',
      '-leading-hyphen',
      'x'.repeat(200),
    ]) {
      expect(parseSlideDestination({ kind: 'pack', packId }), packId).toBeUndefined();
    }
  });

  it('accepts only a plain public https URL', () => {
    expect(parseSafeExternalUrl('https://learnboxapp.com/blog?x=1#top')).toBe(
      'https://learnboxapp.com/blog?x=1#top',
    );
    for (const url of [
      'http://learnboxapp.com',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'intent://x',
      'file:///etc/passwd',
      'https://user:pw@learnboxapp.com',
      'https://learnboxapp.com:8443/x',
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://10.0.0.5/x',
      'https://[::1]/x',
      'https://intranet/x',
      'https://service.internal/x',
      'https://box.local/x',
      `https://learnboxapp.com/${'x'.repeat(600)}`,
      'not a url',
      '',
    ]) {
      expect(parseSafeExternalUrl(url), url).toBeUndefined();
      expect(parseSlideDestination({ kind: 'url', url }), url).toBeUndefined();
    }
  });

  it('refuses anything that is not one of the three canonical kinds', () => {
    for (const value of [
      undefined,
      null,
      'screen',
      42,
      {},
      { kind: 'deeplink', url: 'https://learnboxapp.com' },
      { kind: 'screen' },
      { kind: 'pack' },
      { kind: 'url' },
    ]) {
      expect(parseSlideDestination(value)).toBeUndefined();
    }
  });

  it('maps a destination onto the existing banners columns and back', () => {
    expect(toStoredDestination({ kind: 'screen', screen: 'store' })).toEqual({
      linkType: 'screen',
      linkUrl: 'store',
    });
    expect(toStoredDestination({ kind: 'pack', packId: 'start-a1' })).toEqual({
      linkType: 'pack',
      linkUrl: 'start-a1',
    });
    expect(toStoredDestination({ kind: 'url', url: 'https://learnboxapp.com/x' })).toEqual({
      linkType: 'url',
      linkUrl: 'https://learnboxapp.com/x',
    });

    expect(readStoredDestination('screen', 'store')).toEqual({ kind: 'screen', screen: 'store' });
    expect(readStoredDestination('pack', 'start-a1')).toEqual({ kind: 'pack', packId: 'start-a1' });
    expect(readStoredDestination('url', 'https://learnboxapp.com/x')).toEqual({
      kind: 'url',
      url: 'https://learnboxapp.com/x',
    });
  });

  it('reports a pre-existing row with an unsupported destination as having none', () => {
    // Reported, not rewritten and not thrown on: such a row must stay listed and deactivatable.
    expect(readStoredDestination('screen', 'leaderboard')).toBeUndefined();
    expect(readStoredDestination('url', 'http://old.example.com/promo')).toBeUndefined();
    expect(readStoredDestination('banner', 'today')).toBeUndefined();
    expect(readStoredDestination('screen', null)).toBeUndefined();
    expect(readStoredDestination(null, null)).toBeUndefined();
  });

  it('states the active maximum once, as the owner decided it', () => {
    expect(maximumActiveSlides).toBe(3);
  });
});
