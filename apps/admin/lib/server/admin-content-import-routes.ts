import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import { buildCsvTemplate, IMPORT_COLUMNS } from './content-import-contract';
import type { ContentImportService } from './content-import-service';

/**
 * Phase 1 / Milestone 1.3 — CSV/XLSX import routes.
 *
 * The guard chain is the SAME one M1.2 uses (origin → session → CSRF → recent-reauth), with one
 * documented difference: an upload is `multipart/form-data`, so that content type is passed to
 * `assertTrustedAdminMutation` instead of JSON. The Origin check still blocks cross-site form
 * posts, and CSRF is still verified from the per-session token.
 *
 * Preview performs NO writes. Only the confirm route reaches the canonical write path, and it
 * requires the fingerprint the Admin was shown.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Upload ceiling. A spreadsheet of 2000 vocabulary rows is far below this. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type RouteDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  service?: ContentImportService;
  now?: () => Date;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
function unauthorized() {
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}
function forbidden() {
  return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
}
function genericInvalid() {
  return new Response('Invalid request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
}
function unavailable() {
  return new Response('Content import unavailable', {
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

async function authorizeUpload(
  request: Request,
  dependencies: { config: AdminAuthConfig; sessionStore?: Parameters<typeof loadAdminSession>[2] },
  now: Date,
): Promise<{ response: Response } | { actorUserId: string }> {
  const config = dependencies.config as EnabledAdminAuthConfig;
  try {
    assertTrustedAdminMutation(request, config, ['multipart/form-data']);
  } catch {
    return { response: genericInvalid() };
  }
  const session = await loadAdminSession(request, config, dependencies.sessionStore!, now);
  if (!session) return { response: unauthorized() };
  try {
    verifyAdminCsrf(request, session.csrfHash, config);
  } catch {
    return { response: genericInvalid() };
  }
  if (!session.recent) {
    return { response: json({ code: 'reauthentication_required' }, { status: 428 }) };
  }
  return { actorUserId: session.userId };
}

async function readUpload(
  request: Request,
): Promise<{ packId: string; filename: string; bytes: Buffer; form: FormData } | undefined> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return undefined;
  }
  const packId = form.get('packId');
  const file = form.get('file');
  if (typeof packId !== 'string' || !packId.trim()) return undefined;
  if (!file || typeof file === 'string') return undefined;
  const blob = file as unknown as {
    size: number;
    name?: string;
    arrayBuffer(): Promise<ArrayBuffer>;
  };
  if (typeof blob.arrayBuffer !== 'function') return undefined;
  if (blob.size > MAX_UPLOAD_BYTES) return undefined;
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length === 0) return undefined;
  return { packId: packId.trim().toLowerCase(), filename: blob.name ?? 'upload.csv', bytes, form };
}

/** POST — parse + validate + classify an upload. Performs NO database writes. */
export function createContentImportPreviewRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.service
    ) {
      return notFound();
    }
    const now = (dependencies.now ?? (() => new Date()))();
    const authorized = await authorizeUpload(request, dependencies, now);
    if ('response' in authorized) return authorized.response;

    const upload = await readUpload(request);
    if (!upload) return genericInvalid();

    try {
      const result = await dependencies.service.analyze({
        packId: upload.packId,
        filename: upload.filename,
        bytes: upload.bytes,
      });
      if (result.status === 'not_found') return notFound();
      if (result.status === 'unreadable') {
        return json({ code: 'unreadable_file', message: result.message }, { status: 422 });
      }
      return json({ status: 'preview', analysis: result.analysis });
    } catch {
      return unavailable();
    }
  };
}

/** POST — apply a CONFIRMED import through the canonical M1.2 write path. */
export function createContentImportConfirmRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.service
    ) {
      return notFound();
    }
    const now = (dependencies.now ?? (() => new Date()))();
    const authorized = await authorizeUpload(request, dependencies, now);
    if ('response' in authorized) return authorized.response;

    const upload = await readUpload(request);
    if (!upload) return genericInvalid();

    const fingerprint = upload.form.get('fingerprint');
    const importKey = upload.form.get('importKey');
    if (typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint)) {
      return genericInvalid();
    }
    // The import key is the retry anchor: the same key re-applied is a no-op, never a second card.
    if (typeof importKey !== 'string' || !uuidPattern.test(importKey)) return genericInvalid();

    try {
      const result = await dependencies.service.apply({
        packId: upload.packId,
        filename: upload.filename,
        bytes: upload.bytes,
        actorUserId: authorized.actorUserId,
        importKey,
        expectedFingerprint: fingerprint,
      });
      switch (result.status) {
        case 'forbidden':
          return forbidden();
        case 'not_found':
          return notFound();
        case 'stale':
          return json({ code: 'stale_preview', message: result.message }, { status: 409 });
        default:
          return json({
            status: result.status,
            created: result.created,
            skipped: result.skipped,
            outcomes: result.outcomes,
          });
      }
    } catch {
      return unavailable();
    }
  };
}

/**
 * GET — the downloadable import template, generated from the canonical contract.
 *
 * Read-only and session-guarded: the template describes the private content schema, so it is not
 * public, but it needs no CSRF/reauth because it mutates nothing.
 */
export function createContentImportTemplateRoute(dependencies: RouteDependencies) {
  return async function GET(request: Request) {
    if (!dependencies.enabled || !dependencies.config.enabled || !dependencies.sessionStore) {
      return notFound();
    }
    const now = (dependencies.now ?? (() => new Date()))();
    const config = dependencies.config as EnabledAdminAuthConfig;
    const session = await loadAdminSession(request, config, dependencies.sessionStore, now);
    if (!session) return unauthorized();

    const withExample = new URL(request.url).searchParams.get('example') === '1';
    const csv = buildCsvTemplate({ withExample });
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="learnbox-import-template.csv"',
        'Cache-Control': 'no-store',
      },
    });
  };
}

/** GET — the column contract, so the Admin UI documents columns from one source of truth. */
export function createContentImportContractRoute(dependencies: RouteDependencies) {
  return async function GET(request: Request) {
    if (!dependencies.enabled || !dependencies.config.enabled || !dependencies.sessionStore) {
      return notFound();
    }
    const now = (dependencies.now ?? (() => new Date()))();
    const config = dependencies.config as EnabledAdminAuthConfig;
    const session = await loadAdminSession(request, config, dependencies.sessionStore, now);
    if (!session) return unauthorized();
    return json({ columns: IMPORT_COLUMNS });
  };
}
