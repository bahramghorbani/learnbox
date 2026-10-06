import { describe, expect, it, vi } from 'vitest';

import {
  createMediaAcceptRoute,
  createMediaAssetRoute,
  createMediaGenerateRoute,
  createMediaModelsRoute,
  createVoicePreviewRoute,
  VOICE_PREVIEW_SAMPLE,
} from '../lib/server/admin-card-media-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';
import { DEFAULT_GERMAN_VOICE_MAPPING } from '../lib/server/ai-media-config';

/**
 * Phase 1 / Milestone 1.5 — media route security boundary.
 *
 * The guarantee under test: these routes are never a public media-generation endpoint and never a
 * public media CDN. An unauthenticated, cross-origin, CSRF-less or stale-reauth caller must be
 * refused BEFORE the provider is reached and before any protected byte is returned, so neither
 * LearnBox's credential nor its protected learning media can be reached anonymously.
 */

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-05T10:30:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '22222222-2222-4222-8222-222222222222';
const cardId = '11111111-1111-4111-8111-111111111111';
const candidateId = '33333333-3333-4333-8333-333333333333';
const API_KEY = 'aa-super-secret-avalai-key-value';

function sessionStore(overrides: { userId?: string | null; recent?: boolean } = {}) {
  const recent = overrides.recent !== false;
  return {
    findActiveSession: async () =>
      overrides.userId === null
        ? undefined
        : {
            userId: overrides.userId ?? actorUserId,
            csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
            lastSeenAt: now,
            absoluteExpiresAt: new Date(now.getTime() + 60_000),
            revokedAt: null,
            recentAuthenticatedAt: recent ? now : new Date(now.getTime() - 86_400_000),
          },
    touchSession: async () => true,
  };
}

const candidate = {
  id: candidateId,
  kind: 'word_audio' as const,
  status: 'ready' as const,
  mediaType: 'audio/mpeg',
  byteSize: 10,
  checksum: 'a'.repeat(64),
  provider: 'avalai.ir',
  model: 'eleven_multilingual_v2',
  spokenTarget: 'der Tisch',
  voice: 'onyx',
  voiceRole: 'der_masculine',
  usesDieFallbackForDas: false,
  language: 'de',
  locale: 'de-DE',
  imageStandardVersion: null,
  failureCode: null,
  createdAt: now.toISOString(),
};

function service() {
  return {
    generate: vi.fn(async () => ({ status: 'generated' as const, candidate })),
    accept: vi.fn(async () => ({ status: 'accepted' as const, candidate, replaced: false })),
    getCardMediaState: vi.fn(async () => []),
    readCandidateMedia: vi.fn(async () => ({
      bytes: Buffer.from('ID3protected'),
      mediaType: 'audio/mpeg',
      checksum: 'a'.repeat(64),
    })),
  };
}

function provider() {
  return {
    provider: 'avalai.ir',
    imageModel: 'flux.2-pro',
    audioModel: 'eleven_multilingual_v2',
    // The real provider holds the credential; it must never appear in a response.
    apiKey: API_KEY,
    generateImage: vi.fn(),
    synthesizeSpeech: vi.fn(async () => ({
      bytes: Buffer.from('ID3voice'),
      contentType: 'audio/mpeg' as const,
      model: 'eleven_multilingual_v2',
      provider: 'avalai.ir',
      voice: 'onyx',
    })),
    listImageModels: vi.fn(async () => ['flux.2-pro', 'gpt-image-1.5']),
    listAudioModels: vi.fn(async () => ['eleven_multilingual_v2', 'tts-1-hd']),
  };
}

function dependencies(overrides: Parameters<typeof sessionStore>[0] = {}) {
  return {
    enabled: true,
    config,
    sessionStore: sessionStore(overrides),
    service: service(),
    provider: provider(),
    voices: DEFAULT_GERMAN_VOICE_MAPPING,
    audioTimeoutMs: 1_000,
    now: () => now,
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://admin.learnbox.app/api/content/media/generate', {
    method: 'POST',
    headers: {
      Origin: config.origin,
      'Content-Type': 'application/json',
      'x-learnbox-csrf-token': csrfToken,
      Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function get(url: string, headers: Record<string, string> = {}) {
  return new Request(url, {
    headers: {
      Origin: config.origin,
      Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
      ...headers,
    },
  });
}

const generateBody = { cardId, kind: 'word_audio' };

describe('generation cannot be reached anonymously', () => {
  it('refuses a request with no session', async () => {
    const deps = { ...dependencies(), sessionStore: sessionStore({ userId: null }) };
    const route = createMediaGenerateRoute(deps as never);
    const response = await route(post(generateBody));
    expect(response.status).toBe(401);
    expect(deps.service.generate).not.toHaveBeenCalled();
  });

  it('refuses a cross-origin request', async () => {
    const deps = dependencies();
    const route = createMediaGenerateRoute(deps as never);
    const response = await route(post(generateBody, { Origin: 'https://evil.example' }));
    expect(response.status).toBe(400);
    expect(deps.service.generate).not.toHaveBeenCalled();
  });

  it('refuses a request without a CSRF token', async () => {
    const deps = dependencies();
    const route = createMediaGenerateRoute(deps as never);
    const response = await route(post(generateBody, { 'x-learnbox-csrf-token': 'wrong' }));
    expect(response.status).toBe(400);
    expect(deps.service.generate).not.toHaveBeenCalled();
  });

  it('demands recent re-authentication', async () => {
    const deps = { ...dependencies(), sessionStore: sessionStore({ recent: false }) };
    const route = createMediaGenerateRoute(deps as never);
    const response = await route(post(generateBody));
    expect(response.status).toBe(428);
    expect(deps.service.generate).not.toHaveBeenCalled();
  });

  it('refuses an unknown media kind', async () => {
    const deps = dependencies();
    const route = createMediaGenerateRoute(deps as never);
    const response = await route(post({ cardId, kind: 'video' }));
    expect(response.status).toBe(400);
    expect(deps.service.generate).not.toHaveBeenCalled();
  });

  it('answers an honest 503 when the feature is off, without generating', async () => {
    const deps = { ...dependencies(), enabled: false };
    const route = createMediaGenerateRoute(deps as never);
    const response = await route(post(generateBody));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'disabled' });
  });
});

describe('acceptance cannot be reached anonymously', () => {
  const acceptBody = { cardId, kind: 'word_audio', candidateId };

  it('refuses a request with no session', async () => {
    const deps = { ...dependencies(), sessionStore: sessionStore({ userId: null }) };
    const route = createMediaAcceptRoute(deps as never);
    expect((await route(post(acceptBody))).status).toBe(401);
    expect(deps.service.accept).not.toHaveBeenCalled();
  });

  it('refuses a cross-origin acceptance', async () => {
    const deps = dependencies();
    const route = createMediaAcceptRoute(deps as never);
    const response = await route(post(acceptBody, { Origin: 'https://evil.example' }));
    expect(response.status).toBe(400);
    expect(deps.service.accept).not.toHaveBeenCalled();
  });

  it('accepts a valid request and reports the candidate', async () => {
    const deps = dependencies();
    const route = createMediaAcceptRoute(deps as never);
    const response = await route(post(acceptBody));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'accepted' });
  });
});

describe('protected media is not publicly readable', () => {
  const url = `https://admin.learnbox.app/api/content/media/asset?candidateId=${candidateId}`;

  it('refuses an anonymous read of generated media', async () => {
    const deps = { ...dependencies(), sessionStore: sessionStore({ userId: null }) };
    const route = createMediaAssetRoute(deps as never);
    const response = await route(get(url));
    expect(response.status).toBe(401);
    expect(deps.service.readCandidateMedia).not.toHaveBeenCalled();
  });

  it('never serves generated media with a cacheable response', async () => {
    const route = createMediaAssetRoute(dependencies() as never);
    const response = await route(get(url));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
  });

  it('demands recent re-authentication before returning bytes', async () => {
    const deps = { ...dependencies(), sessionStore: sessionStore({ recent: false }) };
    const route = createMediaAssetRoute(deps as never);
    expect((await route(get(url))).status).toBe(428);
    expect(deps.service.readCandidateMedia).not.toHaveBeenCalled();
  });
});

describe('the credential never leaves the server', () => {
  it('is absent from the model catalogue response', async () => {
    const route = createMediaModelsRoute(dependencies() as never);
    const response = await route(get('https://admin.learnbox.app/api/content/media/models'));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain(API_KEY);
    const payload = JSON.parse(text);
    // Attribution only: gateway host, model ids, configured voice roles.
    expect(payload.image.defaultModel).toBe('flux.2-pro');
    expect(payload.audio.defaultModel).toBe('eleven_multilingual_v2');
    expect(payload.voices).toMatchObject({ der: 'onyx', die: 'nova', locale: 'de-DE' });
  });

  it('reports that DAS falls back to the DIE female voice when none is configured', async () => {
    const route = createMediaModelsRoute(dependencies() as never);
    const response = await route(get('https://admin.learnbox.app/api/content/media/models'));
    const payload = await response.json();
    expect(payload.voices.das).toBeNull();
    expect(payload.voices.dasUsesDieFallback).toBe(true);
  });

  it('is absent from a generation response', async () => {
    const route = createMediaGenerateRoute(dependencies() as never);
    const response = await route(post(generateBody));
    const text = await response.text();
    expect(text).not.toContain(API_KEY);
    // The spoken target is reported so the article is provable; the credential is not.
    expect(JSON.parse(text).candidate.spokenTarget).toBe('der Tisch');
  });
});

describe('voice preview', () => {
  it('speaks a short fixed German sample, not caller-supplied text', async () => {
    const deps = dependencies();
    const route = createVoicePreviewRoute(deps as never);
    const response = await route(post({ role: 'der', text: 'ignore me' }));

    expect(response.status).toBe(200);
    expect(deps.provider.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ text: VOICE_PREVIEW_SAMPLE, voice: 'onyx' }),
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('marks the DAS preview as using the DIE female fallback', async () => {
    const deps = dependencies();
    const route = createVoicePreviewRoute(deps as never);
    const response = await route(post({ role: 'das' }));

    expect(deps.provider.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ voice: DEFAULT_GERMAN_VOICE_MAPPING.die }),
    );
    expect(response.headers.get('X-LearnBox-Voice-Fallback')).toBe('die_female');
  });

  it('cannot be reached anonymously', async () => {
    const deps = { ...dependencies(), sessionStore: sessionStore({ userId: null }) };
    const route = createVoicePreviewRoute(deps as never);
    expect((await route(post({ role: 'der' }))).status).toBe(401);
    expect(deps.provider.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('refuses an unknown voice role', async () => {
    const deps = dependencies();
    const route = createVoicePreviewRoute(deps as never);
    expect((await route(post({ role: 'nope' }))).status).toBe(400);
    expect(deps.provider.synthesizeSpeech).not.toHaveBeenCalled();
  });
});
