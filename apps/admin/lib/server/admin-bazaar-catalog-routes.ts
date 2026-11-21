import {
  cafeBazaarManualEntry,
  type PostgresBazaarCatalogExportStore,
} from './postgres-bazaar-catalog-export-store';
import { assertTrustedAdminMutation, type AdminAuthConfig } from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** `packs.id` is canonical lowercase text, never a client-owned SKU. */
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;

type Dependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresBazaarCatalogExportStore, 'exportCatalogItem' | 'confirmCatalogItem'>;
  now?: () => Date;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function unauthorized() {
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

function invalid() {
  return new Response('Invalid request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
}

function unavailable() {
  return Response.json(
    { code: 'bazaar_catalog_unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * GET: downloads a copy/paste sheet for ONE verified sellable pack. Bazaar removed CSV import and
 * has no product API, so this artifact is the deliberate manual boundary — it cannot create a
 * provider mapping or activate checkout.
 */
export function createCafeBazaarCatalogExportRoute(dependencies: Dependencies) {
  return async function GET(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const packId = new URL(request.url).searchParams.get('packId');
    if (!packId || !packIdPattern.test(packId)) return invalid();
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session) return unauthorized();
    try {
      const result = await dependencies.store.exportCatalogItem({
        actorUserId: session.userId,
        packId,
      });
      if (result.status !== 'ok') return notFound();
      return new Response(cafeBazaarManualEntry(result.item), {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="learnbox-bazaar-${packId}.txt"`,
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return unavailable();
    }
  };
}

function readPackId(request: Request): Promise<string | undefined> {
  return request
    .json()
    .then((value: unknown) => {
      if (!value || typeof value !== 'object') return undefined;
      const packId = (value as Record<string, unknown>).packId;
      return typeof packId === 'string' && packIdPattern.test(packId) ? packId : undefined;
    })
    .catch(() => undefined);
}

/**
 * POST: after the owner manually creates exactly this product in Bazaar, record only this pack's
 * SKU + canonical price locally. The external panel is never trusted or mutated by LearnBox.
 */
export function createCafeBazaarCatalogItemConfirmRoute(dependencies: Dependencies) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    try {
      assertTrustedAdminMutation(request, dependencies.config, ['application/json']);
    } catch {
      return invalid();
    }
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session) return unauthorized();
    try {
      verifyAdminCsrf(request, session.csrfHash, dependencies.config);
    } catch {
      return invalid();
    }
    if (!session.recent) {
      return Response.json(
        { code: 'reauthentication_required' },
        { status: 428, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || !uuidPattern.test(idempotencyKey)) return invalid();
    const packId = await readPackId(request);
    if (!packId) return invalid();
    try {
      const result = await dependencies.store.confirmCatalogItem({
        actorUserId: session.userId,
        packId,
        idempotencyKey,
      });
      if (result.status !== 'confirmed') return notFound();
      return Response.json(
        { status: 'confirmed', productId: result.item.productId },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch {
      return unavailable();
    }
  };
}

type LegacyConfirmDependencies = Omit<Dependencies, 'store'> & {
  store?: {
    confirmCatalog(input: {
      actorUserId: string;
      idempotencyKey: string;
    }): Promise<{ status: 'forbidden' } | ({ status: 'confirmed' } & Record<string, unknown>)>;
  };
  unavailableCode?: string;
};

/** Legacy bulk confirmation retained only for the existing Sibapp sync adapter. */
export function createCafeBazaarCatalogConfirmRoute(dependencies: LegacyConfirmDependencies) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    )
      return notFound();
    try {
      assertTrustedAdminMutation(request, dependencies.config, ['application/json']);
    } catch {
      return invalid();
    }
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session) return unauthorized();
    try {
      verifyAdminCsrf(request, session.csrfHash, dependencies.config);
    } catch {
      return invalid();
    }
    if (!session.recent)
      return Response.json(
        { code: 'reauthentication_required' },
        { status: 428, headers: { 'Cache-Control': 'no-store' } },
      );
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || !uuidPattern.test(idempotencyKey)) return invalid();
    try {
      const result = await dependencies.store.confirmCatalog({
        actorUserId: session.userId,
        idempotencyKey,
      });
      if (result.status === 'forbidden') return notFound();
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json(
        { code: dependencies.unavailableCode ?? 'bazaar_catalog_unavailable' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  };
}
