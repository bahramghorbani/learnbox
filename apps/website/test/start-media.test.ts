import { afterEach, describe, expect, it, vi } from 'vitest';

import { get as readPrivateBlob } from '@vercel/blob';

import {
  contentTypeForPathname,
  GET as privateMedia,
} from '../app/api/private-media/[contentId]/[kind]/route';
import { buildStartMediaSources, resolveStartMediaMode } from '../app/start-media';
import { createLearnerSession } from '../lib/server-session';

// LB-DS-074: the pending JPEG Start candidates attest `image/jpeg`
// (start-a1-15-candidate-media-attachment-draft.json), so a delivered media
// response must follow the attested pathname extension instead of a hardcoded
// `image/png`. The fixture stands in for the JPEG attestation batch; the real
// V2 image attestation stays loaded to prove PNG delivery is unchanged.
vi.mock(
  '../../../content/packs/learnbox-start/validation/start-a1-private-media-attestation.json',
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

describe('Private media content type derivation (LB-DS-074)', () => {
  it.each([
    ['learnbox-start/start-a1-fenster/image/v1.jpg', 'image/jpeg'],
    ['learnbox-start/start-a1-fenster/image/v1.jpeg', 'image/jpeg'],
    ['learnbox-start/start-a1-fenster/image/v1.JPG', 'image/jpeg'],
    ['learnbox-start/start-a1-haus/image/v2.png', 'image/png'],
    ['learnbox-start/start-a1-haus/word_audio/v1.mp3', 'audio/mpeg'],
    ['learnbox-start/start-a1-unbekannt/image/v1.webp', null],
    ['learnbox-start/start-a1-unbekannt/image/v1', null],
  ] as const)('maps the attested pathname %s to %s', (pathname, contentType) => {
    expect(contentTypeForPathname(pathname)).toBe(contentType);
  });
});

describe('Private media delivery contract (LB-DS-074)', () => {
  it('delivers an attested .jpg image as image/jpeg', async () => {
    const response = await fetchPrivateMedia('start-a1-fenster', 'image', {
      cookie: sessionCookie(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
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

  it('keeps private, same-origin, no-sniff delivery headers', async () => {
    const response = await fetchPrivateMedia('start-a1-fenster', 'image', {
      cookie: sessionCookie(),
    });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('keeps the release flag and learner session guards', async () => {
    vi.stubEnv('LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED', 'true');
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
