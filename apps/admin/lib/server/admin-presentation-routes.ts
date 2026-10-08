import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import {
  maximumActiveSlides,
  maximumSlideDescription,
  maximumSlideTitle,
  normalizeSlideImage,
  parseSlideDestination,
  type SlideDestination,
} from './presentation-slide';
import type {
  PostgresPresentationSlidesStore,
  ReorderSlidesResult,
  UpsertSlideResult,
} from './postgres-presentation-slides-store';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** `banners.id` is a text key with the shape `banner_` + 8 hex characters (see migration 0022). */
const slideIdPattern = /^banner_[a-z0-9-]{1,64}$/;
/** An upload larger than this is refused before it is decoded. */
const maximumUploadBytes = 6 * 1024 * 1024;
/** A reorder names every slide once; the bound keeps a replayed payload from growing unbounded. */
const maximumReorderIds = 50;

type SlideDependencies<TMethod extends keyof PostgresPresentationSlidesStore> = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresPresentationSlidesStore, TMethod>;
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

function unavailable() {
  return new Response('Presentation unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...init?.headers },
  });
}

function readIdempotencyKey(request: Request): string | undefined {
  const value = request.headers.get('idempotency-key');
  if (!value || !uuidPattern.test(value)) return undefined;
  return value;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) return undefined;
  return trimmed;
}

/**
 * Shared gate for every presentation mutation: the default-off flag, trusted origin and content
 * type, Admin session, per-session CSRF, recent re-authentication, idempotency key.
 *
 * Identical in shape to the splash gate, because both change what every learner sees. Changing the
 * home-screen slider must not be easier to trigger than replacing the launch screen.
 */
async function authorizeMutation(
  request: Request,
  dependencies: {
    enabled: boolean;
    config: AdminAuthConfig;
    sessionStore?: unknown;
    now?: () => Date;
  },
  contentTypes: readonly string[],
): Promise<
  { ok: true; actorUserId: string; idempotencyKey: string } | { ok: false; response: Response }
> {
  if (!dependencies.enabled || !dependencies.config.enabled || !dependencies.sessionStore) {
    return { ok: false, response: notFound() };
  }
  const config: EnabledAdminAuthConfig = dependencies.config;
  try {
    assertTrustedAdminMutation(request, config, contentTypes);
  } catch {
    return { ok: false, response: genericInvalid() };
  }
  const session = await loadAdminSession(
    request,
    config,
    dependencies.sessionStore as Parameters<typeof loadAdminSession>[2],
    (dependencies.now ?? (() => new Date()))(),
  );
  if (!session) return { ok: false, response: unauthorized() };
  try {
    verifyAdminCsrf(request, session.csrfHash, config);
  } catch {
    return { ok: false, response: genericInvalid() };
  }
  if (!session.recent) {
    return { ok: false, response: json({ code: 'reauthentication_required' }, { status: 428 }) };
  }
  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) return { ok: false, response: genericInvalid() };

  return { ok: true, actorUserId: session.userId, idempotencyKey };
}

/** Session-only gate for the two read paths: default-off flag, then a valid Admin session. */
async function authorizeRead(
  request: Request,
  dependencies: {
    enabled: boolean;
    config: AdminAuthConfig;
    sessionStore?: Parameters<typeof loadAdminSession>[2];
    now?: () => Date;
  },
): Promise<{ ok: true; actorUserId: string } | { ok: false; response: Response }> {
  if (!dependencies.enabled || !dependencies.config.enabled || !dependencies.sessionStore) {
    return { ok: false, response: notFound() };
  }
  const session = await loadAdminSession(
    request,
    dependencies.config,
    dependencies.sessionStore,
    (dependencies.now ?? (() => new Date()))(),
  );
  if (!session) return { ok: false, response: unauthorized() };
  return { ok: true, actorUserId: session.userId };
}

export function createPresentationSlidesRoute(dependencies: SlideDependencies<'listSlides'>) {
  return async function GET(request: Request) {
    if (!dependencies.store) return notFound();
    const gate = await authorizeRead(request, dependencies);
    if (!gate.ok) return gate.response;

    try {
      const result = await dependencies.store.listSlides({ actorUserId: gate.actorUserId });
      if (result.status === 'forbidden') return notFound();
      return json({ slides: result.rows, maximumActiveSlides });
    } catch {
      return unavailable();
    }
  };
}

/**
 * GET — the stored bytes of one slide image, for the Admin preview.
 *
 * The caller names a SLIDE, never an object key or a path, so this route cannot be walked to any
 * other stored object. The response is `private, no-store` so an operator-only image is never held
 * by a shared cache.
 */
export function createPresentationSlideImageRoute(
  dependencies: SlideDependencies<'readSlideImage'>,
) {
  return async function GET(request: Request) {
    if (!dependencies.store) return notFound();
    const gate = await authorizeRead(request, dependencies);
    if (!gate.ok) return gate.response;

    const slideId = new URL(request.url).searchParams.get('slideId');
    if (!slideId || !slideIdPattern.test(slideId)) return genericInvalid();

    try {
      const result = await dependencies.store.readSlideImage({
        slideId,
        actorUserId: gate.actorUserId,
      });
      if (result.status === 'forbidden') return notFound();
      if (result.status === 'not_found') return notFound();
      return new Response(new Uint8Array(result.bytes), {
        status: 200,
        headers: {
          'Content-Type': 'image/webp',
          'Content-Length': String(result.bytes.length),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          ETag: `"${result.checksum}"`,
        },
      });
    } catch {
      return unavailable();
    }
  };
}

type ParsedSlideForm = {
  slideId?: string;
  title: string;
  description: string | null;
  destination: SlideDestination;
  isActive: boolean;
  image?: Blob;
};

/**
 * Reads the multipart body: a JSON `payload` field plus an optional `image` file.
 *
 * Multipart rather than two endpoints, so the image and the slide it belongs to are decided in one
 * authorized request and one transaction. There is no route that accepts a stored object key from
 * the client, so an operator cannot point a slide at bytes they did not just upload.
 */
async function parseSlideForm(request: Request): Promise<ParsedSlideForm | undefined> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return undefined;
  }
  const rawPayload = form.get('payload');
  if (typeof rawPayload !== 'string' || rawPayload.length > 4096) return undefined;
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawPayload);
    if (!parsed || typeof parsed !== 'object') return undefined;
    payload = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }

  const slideId = payload.slideId;
  if (slideId !== undefined && (typeof slideId !== 'string' || !slideIdPattern.test(slideId))) {
    return undefined;
  }
  const title = optionalText(payload.title, maximumSlideTitle);
  if (!title) return undefined;
  const description = optionalText(payload.description, maximumSlideDescription);
  if (description === undefined) return undefined;
  if (typeof payload.isActive !== 'boolean') return undefined;
  const destination = parseSlideDestination(payload.destination);
  if (!destination) return undefined;

  const image = form.get('image');
  if (image !== null && !(image instanceof Blob)) return undefined;

  return {
    slideId: typeof slideId === 'string' ? slideId : undefined,
    title,
    description,
    destination,
    isActive: payload.isActive,
    image: image instanceof Blob && image.size > 0 ? image : undefined,
  };
}

function upsertResponse(result: UpsertSlideResult) {
  switch (result.status) {
    case 'applied':
      return json({ status: 'applied', slide: result.row });
    case 'idempotent':
      return json({ status: 'idempotent', slide: result.row });
    case 'active_limit_reached':
      return json(
        {
          code: 'active_limit_reached',
          activeCount: result.activeCount,
          maximumActiveSlides,
        },
        { status: 409 },
      );
    case 'image_required':
      return json({ code: 'image_required' }, { status: 400 });
    case 'unknown_pack':
      return json({ code: 'unknown_pack' }, { status: 400 });
    case 'forbidden':
    case 'not_found':
      return notFound();
  }
}

export function createPresentationSlideUpsertRoute(
  dependencies: SlideDependencies<'upsertSlide'> & {
    normalize?: typeof normalizeSlideImage;
  },
) {
  return async function POST(request: Request) {
    if (!dependencies.store) return notFound();
    const authorized = await authorizeMutation(request, dependencies, ['multipart/form-data']);
    if (!authorized.ok) return authorized.response;

    const form = await parseSlideForm(request);
    if (!form) return genericInvalid();

    let imageBytes: Buffer | undefined;
    if (form.image) {
      if (form.image.size > maximumUploadBytes) {
        return json({ code: 'image_rejected', reason: 'file_too_large' }, { status: 413 });
      }
      const normalized = await (dependencies.normalize ?? normalizeSlideImage)(
        Buffer.from(await form.image.arrayBuffer()),
      );
      if (normalized.kind === 'rejected') {
        return json({ code: 'image_rejected', reason: normalized.code }, { status: 400 });
      }
      imageBytes = normalized.bytes;
    }

    try {
      const result = await dependencies.store.upsertSlide({
        slideId: form.slideId,
        title: form.title,
        description: form.description,
        destination: form.destination,
        isActive: form.isActive,
        imageBytes,
        actorUserId: authorized.actorUserId,
        idempotencyKey: authorized.idempotencyKey,
      });
      return upsertResponse(result);
    } catch {
      return unavailable();
    }
  };
}

function reorderResponse(result: ReorderSlidesResult) {
  switch (result.status) {
    case 'applied':
      return json({ status: 'applied', slides: result.rows });
    case 'idempotent':
      return json({ status: 'idempotent', slides: result.rows });
    case 'invalid_order':
      return json({ code: 'invalid_order' }, { status: 400 });
    case 'forbidden':
      return notFound();
  }
}

export function createPresentationSlideReorderRoute(
  dependencies: SlideDependencies<'reorderSlides'>,
) {
  return async function POST(request: Request) {
    if (!dependencies.store) return notFound();
    const authorized = await authorizeMutation(request, dependencies, ['application/json']);
    if (!authorized.ok) return authorized.response;

    const body = await request
      .json()
      .then((value) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined,
      )
      .catch(() => undefined);
    const order = body?.order;
    if (
      !Array.isArray(order) ||
      order.length === 0 ||
      order.length > maximumReorderIds ||
      !order.every((id) => typeof id === 'string' && slideIdPattern.test(id))
    ) {
      return genericInvalid();
    }

    try {
      const result = await dependencies.store.reorderSlides({
        order: order as string[],
        actorUserId: authorized.actorUserId,
        idempotencyKey: authorized.idempotencyKey,
      });
      return reorderResponse(result);
    } catch {
      return unavailable();
    }
  };
}
