import { describe, expect, it } from 'vitest';

import { buildStartMediaSources, resolveStartMediaMode } from '../app/start-media';

describe('Start media mode', () => {
  it.each([
    [
      { privateMediaFlag: 'true', authMode: 'server-otp', hostname: 'app.learnboxapp.com' },
      'private-session',
    ],
    [
      { privateMediaFlag: 'true', authMode: 'server-otp', hostname: 'localhost' },
      'private-session',
    ],
    [
      { privateMediaFlag: 'TRUE', authMode: 'server-otp', hostname: 'app.learnboxapp.com' },
      'placeholder',
    ],
    [
      { privateMediaFlag: 'true', authMode: 'local-prototype', hostname: 'app.learnboxapp.com' },
      'placeholder',
    ],
    [
      { privateMediaFlag: undefined, authMode: 'local-prototype', hostname: 'localhost' },
      'local-preview',
    ],
    [
      { privateMediaFlag: undefined, authMode: 'local-prototype', hostname: '127.0.0.1' },
      'local-preview',
    ],
    [
      { privateMediaFlag: undefined, authMode: 'local-prototype', hostname: 'preview.example' },
      'placeholder',
    ],
  ] as const)('resolves %o as %s', (input, expected) => {
    expect(resolveStartMediaMode(input)).toBe(expected);
  });
});

describe('Start media sources', () => {
  it('builds only relative same-origin private paths', () => {
    expect(buildStartMediaSources('start-a1-001', 'private-session')).toEqual({
      image: '/api/private-media/start-a1-001/image',
      wordAudio: '/api/private-media/start-a1-001/word-audio',
      sentenceAudio: '/api/private-media/start-a1-001/sentence-audio',
    });
  });

  it('builds localhost preview paths without changing the content identity', () => {
    expect(buildStartMediaSources('start-a1-001', 'local-preview')).toEqual({
      image: '/api/local-preview-media/start-a1-001/image',
      wordAudio: '/api/local-preview-media/start-a1-001/word-audio',
      sentenceAudio: '/api/local-preview-media/start-a1-001/sentence-audio',
    });
  });

  it('returns no source for placeholders or invalid content IDs', () => {
    expect(buildStartMediaSources('start-a1-001', 'placeholder')).toEqual({});
    expect(buildStartMediaSources('../secret', 'private-session')).toEqual({});
  });
});
