import { afterEach, describe, expect, it, vi } from 'vitest';

import { get as readPrivateBlob } from '@vercel/blob';

import { GET as privateMedia } from '../app/api/private-media/[contentId]/[kind]/route';
import { buildStartMediaSources, resolveStartMediaMode } from '../app/start-media';
import { createLearnerSession } from '../lib/server-session';

// Route tests use a compact fixture for the canonical 105-asset attestation.
// The committed artifact is validated separately by the attestation validator.
vi.mock(
  '../../../content/packs/learnbox-start/validation/start-a1-35-final-private-media-attestation.json',
  () => ({
    default: {
      assets: [
        {
          contentId: 'start-a1-fenster',
          kind: 'image',
          pathname: 'learnbox-start/start-a1-fenster/image/v1.jpg',
        },
        {
          contentId: 'start-a1-fenster',
          kind: 'word_audio',
          pathname: 'learnbox-start/start-a1-fenster/word_audio/v1.mp3',
        },
        {
          contentId: 'start-a1-unbekannt',
          kind: 'image',
          pathname: 'learnbox-start/start-a1-unbekannt/image/v1.webp',
        },
        {
          contentId: 'start-a1-jpeg-long',
          kind: 'image',
          pathname: 'learnbox-start/start-a1-jpeg-long/image/v1.jpeg',
        },
        {
          contentId: 'start-a1-uppercase',
          kind: 'image',
          pathname: 'learnbox-start/start-a1-uppercase/image/v1.JPG',
        },
        {
          contentId: 'start-a1-png-legacy',
          kind: 'image',
          pathname: 'learnbox-start/start-a1-png-legacy/image/v1.png',
        },
        {
          contentId: 'start-a1-no-extension',
          kind: 'image',
          pathname: 'learnbox-start/start-a1-no-extension/image/v1',
        },
      ],
    },
  }),
);

vi.mock('@vercel/blob', () => ({ get: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(readPrivateBlob).mockReset();
});

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

const sessionCookie = () => {
  vi.stubEnv('LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED', 'true');
  vi.stubEnv('APP_ENV', 'staging');
  vi.stubEnv('LEARNBOX_SESSION_SECRET', 'start-media-test-session-secret-32-bytes');
  return `learnbox_alpha_session=${createLearnerSession('start-learner-1')}`;
};

async function fetchPrivateMedia(
  contentId: string,
  kind: string,
  headers: Record<string, string> = {},
) {
  vi.mocked(readPrivateBlob).mockResolvedValue({
    stream: new Blob(['media']).stream(),
  } as never);
  return privateMedia(
    new Request(`https://app.learnboxapp.com/api/private-media/${contentId}/${kind}`, { headers }),
    { params: Promise.resolve({ contentId, kind }) },
  );
}

describe('Private media delivery contract (LB-DS-074)', () => {
  it('delivers the final-15 attached image as image/jpeg', async () => {
    const response = await fetchPrivateMedia('start-a1-fenster', 'image', {
      cookie: sessionCookie(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
  });

  it.each(['start-a1-jpeg-long', 'start-a1-uppercase'])(
    'delivers the allowlisted JPEG variant for %s as image/jpeg',
    async (contentId) => {
      const response = await fetchPrivateMedia(contentId, 'image', {
        cookie: sessionCookie(),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
    },
  );

  it('delivers an attested legacy .png image as image/png', async () => {
    const response = await fetchPrivateMedia('start-a1-png-legacy', 'image', {
      cookie: sessionCookie(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  it('keeps delivering attested audio as audio/mpeg', async () => {
    const response = await fetchPrivateMedia('start-a1-fenster', 'word-audio', {
      cookie: sessionCookie(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
  });

  it('fails closed when the attested extension has no allowlisted MIME', async () => {
    const response = await fetchPrivateMedia('start-a1-unbekannt', 'image', {
      cookie: sessionCookie(),
    });

    expect(response.status).toBe(404);
    expect(readPrivateBlob).not.toHaveBeenCalled();
  });

  it('fails closed when the attested pathname has no extension', async () => {
    const response = await fetchPrivateMedia('start-a1-no-extension', 'image', {
      cookie: sessionCookie(),
    });

    expect(response.status).toBe(404);
    expect(readPrivateBlob).not.toHaveBeenCalled();
  });

  it('keeps private, same-origin, no-sniff delivery headers', async () => {
    const response = await fetchPrivateMedia('start-a1-fenster', 'image', {
      cookie: sessionCookie(),
    });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('refuses delivery in Production even when the attachment flag is enabled', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const response = await fetchPrivateMedia('start-a1-fenster', 'image', {
      cookie: sessionCookie(),
    });

    expect(response.status).toBe(404);
    expect(readPrivateBlob).not.toHaveBeenCalled();
  });

  it('keeps the release flag and learner session guards', async () => {
    vi.stubEnv('LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED', 'true');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('LEARNBOX_SESSION_SECRET', 'start-media-test-session-secret-32-bytes');
    const withoutSession = await fetchPrivateMedia('start-a1-fenster', 'image');
    expect(withoutSession.status).toBe(401);
    expect(readPrivateBlob).not.toHaveBeenCalled();

    vi.stubEnv('LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED', 'false');
    const flaggedOff = await fetchPrivateMedia('start-a1-fenster', 'image', {
      cookie: `learnbox_alpha_session=${createLearnerSession('start-learner-1')}`,
    });
    expect(flaggedOff.status).toBe(404);
  });
});
