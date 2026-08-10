import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import type { NormalizedSplashCandidate } from './replace-splash';

type ReplaceResult =
  | { status: 'replaced'; versionId: string }
  | { status: 'idempotent'; versionId: string }
  | { status: 'in_progress' };

type ReplaceDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  normalize?: (
    bytes: Buffer,
  ) => Promise<
    | ({ kind: 'normalized' } & NormalizedSplashCandidate)
    | { kind: 'rejected'; code: string }
  >;
  replace?: (input: {
    candidate: NormalizedSplashCandidate;
    idempotencyKey: string;
    now: Date;
  }) => Promise<ReplaceResult>;
  now?: () => Date;
};

type CurrentDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: {
    getCurrentSplash(): Promise<
      | {
          versionId: string;
          objectKey: string;
          width: number;
          height: number;
          byteSize: number;
          updatedAt: Date;
        }
      | undefined
    >;
  };
  now?: () => Date;
};

type PreviewDependencies = CurrentDependencies & {
  storage?: {
    read(objectKey: string): Promise<ReadableStream<Uint8Array> | undefined>;
  };
};

const maximumImageBytes = 8 * 1024 * 1024;
const maximumMultipartBytes = maximumImageBytes + 256 * 1024;
const idempotencyKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function genericInvalid() {
  return new Response('Invalid request', {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function createSplashPreviewRoute(dependencies: PreviewDependencies) {
  return async function GET(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store ||
      !dependencies.storage
    ) {
      return notFound();
    }
    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      currentTime,
    );
    if (!session) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    try {
      const current = await dependencies.store.getCurrentSplash();
      if (!current) return notFound();
      const stream = await dependencies.storage.read(current.objectKey);
      if (!stream) return notFound();
      return new Response(stream, {
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Type': 'image/webp',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Splash preview unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}

export function createSplashCurrentRoute(dependencies: CurrentDependencies) {
  return async function GET(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      currentTime,
    );
    if (!session) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    try {
      const current = await dependencies.store.getCurrentSplash();
      return Response.json(
        {
          current: current
            ? {
                revision: current.versionId,
                width: current.width,
                height: current.height,
                byteSize: current.byteSize,
                updatedAt: current.updatedAt.toISOString(),
                previewPath: '/api/splash/preview',
              }
            : null,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch {
      return new Response('Splash metadata unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}

export function createSplashReplaceRoute(dependencies: ReplaceDependencies) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.normalize ||
      !dependencies.replace
    ) {
      return notFound();
    }
    const config: EnabledAdminAuthConfig = dependencies.config;
    try {
      assertTrustedAdminMutation(request, config, ['multipart/form-data']);
    } catch {
      return genericInvalid();
    }
    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(request, config, dependencies.sessionStore, currentTime);
    if (!session) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return genericInvalid();
    }
    if (!session.recent) {
      return Response.json(
        { code: 'reauthentication_required' },
        { status: 428, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const contentLength = request.headers.get('content-length');
    if (!contentLength || !/^\d+$/.test(contentLength)) return genericInvalid();
    const bodyBytes = Number(contentLength);
    if (!Number.isSafeInteger(bodyBytes) || bodyBytes <= 0 || bodyBytes > maximumMultipartBytes) {
      return new Response('Payload too large', {
        status: 413,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || !idempotencyKeyPattern.test(idempotencyKey)) {
      return genericInvalid();
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return genericInvalid();
    }
    const file = form.get('splash');
    if (!(file instanceof File) || file.size <= 0) return genericInvalid();
    if (file.size > maximumImageBytes) {
      return new Response('Payload too large', {
        status: 413,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const normalized = await dependencies.normalize(Buffer.from(await file.arrayBuffer()));
    if (normalized.kind === 'rejected') {
      return Response.json(
        { code: normalized.code },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    try {
      const result = await dependencies.replace({
        candidate: normalized,
        idempotencyKey,
        now: currentTime,
      });
      if (result.status === 'in_progress') {
        return Response.json(
          { code: 'replacement_in_progress' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return Response.json(
        {
          status: result.status,
          revision: result.versionId,
          previewPath: '/api/splash/preview',
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch {
      return new Response('Splash replacement unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}
