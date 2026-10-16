import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_AI_MEDIA_LIMITS,
  DEFAULT_GERMAN_VOICE_MAPPING,
} from '../lib/server/ai-media-config';
import { AiProviderError } from '../lib/server/ai-generation-provider';
import { CardMediaGenerationService } from '../lib/server/card-media-generation-service';
import type { CardMediaStorage } from '../lib/server/card-media-storage';
import type { GermanVoiceMapping } from '@learnbox/content-models';

/**
 * These tests protect the invariants M1.5 exists to guarantee:
 *
 *   * a noun's word audio is always spoken as article + lemma, decided by the application;
 *   * the voice is derived deterministically from the canonical article, and DAS generation is
 *     refused until a distinct qualified voice is configured;
 *   * generation NEVER changes which asset a card points at, so a failed, rejected or retried
 *     regeneration cannot destroy media that is already accepted;
 *   * acceptance is idempotent, so a replay cannot create a second canonical association.
 */

const CARD_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const IMAGE_STANDARD = { version: 'v2', model: 'flux.2-pro', style: 'LEARNBOX_STYLE.' };

type Row = Record<string, unknown>;

interface CardFixture {
  lemma: string;
  article?: string | null;
  germanExample?: string;
  imagePrompt?: string;
  visualConcept?: string;
  persianMeaning?: string;
}

/**
 * An in-memory stand-in for the Postgres pool that models the real constraints this service
 * depends on: the single-flight index, the accepted-asset primary key, and FOR UPDATE reads.
 */
function createPool(card: CardFixture | undefined, options: { editorial?: boolean } = {}) {
  const candidates = new Map<string, Row>();
  const assets = new Map<string, Row>();
  let sequence = 0;

  const columns = [
    'id',
    'card_id',
    'kind',
    'status',
    'media_type',
    'byte_size',
    'checksum',
    'provider',
    'model',
    'spoken_target',
    'voice',
    'voice_role',
    'uses_die_fallback_for_das',
    'language',
    'locale',
    'image_standard_version',
    'image_subject',
    'audio_sample_rate_hz',
    'audio_bitrate_kbps',
    'audio_channels',
    'failure_code',
    'created_at',
  ];
  const project = (row: Row): Row => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));

  const query = vi.fn(
    async (sql: string, parameters: readonly unknown[] = []): Promise<{ rows: Row[] }> => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [] };

      if (/FROM admin_role_assignments/.test(sql)) {
        return { rows: options.editorial === false ? [] : [{ role: 'content_reviewer' }] };
      }

      if (/FROM cards c/.test(sql)) {
        if (!card) return { rows: [] };
        return {
          rows: [
            {
              id: CARD_ID,
              content_id: 'start-a1-fixture',
              lemma: card.lemma,
              content_json: {
                lemma: card.lemma,
                article: card.article ?? null,
                examples: card.germanExample
                  ? [{ german: card.germanExample, persian: 'ترجمهٔ فارسی' }]
                  : [],
                ...(card.imagePrompt ? { imagePrompt: card.imagePrompt } : {}),
                ...(card.visualConcept ? { visualConcept: card.visualConcept } : {}),
                ...(card.persianMeaning ? { persianMeanings: [card.persianMeaning] } : {}),
              },
            },
          ],
        };
      }

      if (/INSERT INTO card_media_candidates/.test(sql)) {
        const [
          cardId,
          kind,
          provider,
          model,
          capability,
          spoken,
          voice,
          role,
          fallback,
          language,
          locale,
          standard,
          imageSubject,
        ] = parameters as unknown[];
        // Single-flight unique index: one 'generating' row per (card_id, kind).
        const clash = [...candidates.values()].some(
          (row) => row.card_id === cardId && row.kind === kind && row.status === 'generating',
        );
        if (clash) return { rows: [] };
        sequence += 1;
        const id = `33333333-3333-4333-8333-${String(sequence).padStart(12, '0')}`;
        candidates.set(id, {
          id,
          card_id: cardId,
          kind,
          status: 'generating',
          provider,
          model,
          capability,
          spoken_target: spoken,
          voice,
          voice_role: role,
          uses_die_fallback_for_das: fallback,
          language,
          locale,
          image_standard_version: standard,
          image_subject: imageSubject,
          created_at: new Date(),
          media_type: null,
          byte_size: null,
          checksum: null,
          failure_code: null,
          object_key: null,
        });
        return { rows: [{ id }] };
      }

      if (/UPDATE card_media_candidates/.test(sql)) {
        const id = String(parameters[0]);
        const row = candidates.get(id);
        if (!row) return { rows: [] };
        if (/status = 'ready'/.test(sql)) {
          Object.assign(row, {
            status: 'ready',
            object_key: parameters[1],
            checksum: parameters[2],
            byte_size: parameters[3],
            media_type: parameters[4],
            audio_sample_rate_hz: parameters[6],
            audio_bitrate_kbps: parameters[7],
            audio_channels: parameters[8],
          });
        } else if (/status = 'failed'/.test(sql)) {
          Object.assign(row, { status: 'failed', failure_code: parameters[1] });
        } else if (/status = 'superseded'/.test(sql)) {
          Object.assign(row, { status: 'superseded', superseded_by_candidate_id: parameters[1] });
        } else if (/status = 'accepted'/.test(sql)) {
          Object.assign(row, { status: 'accepted' });
        }
        return { rows: [project(row)] };
      }

      if (/AS is_accepted/.test(sql)) {
        // Existing ready or accepted media for (card_id, kind), newest first.
        return {
          rows: [...candidates.values()]
            .filter(
              (row) =>
                row.card_id === parameters[0] &&
                row.kind === parameters[1] &&
                (row.status === 'ready' || row.status === 'accepted'),
            )
            .reverse()
            .map((row) => ({ ...project(row), is_accepted: row.status === 'accepted' })),
        };
      }

      if (/FROM card_media_candidates/.test(sql) && /WHERE id = \$1 AND card_id/.test(sql)) {
        const row = candidates.get(String(parameters[0]));
        return { rows: row && row.kind === parameters[2] ? [project(row)] : [] };
      }

      if (/SELECT object_key, media_type, checksum FROM card_media_candidates/.test(sql)) {
        const row = candidates.get(String(parameters[0]));
        return { rows: row?.object_key ? [row] : [] };
      }

      if (/SELECT candidate_id FROM card_media_assets/.test(sql)) {
        const row = assets.get(`${parameters[0]}:${parameters[1]}`);
        return { rows: row ? [row] : [] };
      }

      if (/INSERT INTO card_media_assets/.test(sql)) {
        const [cardId, kind, candidateId, actor] = parameters as string[];
        // Primary key (card_id, kind): an upsert, never a second association.
        assets.set(`${cardId}:${kind}`, {
          card_id: cardId,
          kind,
          candidate_id: candidateId,
          accepted_by_user_id: actor,
          accepted_at: new Date(),
        });
        return { rows: [] };
      }

      if (/FROM card_media_assets a/.test(sql)) {
        return {
          rows: [...assets.values()]
            .filter((row) => row.card_id === parameters[0])
            .map((row) => ({
              ...project(candidates.get(String(row.candidate_id))!),
              kind: row.kind,
              accepted_at: row.accepted_at,
            })),
        };
      }

      if (/DISTINCT ON \(kind\)/.test(sql)) {
        const latest = new Map<string, Row>();
        for (const row of candidates.values()) {
          if (row.card_id !== parameters[0]) continue;
          latest.set(String(row.kind), row);
        }
        return { rows: [...latest.values()].map(project) };
      }

      throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
    },
  );

  return {
    query,
    connect: async () => ({ query, release: () => undefined }),
    candidates,
    assets,
  };
}

function createStorage(): CardMediaStorage & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  let n = 0;
  return {
    objects,
    store: vi.fn(async (contentId, kind, mediaType, bytes) => {
      n += 1;
      const objectKey = `admin/card-media/${contentId}/${kind}/object-${n}`;
      objects.set(objectKey, bytes);
      return { objectKey, checksum: 'a'.repeat(64), byteSize: bytes.length };
    }),
    read: vi.fn(async (objectKey) => objects.get(objectKey) ?? Buffer.alloc(0)),
    remove: vi.fn(async (objectKey) => void objects.delete(objectKey)),
  };
}

function createProvider(overrides: Partial<Record<'image' | 'speech', unknown>> = {}) {
  const calls: { text?: string; voice?: string; prompt?: string }[] = [];
  return {
    calls,
    provider: 'avalai.ir',
    imageModel: 'flux.2-pro',
    audioModel: 'eleven_multilingual_v2',
    generateImage: vi.fn(async (request: { prompt: string }) => {
      calls.push({ prompt: request.prompt });
      if (overrides.image instanceof Error) throw overrides.image;
      return {
        bytes: Buffer.from('89504e470d0a1a0a', 'hex'),
        contentType: 'image/png' as const,
        model: 'flux.2-pro',
        provider: 'avalai.ir',
        estimatedCostUnit: 0.03,
      };
    }),
    synthesizeSpeech: vi.fn(async (request: { text: string; voice: string }) => {
      calls.push({ text: request.text, voice: request.voice });
      if (overrides.speech instanceof Error) throw overrides.speech;
      return {
        bytes: Buffer.from('ID3payload'),
        contentType: 'audio/mpeg' as const,
        model: 'eleven_multilingual_v2',
        provider: 'avalai.ir',
        voice: request.voice,
      };
    }),
    listImageModels: vi.fn(async () => ['flux.2-pro']),
    listAudioModels: vi.fn(async () => ['eleven_multilingual_v2']),
  };
}

function createService(
  card: CardFixture | undefined,
  options: {
    voices?: GermanVoiceMapping;
    editorial?: boolean;
    providerOverrides?: Partial<Record<'image' | 'speech', unknown>>;
  } = {},
) {
  const pool = createPool(card, { editorial: options.editorial });
  const provider = createProvider(options.providerOverrides);
  const storage = createStorage();
  const service = new CardMediaGenerationService(
    pool as never,
    provider as never,
    storage,
    options.voices ?? DEFAULT_GERMAN_VOICE_MAPPING,
    DEFAULT_AI_MEDIA_LIMITS,
    IMAGE_STANDARD,
  );
  return { service, pool, provider, storage };
}

describe('word audio speaks the canonical article', () => {
  it.each([
    ['der', 'Tisch', 'der Tisch', 'sage', 'der_masculine'],
    ['die', 'Lampe', 'die Lampe', 'nova', 'die_feminine'],
    ['das', 'Buch', 'das Buch', 'fable', 'das_neuter'],
  ])('%s %s is spoken as "%s"', async (article, lemma, expected, expectedVoice, expectedRole) => {
    const { service, provider } = createService({ lemma, article });
    const result = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });

    expect(result.status).toBe('generated');
    // The application decided the spoken text; the provider merely received it.
    expect(provider.synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(provider.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ text: expected, voice: expectedVoice }),
    );
    if (result.status !== 'generated') throw new Error('expected generation');
    expect(result.candidate.voice).toBe(expectedVoice);
    expect(result.candidate.usesDieFallbackForDas).toBe(false);
    expect(result.candidate.spokenTarget).toBe(expected);
    expect(result.candidate.voiceRole).toBe(expectedRole);
    expect(result.candidate.language).toBe('de');
    expect(result.candidate.locale).toBe('de-DE');
  });

  it('does not invent an article for no-article vocabulary', async () => {
    const { service, provider } = createService({ lemma: 'gehen' });
    const result = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });

    if (result.status !== 'generated') throw new Error('expected generation');
    expect(result.candidate.spokenTarget).toBe('gehen');
    expect(result.candidate.voiceRole).toBe('default_no_article');
    expect(provider.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'gehen', voice: DEFAULT_GERMAN_VOICE_MAPPING.default }),
    );
  });

  // A wrong roster refuses every article, not just the broken one, and never borrows a voice.
  it.each([
    ['das unset', { das: undefined }, 'das_voice_unconfigured'],
    ['das = die', { das: 'nova' }, 'das_voice_unconfigured'],
    ['der = die', { der: 'nova' }, 'article_voices_not_distinct'],
    ['der = das', { der: 'fable' }, 'article_voices_not_distinct'],
    ['unknown voice id', { das: 'german-teen' }, 'voice_not_supported'],
    ['misspelled voice id', { der: 'Sage ' }, 'voice_not_supported'],
  ])('refuses all audio when %s', async (_label, override, code) => {
    for (const article of ['der', 'die', 'das']) {
      const { service, provider } = createService(
        { lemma: 'Buch', article },
        { voices: { ...DEFAULT_GERMAN_VOICE_MAPPING, ...override } as GermanVoiceMapping },
      );
      const result = await service.generate({
        cardId: CARD_ID,
        kind: 'word_audio',
        actorUserId: ACTOR,
      });
      expect(result).toMatchObject({ status: 'unprocessable', code });
      expect(provider.synthesizeSpeech).not.toHaveBeenCalled();
    }
  });

  it('refuses the article voices on an audio model they were not chosen on', async () => {
    const { service, provider } = createService({ lemma: 'Tisch', article: 'der' });
    const result = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      model: 'gpt-4o-mini-tts',
      actorUserId: ACTOR,
    });
    expect(result).toMatchObject({ status: 'unprocessable', code: 'audio_model_not_qualified' });
    expect(provider.synthesizeSpeech).not.toHaveBeenCalled();
  });
});

describe('sentence audio', () => {
  it('speaks the canonical German sentence, never the Persian translation', async () => {
    const { service, provider } = createService({
      lemma: 'Tisch',
      article: 'der',
      germanExample: 'Der Tisch ist aus Holz.',
    });
    const result = await service.generate({
      cardId: CARD_ID,
      kind: 'sentence_audio',
      actorUserId: ACTOR,
    });

    if (result.status !== 'generated') throw new Error('expected generation');
    expect(result.candidate.spokenTarget).toBe('Der Tisch ist aus Holz.');
    expect(provider.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Der Tisch ist aus Holz.', voice: 'sage' }),
    );
  });

  it('keeps the same effective voice identity as the card word audio', async () => {
    const card = { lemma: 'Lampe', article: 'die', germanExample: 'Die Lampe ist hell.' };
    const { service } = createService(card);
    const word = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });
    const sentence = await service.generate({
      cardId: CARD_ID,
      kind: 'sentence_audio',
      actorUserId: ACTOR,
    });

    if (word.status !== 'generated' || sentence.status !== 'generated') {
      throw new Error('expected both generations');
    }
    expect(sentence.candidate.voice).toBe(word.candidate.voice);
    expect(sentence.candidate.voiceRole).toBe(word.candidate.voiceRole);
  });

  it('refuses a card with no canonical German example instead of generating silence', async () => {
    const { service, provider } = createService({ lemma: 'Tisch', article: 'der' });
    const result = await service.generate({
      cardId: CARD_ID,
      kind: 'sentence_audio',
      actorUserId: ACTOR,
    });
    expect(result.status).toBe('unprocessable');
    expect(provider.synthesizeSpeech).not.toHaveBeenCalled();
  });
});

describe('image generation reuses the canonical standard', () => {
  it('sends the canonical LearnBox style with the card subject', async () => {
    const { service, provider } = createService({ lemma: 'Tisch', article: 'der' });
    const result = await service.generate({ cardId: CARD_ID, kind: 'image', actorUserId: ACTOR });

    if (result.status !== 'generated') throw new Error('expected generation');
    const prompt = provider.generateImage.mock.calls[0]![0].prompt;
    expect(prompt).toContain('der Tisch');
    expect(prompt).toContain(IMAGE_STANDARD.style);
    expect(prompt).toContain('Iranian learners');
    expect(prompt).toMatch(/no text, letters, numbers.*brand logos/i);
    expect(result.candidate.imageStandardVersion).toBe('v2');
  });
});

describe('generation never disturbs accepted media', () => {
  it('does not create or change an accepted asset', async () => {
    const { service, pool } = createService({ lemma: 'Tisch', article: 'der' });
    await service.generate({ cardId: CARD_ID, kind: 'word_audio', actorUserId: ACTOR });
    expect(pool.assets.size).toBe(0);
  });

  it('leaves previously accepted media intact when a regeneration fails', async () => {
    const { service, pool, provider } = createService({ lemma: 'Tisch', article: 'der' });
    const first = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });
    if (first.status !== 'generated') throw new Error('expected generation');
    await service.accept({
      cardId: CARD_ID,
      kind: 'word_audio',
      candidateId: first.candidate.id,
      actorUserId: ACTOR,
    });
    const acceptedBefore = pool.assets.get(`${CARD_ID}:word_audio`)!.candidate_id;

    // A later regeneration of the SAME card fails at the provider.
    provider.synthesizeSpeech.mockRejectedValueOnce(
      new AiProviderError('provider_timeout', 'timeout'),
    );
    const failed = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
      regenerate: true,
    });
    expect(failed.status).toBe('provider_failed');

    // The card still points at the originally accepted candidate.
    expect(pool.assets.get(`${CARD_ID}:word_audio`)!.candidate_id).toBe(acceptedBefore);
    expect(pool.assets.size).toBe(1);
  });

  it('marks the candidate failed and keeps accepted media when the provider errors', async () => {
    const { service, pool } = createService(
      { lemma: 'Tisch', article: 'der' },
      { providerOverrides: { speech: new AiProviderError('provider_timeout', 'timeout') } },
    );
    const result = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });

    expect(result).toMatchObject({ status: 'provider_failed', code: 'provider_timeout' });
    expect([...pool.candidates.values()][0]!.status).toBe('failed');
    expect(pool.assets.size).toBe(0);
  });
});

describe('acceptance is explicit and idempotent', () => {
  it('accepts a ready candidate and points the card at it', async () => {
    const { service, pool } = createService({ lemma: 'Tisch', article: 'der' });
    const generated = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });
    if (generated.status !== 'generated') throw new Error('expected generation');

    const accepted = await service.accept({
      cardId: CARD_ID,
      kind: 'word_audio',
      candidateId: generated.candidate.id,
      actorUserId: ACTOR,
    });
    expect(accepted).toMatchObject({ status: 'accepted', replaced: false });
    expect(pool.assets.size).toBe(1);
  });

  it('replaying an acceptance does not create a second association', async () => {
    const { service, pool } = createService({ lemma: 'Tisch', article: 'der' });
    const generated = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });
    if (generated.status !== 'generated') throw new Error('expected generation');
    const input = {
      cardId: CARD_ID,
      kind: 'word_audio' as const,
      candidateId: generated.candidate.id,
      actorUserId: ACTOR,
    };

    await service.accept(input);
    const replay = await service.accept(input);
    const replayAgain = await service.accept(input);

    expect(replay.status).toBe('already_accepted');
    expect(replayAgain.status).toBe('already_accepted');
    expect(pool.assets.size).toBe(1);
  });

  it('supersedes the previous candidate without destroying it', async () => {
    const { service, pool } = createService({ lemma: 'Tisch', article: 'der' });
    const first = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });
    if (first.status !== 'generated') throw new Error('expected generation');
    await service.accept({
      cardId: CARD_ID,
      kind: 'word_audio',
      candidateId: first.candidate.id,
      actorUserId: ACTOR,
    });

    const second = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
      regenerate: true,
    });
    if (second.status !== 'generated') throw new Error('expected generation');
    // Until the new candidate is accepted, the card still points at the first.
    expect(pool.assets.get(`${CARD_ID}:word_audio`)!.candidate_id).toBe(first.candidate.id);

    const replaced = await service.accept({
      cardId: CARD_ID,
      kind: 'word_audio',
      candidateId: second.candidate.id,
      actorUserId: ACTOR,
    });
    expect(replaced).toMatchObject({ status: 'accepted', replaced: true });
    expect(pool.assets.size).toBe(1);
    // The superseded candidate keeps its row, so acceptance history stays auditable.
    expect(pool.candidates.get(first.candidate.id)!.status).toBe('superseded');
    expect(pool.candidates.get(first.candidate.id)!.superseded_by_candidate_id).toBe(
      second.candidate.id,
    );
  });

  it('refuses to accept a candidate that is not ready', async () => {
    const { service } = createService(
      { lemma: 'Tisch', article: 'der' },
      { providerOverrides: { speech: new AiProviderError('provider_timeout', 'timeout') } },
    );
    await service.generate({ cardId: CARD_ID, kind: 'word_audio', actorUserId: ACTOR });
    const result = await service.accept({
      cardId: CARD_ID,
      kind: 'word_audio',
      candidateId: '33333333-3333-4333-8333-000000000001',
      actorUserId: ACTOR,
    });
    expect(result.status).toBe('candidate_not_ready');
  });
});

describe('guards', () => {
  it('refuses generation without an editorial role', async () => {
    const { service, provider } = createService(
      { lemma: 'Tisch', article: 'der' },
      { editorial: false },
    );
    const result = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });
    expect(result.status).toBe('forbidden');
    expect(provider.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('refuses a card that does not exist', async () => {
    const { service } = createService(undefined);
    const result = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });
    expect(result.status).toBe('card_not_found');
  });

  it('refuses a second concurrent generation for the same card and kind', async () => {
    const { service } = createService(
      { lemma: 'Tisch', article: 'der' },
      { providerOverrides: { speech: new Promise(() => undefined) } },
    );
    // Leave the first attempt in-flight by never resolving the provider call.
    const inFlight = service.generate({ cardId: CARD_ID, kind: 'word_audio', actorUserId: ACTOR });
    const second = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });
    expect(second.status).toBe('already_generating');
    void inFlight;
  });

  it('reports per-kind state for the workspace', async () => {
    const { service } = createService({ lemma: 'Tisch', article: 'der' });
    const generated = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
    });
    if (generated.status !== 'generated') throw new Error('expected generation');

    const state = await service.getCardMediaState(CARD_ID);
    expect(state.map((entry) => entry.kind)).toEqual(['image', 'word_audio', 'sentence_audio']);
    const wordAudio = state.find((entry) => entry.kind === 'word_audio')!;
    expect(wordAudio.accepted).toBeNull();
    expect(wordAudio.latestCandidate?.spokenTarget).toBe('der Tisch');
  });
});


/** A minimal MPEG-1 Layer III frame header: 44.1 kHz, 128 kbps, mono. */
function mp3Bytes() {
  const frame = Buffer.alloc(64);
  frame.set([0xff, 0xfb, 0x90, 0xc4]);
  return frame;
}

describe('media is generated only when actually needed (owner rule 2026-10-16)', () => {
  const card = () => ({
    lemma: 'Tisch',
    article: 'der',
    germanExample: 'Der Tisch ist groß.',
    imagePrompt: 'A wooden table, centered.',
    persianMeaning: 'میز',
  });

  async function generateAndAccept(
    service: CardMediaGenerationService,
    kind: 'image' | 'word_audio' | 'sentence_audio',
  ) {
    const generated = await service.generate({ cardId: CARD_ID, kind, actorUserId: ACTOR });
    if (generated.status !== 'generated') throw new Error(`expected generation, got ${generated.status}`);
    await service.accept({ cardId: CARD_ID, kind, candidateId: generated.candidate.id, actorUserId: ACTOR });
    return generated.candidate;
  }

  it('makes no paid call when valid media is already accepted', async () => {
    const { service, provider } = createService(card());
    await generateAndAccept(service, 'word_audio');
    const again = await service.generate({ cardId: CARD_ID, kind: 'word_audio', actorUserId: ACTOR });
    expect(again).toMatchObject({ status: 'not_needed', reason: 'accepted_valid' });
    expect(provider.synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it('makes no paid call when a valid candidate is waiting for acceptance', async () => {
    const { service, provider } = createService(card());
    const first = await service.generate({ cardId: CARD_ID, kind: 'image', actorUserId: ACTOR });
    expect(first.status).toBe('generated');
    const again = await service.generate({ cardId: CARD_ID, kind: 'image', actorUserId: ACTOR });
    expect(again).toMatchObject({ status: 'not_needed', reason: 'ready_valid' });
    expect(provider.generateImage).toHaveBeenCalledTimes(1);
  });

  it('regenerates over valid media only on an explicit request', async () => {
    const { service, provider } = createService(card());
    await generateAndAccept(service, 'word_audio');
    const forced = await service.generate({
      cardId: CARD_ID,
      kind: 'word_audio',
      actorUserId: ACTOR,
      regenerate: true,
    });
    expect(forced.status).toBe('generated');
    expect(provider.synthesizeSpeech).toHaveBeenCalledTimes(2);
  });

  it('an edited example invalidates only the sentence audio', async () => {
    const fixture = card();
    const { service } = createService(fixture);
    await generateAndAccept(service, 'image');
    await generateAndAccept(service, 'word_audio');
    await generateAndAccept(service, 'sentence_audio');

    fixture.germanExample = 'Der Tisch ist klein.';
    const state = await service.getCardMediaState(CARD_ID);
    const byKind = Object.fromEntries(state.map((entry) => [entry.kind, entry]));
    expect(byKind.image!.acceptedValidity).toBe('valid');
    expect(byKind.word_audio!.acceptedValidity).toBe('valid');
    expect(byKind.sentence_audio!.acceptedValidity).toBe('stale');
    expect(state.filter((entry) => entry.needsGeneration).map((entry) => entry.kind)).toEqual([
      'sentence_audio',
    ]);
  });

  it('an unrelated edit (the Persian meaning) leaves every medium valid', async () => {
    const fixture = card();
    const { service } = createService(fixture);
    await generateAndAccept(service, 'image');
    await generateAndAccept(service, 'word_audio');
    await generateAndAccept(service, 'sentence_audio');

    fixture.persianMeaning = 'میز ناهارخوری';
    const state = await service.getCardMediaState(CARD_ID);
    expect(state.every((entry) => entry.acceptedValidity === 'valid')).toBe(true);
    expect(state.some((entry) => entry.needsGeneration)).toBe(false);
  });

  it('a changed article invalidates both audios and keeps an explicit image prompt valid', async () => {
    const fixture = { ...card(), lemma: 'Band', article: 'die', germanExample: 'Die Band spielt.' };
    const { service } = createService(fixture);
    await generateAndAccept(service, 'image');
    await generateAndAccept(service, 'word_audio');
    await generateAndAccept(service, 'sentence_audio');

    fixture.article = 'das';
    const state = Object.fromEntries(
      (await service.getCardMediaState(CARD_ID)).map((entry) => [entry.kind, entry.acceptedValidity]),
    );
    expect(state).toEqual({ image: 'valid', word_audio: 'stale', sentence_audio: 'stale' });
  });

  it('an edited image prompt invalidates only the image', async () => {
    const fixture = card();
    const { service } = createService(fixture);
    await generateAndAccept(service, 'image');
    await generateAndAccept(service, 'word_audio');
    fixture.imagePrompt = 'A round kitchen table, centered.';
    const state = Object.fromEntries(
      (await service.getCardMediaState(CARD_ID)).map((entry) => [entry.kind, entry.acceptedValidity]),
    );
    expect(state.image).toBe('stale');
    expect(state.word_audio).toBe('valid');
  });

  it('records the exact image subject and prompts from the English image prompt without Bobo', async () => {
    const { service, provider } = createService({
      ...card(),
      visualConcept: 'یک میز چوبی',
    });
    const generated = await service.generate({ cardId: CARD_ID, kind: 'image', actorUserId: ACTOR });
    if (generated.status !== 'generated') throw new Error('expected generation');
    expect(generated.candidate.imageSubject).toBe('A wooden table, centered.');
    const prompt = provider.calls.find((call) => call.prompt)!.prompt!;
    expect(prompt).toContain('A wooden table, centered.');
    expect(prompt).not.toContain('یک میز چوبی');
    expect(prompt).toMatch(/no Bobo or any mascot/);
  });

  it('records the measured MP3 format, not the requested one', async () => {
    const { service, provider } = createService(card());
    provider.synthesizeSpeech.mockImplementationOnce((async (request: { voice: string }) => ({
      bytes: mp3Bytes(),
      contentType: 'audio/mpeg' as const,
      model: 'eleven_multilingual_v2',
      provider: 'avalai.ir',
      voice: request.voice,
      format: { sampleRateHz: 44100, bitrateKbps: 128, channels: 1 as const, variableBitrate: false },
    })) as never);
    const generated = await service.generate({ cardId: CARD_ID, kind: 'word_audio', actorUserId: ACTOR });
    if (generated.status !== 'generated') throw new Error('expected generation');
    expect(generated.candidate.audioFormat).toEqual({ sampleRateHz: 44100, bitrateKbps: 128, channels: 1 });
  });
});
