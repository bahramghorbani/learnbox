/**
 * Phase 1 / Milestone 1.5 — card media generation routes.
 *
 * Same guard chain as M1.2/M1.3/M1.4: Origin → session → CSRF → recent re-auth, on every route
 * including the read ones. These endpoints spend real money and return protected learning content,
 * so an unauthenticated caller must never reach the provider or the bytes.
 *
 * Candidate media is served from here only, with `private, no-store`. There is no public path to a
 * generated image or audio file, and an unaccepted candidate is never exposed to a learner route.
 */

import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import { AiProviderError } from './ai-generation-provider';
import type { AiMediaProvider } from './ai-media-provider';
import type { CardMediaGenerationService } from './card-media-generation-service';
import type { CardMediaKind } from './card-media-storage';
import type { GermanVoiceMapping } from '@learnbox/content-models';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MEDIA_KINDS: CardMediaKind[] = ['image', 'word_audio', 'sentence_audio'];

/**
 * The fixed German sample used for voice preview. Short by design: previewing a voice must not
 * become a general-purpose text-to-speech playground, and it keeps the cost of checking a voice
 * negligible.
 */
export const VOICE_PREVIEW_SAMPLE = 'Guten Tag. Das ist eine deutsche Stimme für LearnBox.';

type RouteDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  service?: CardMediaGenerationService;
  provider?: AiMediaProvider;
  voices?: GermanVoiceMapping;
  audioTimeoutMs?: number;
  now?: () => Date;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
function unauthorized() {
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}
function genericInvalid() {
  return new Response('Invalid request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
}
function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...init?.headers },
  });
}
function providerNotConfigured() {
  return json(
    { code: 'provider_not_configured', message: 'سرویس رسانهٔ هوش مصنوعی پیکربندی نشده است.' },
    { status: 503 },
  );
}

/**
 * Authorizes a media request. Authentication runs BEFORE the provider-availability check, so an
 * unconfigured provider never leaks its state to an anonymous caller.
 */
async function authorize(
  request: Request,
  dependencies: RouteDependencies,
  options: { requireCsrf?: boolean } = {},
): Promise<{ response: Response } | { actorUserId: string }> {
  if (!dependencies.config.enabled || !dependencies.sessionStore) {
    return { response: notFound() };
  }
  const config = dependencies.config as EnabledAdminAuthConfig;
  const requireCsrf = options.requireCsrf !== false;
  if (requireCsrf) {
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return { response: genericInvalid() };
    }
  }
  const now = (dependencies.now ?? (() => new Date()))();
  const session = await loadAdminSession(request, config, dependencies.sessionStore, now);
  if (!session) return { response: unauthorized() };
  if (requireCsrf) {
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return { response: genericInvalid() };
    }
  }
  if (!session.recent) {
    return { response: json({ code: 'reauthentication_required' }, { status: 428 }) };
  }
  if (!dependencies.enabled || !dependencies.service) {
    return {
      response: json(
        { code: 'disabled', message: 'تولید رسانه با هوش مصنوعی فعال نیست.' },
        { status: 503 },
      ),
    };
  }
  return { actorUserId: session.userId };
}

async function readJson(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
    return body as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readKind(value: unknown): CardMediaKind | undefined {
  return MEDIA_KINDS.find((kind) => kind === value);
}

/**
 * GET — the media capability profiles the Admin may configure.
 *
 * Credential-free by construction: returns model ids, the current defaults and the configured
 * voice roles only. An unreadable catalogue is not an error; the Admin keeps the working defaults.
 */
export function createMediaModelsRoute(dependencies: RouteDependencies) {
  return async function GET(request: Request) {
    const authorized = await authorize(request, dependencies, { requireCsrf: false });
    if ('response' in authorized) return authorized.response;
    if (!dependencies.provider) return providerNotConfigured();

    const [imageModels, audioModels] = await Promise.all([
      dependencies.provider.listImageModels(),
      dependencies.provider.listAudioModels(),
    ]);
    const voices = dependencies.voices;

    return json({
      gateway: dependencies.provider.provider,
      image: { defaultModel: dependencies.provider.imageModel, models: imageModels },
      audio: { defaultModel: dependencies.provider.audioModel, models: audioModels },
      // The effective voice per role, including whether DAS falls back to the DIE female voice.
      voices: voices
        ? {
            der: voices.der,
            die: voices.die,
            das: voices.das ?? null,
            dasUsesDieFallback: !voices.das,
            default: voices.default,
            language: 'de',
            locale: 'de-DE',
          }
        : null,
    });
  };
}

/** GET — per-card media state: accepted asset and latest candidate for each kind. */
export function createMediaStateRoute(dependencies: RouteDependencies) {
  return async function GET(request: Request) {
    const authorized = await authorize(request, dependencies, { requireCsrf: false });
    if ('response' in authorized) return authorized.response;

    const cardId = new URL(request.url).searchParams.get('cardId');
    if (!cardId || !uuidPattern.test(cardId)) return genericInvalid();

    const media = await dependencies.service!.getCardMediaState(cardId);
    return json({ cardId, media });
  };
}

/**
 * POST — generate one media candidate.
 *
 * Produces a candidate only. Accepted media is never touched here, so a failed or abandoned
 * generation leaves the card's current media exactly as it was.
 */
export function createMediaGenerateRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request) {
    const authorized = await authorize(request, dependencies);
    if ('response' in authorized) return authorized.response;
    if (!dependencies.provider) return providerNotConfigured();

    const body = await readJson(request);
    const kind = readKind(body?.kind);
    const cardId = typeof body?.cardId === 'string' ? body.cardId : undefined;
    if (!body || !kind || !cardId || !uuidPattern.test(cardId)) return genericInvalid();

    try {
      const result = await dependencies.service!.generate({
        cardId,
        kind,
        actorUserId: authorized.actorUserId,
        model: typeof body.model === 'string' ? body.model : undefined,
      });

      if (result.status === 'forbidden') {
        return json({ code: 'forbidden' }, { status: 403 });
      }
      if (result.status === 'card_not_found') {
        return json({ code: 'card_not_found' }, { status: 404 });
      }
      if (result.status === 'already_generating') {
        return json({ code: 'already_generating' }, { status: 409 });
      }
      if (result.status === 'unprocessable') {
        return json({ code: 'unprocessable', message: result.reason }, { status: 422 });
      }
      if (result.status === 'provider_failed') {
        // The real failure is reported; no other model or voice is silently substituted.
        return json({ code: result.code, message: result.message }, { status: 502 });
      }
      return json({ status: 'generated', candidate: result.candidate });
    } catch {
      // Intentionally not logged: AvalAI error bodies echo a masked fragment of the credential,
      // so the text must not reach logs. Fails closed with no fabricated media.
      return json({ code: 'generation_failed' }, { status: 503 });
    }
  };
}

/** POST — explicitly accept a candidate as the card's canonical media. Idempotent. */
export function createMediaAcceptRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request) {
    const authorized = await authorize(request, dependencies);
    if ('response' in authorized) return authorized.response;

    const body = await readJson(request);
    const kind = readKind(body?.kind);
    const cardId = typeof body?.cardId === 'string' ? body.cardId : undefined;
    const candidateId = typeof body?.candidateId === 'string' ? body.candidateId : undefined;
    if (
      !body ||
      !kind ||
      !cardId ||
      !candidateId ||
      !uuidPattern.test(cardId) ||
      !uuidPattern.test(candidateId)
    ) {
      return genericInvalid();
    }

    const result = await dependencies.service!.accept({
      cardId,
      kind,
      candidateId,
      actorUserId: authorized.actorUserId,
    });

    if (result.status === 'forbidden') return json({ code: 'forbidden' }, { status: 403 });
    if (result.status === 'candidate_not_found') {
      return json({ code: 'candidate_not_found' }, { status: 404 });
    }
    if (result.status === 'candidate_not_ready') {
      return json({ code: 'candidate_not_ready' }, { status: 409 });
    }
    // A replayed acceptance reports the same accepted candidate rather than creating a second one.
    if (result.status === 'already_accepted') {
      return json({ status: 'already_accepted', candidate: result.candidate });
    }
    return json({ status: 'accepted', candidate: result.candidate, replaced: result.replaced });
  };
}

/**
 * GET — protected candidate/accepted media bytes for Admin preview and playback.
 *
 * This is the only read path for generated media, and it is fully authenticated. The response is
 * `private, no-store` so a candidate is never cached by a shared cache or a CDN.
 */
export function createMediaAssetRoute(dependencies: RouteDependencies) {
  return async function GET(request: Request) {
    const authorized = await authorize(request, dependencies, { requireCsrf: false });
    if ('response' in authorized) return authorized.response;

    const candidateId = new URL(request.url).searchParams.get('candidateId');
    if (!candidateId || !uuidPattern.test(candidateId)) return genericInvalid();

    const result = await dependencies.service!.readCandidateMedia(
      candidateId,
      authorized.actorUserId,
    );
    if (result === 'forbidden') return json({ code: 'forbidden' }, { status: 403 });
    if (result === 'not_found') return notFound();

    return new Response(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        'Content-Type': result.mediaType,
        'Content-Length': String(result.bytes.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ETag: `"${result.checksum}"`,
      },
    });
  };
}

/**
 * POST — speak a short fixed German sample in a configured voice.
 *
 * Exists so the Admin can confirm German pronunciation, Hochdeutsch quality and the male/female/
 * younger identity of the configured voices. The text is fixed and not caller-supplied.
 */
export function createVoicePreviewRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request) {
    const authorized = await authorize(request, dependencies);
    if ('response' in authorized) return authorized.response;
    if (!dependencies.provider || !dependencies.voices) return providerNotConfigured();

    const body = await readJson(request);
    const role = body?.role;
    const voices = dependencies.voices;
    const voice =
      role === 'der'
        ? voices.der
        : role === 'die'
          ? voices.die
          : role === 'das'
            ? (voices.das ?? voices.die)
            : role === 'default'
              ? voices.default
              : undefined;
    if (!voice) return genericInvalid();

    try {
      const audio = await dependencies.provider.synthesizeSpeech({
        text: VOICE_PREVIEW_SAMPLE,
        voice,
        timeoutMs: dependencies.audioTimeoutMs ?? 60_000,
      });
      return new Response(new Uint8Array(audio.bytes), {
        status: 200,
        headers: {
          'Content-Type': audio.contentType,
          'Content-Length': String(audio.bytes.length),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          // Tells the Admin which voice actually spoke, and whether DAS used the DIE fallback.
          'X-LearnBox-Voice': voice,
          'X-LearnBox-Voice-Fallback': role === 'das' && !voices.das ? 'die_female' : 'none',
        },
      });
    } catch (error) {
      if (error instanceof AiProviderError) {
        return json({ code: error.code, message: error.message }, { status: 502 });
      }
      return json({ code: 'voice_preview_failed' }, { status: 503 });
    }
  };
}
