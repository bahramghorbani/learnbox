import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AVALAI_ELEVEN_VOICES,
  DEFAULT_GERMAN_VOICE_MAPPING,
  germanVoiceIssue,
  readAiMediaConfig,
} from '../lib/server/ai-media-config';
import { AvalAiMediaProvider, DEFAULT_AUDIO_MODEL } from '../lib/server/ai-media-provider';

/** Owner decision 2026-10-15 (PDR-010): der=sage, die=nova, das=fable on eleven_multilingual_v2. */
const BASE = { LEARNBOX_ADMIN_MEDIA_AI_ENABLED: 'true', LEARNBOX_AI_API_KEY: 'test-key' };

function voicesOf(environment: Record<string, string | undefined>) {
  const config = readAiMediaConfig(environment);
  if (!('voices' in config)) throw new Error('expected a configured provider');
  return config.voices;
}

describe('owner-chosen German article voices', () => {
  it('ships der=sage, die=nova, das=fable as three distinct ids the gateway accepts', () => {
    const { der, die, das } = DEFAULT_GERMAN_VOICE_MAPPING;
    expect({ der, die, das }).toEqual({ der: 'sage', die: 'nova', das: 'fable' });
    expect(new Set([der, die, das]).size).toBe(3);
    for (const id of [der, die, das]) expect(AVALAI_ELEVEN_VOICES).toContain(id);
    expect(germanVoiceIssue(DEFAULT_GERMAN_VOICE_MAPPING, DEFAULT_AUDIO_MODEL)).toBeUndefined();
  });

  it('resolves the same mapping with no override and with the documented env values', () => {
    const documented = {
      ...BASE,
      LEARNBOX_AI_VOICE_DER: 'sage',
      LEARNBOX_AI_VOICE_DIE: 'nova',
      LEARNBOX_AI_VOICE_DAS: 'fable',
    };
    expect(voicesOf(BASE)).toEqual(DEFAULT_GERMAN_VOICE_MAPPING);
    expect(voicesOf(documented)).toEqual(DEFAULT_GERMAN_VOICE_MAPPING);
  });

  it('keeps a wrong override visible as a named issue rather than replacing it', () => {
    const duplicated = voicesOf({ ...BASE, LEARNBOX_AI_VOICE_DAS: 'nova' });
    expect(duplicated.das).toBe('nova');
    expect(germanVoiceIssue(duplicated, DEFAULT_AUDIO_MODEL)).toBe('das_voice_unconfigured');

    const unknown = voicesOf({ ...BASE, LEARNBOX_AI_VOICE_DER: 'Onyx2' });
    expect(unknown.der).toBe('Onyx2');
    expect(germanVoiceIssue(unknown, DEFAULT_AUDIO_MODEL)).toBe('voice_not_supported');
    expect(germanVoiceIssue(DEFAULT_GERMAN_VOICE_MAPPING, 'tts-1-hd')).toBe(
      'audio_model_not_qualified',
    );
  });
});

describe('the speech request', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the German canonical text to eleven_multilingual_v2 in the chosen voice', async () => {
    // MP3 frame sync header so the provider's format check accepts the fake response.
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...new Array(64).fill(0)]);
    const fetchMock = vi.fn(async () => new Response(mp3, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AvalAiMediaProvider('test-key');
    await provider.synthesizeSpeech({ text: 'das Eichhörnchen', voice: 'fable', timeoutMs: 1_000 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.avalai.ir/v1/audio/speech');
    // The exact request shape used for the owner's listening samples. eleven_multilingual_v2 has
    // no language parameter; German comes from the German text on this multilingual model.
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'eleven_multilingual_v2',
      voice: 'fable',
      input: 'das Eichhörnchen',
      response_format: 'mp3',
    });
  });

  it('sends the same safe shape for the failed and a successful nova word target', async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...new Array(64).fill(0)]);
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(mp3, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new AvalAiMediaProvider('test-key');

    await provider.synthesizeSpeech({ text: 'die U-Bahn', voice: 'nova', timeoutMs: 1_000 });
    await provider.synthesizeSpeech({ text: 'die SIM-Karte', voice: 'nova', timeoutMs: 1_000 });

    expect(
      fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body))),
    ).toEqual([
      {
        model: 'eleven_multilingual_v2',
        voice: 'nova',
        input: 'die U-Bahn',
        response_format: 'mp3',
      },
      {
        model: 'eleven_multilingual_v2',
        voice: 'nova',
        input: 'die SIM-Karte',
        response_format: 'mp3',
      },
    ]);
  });

  it('keeps the deadline armed while reading an audio body', async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...new Array(64).fill(0)]);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      arrayBuffer: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if ((init.signal as AbortSignal).aborted) {
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        }
        return mp3.buffer;
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new AvalAiMediaProvider('test-key');

    await expect(
      provider.synthesizeSpeech({ text: 'die U-Bahn', voice: 'nova', timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: 'provider_timeout' });
  });

  it.each([
    ['upstream_408', () => new Response('', { status: 408 })],
    ['upstream_504', () => new Response('', { status: 504 })],
    ['local_abort', () => Object.assign(new Error('aborted'), { name: 'AbortError' })],
  ])('maps %s to timeout with one application request', async (_name, failure) => {
    const fetchMock = vi.fn(async () => {
      const outcome = failure();
      if (outcome instanceof Error) throw outcome;
      return outcome;
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new AvalAiMediaProvider('test-key');

    await expect(
      provider.synthesizeSpeech({ text: 'die U-Bahn', voice: 'nova', timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ code: 'provider_timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
