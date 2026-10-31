import { assertTrustedAdminMutation, type AdminAuthConfig } from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import {
  cafeBazaarCsv,
  type PostgresBazaarCatalogExportStore,
} from './postgres-bazaar-catalog-export-store';

type Dependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresBazaarCatalogExportStore, 'exportCatalog' | 'confirmCatalog'>;
  now?: () => Date;
};

type ConfirmDependencies = Omit<Dependencies, 'store'> & {
  store?: {
    confirmCatalog(input: {
      actorUserId: string;
      idempotencyKey: string;
    }): Promise<{ status: 'forbidden' } | ({ status: 'confirmed' } & Record<string, unknown>)>;
  };
  /** Error code returned on provider/database failure; defaults to Bazaar's. */
  unavailableCode?: string;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function unauthorized() {
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Produces an owner-reviewed Cafe Bazaar CSV from canonical paid, published and listed packs.
 * GET-only by design: this neither contacts Bazaar nor writes a provider SKU mapping or checkout
 * state. The owner imports the downloaded artifact manually in Bazaar's developer portal.
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
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session) return unauthorized();

    try {
      const result = await dependencies.store.exportCatalog({ actorUserId: session.userId });
      if (result.status === 'forbidden') return notFound();
      return new Response(cafeBazaarCsv(result.items), {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="learnbox-cafe-bazaar-catalog.csv"',
          'Content-Type': 'text/csv; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Bazaar catalog unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function invalid() {
  return new Response('Invalid request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST: the owner confirms the current CSV is imported in Bazaar's panel, recording the
 * cafe_bazaar SKU mappings. Full Admin mutation gate, mirroring Myket catalog sync.
 */
export function createCafeBazaarCatalogConfirmRoute(dependencies: ConfirmDependencies) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const config = dependencies.config;
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return invalid();
    }
    const session = await loadAdminSession(
      request,
      config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session) return unauthorized();
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return invalid();
    }
    if (!session.recent) {
      return Response.json(
        { code: 'reauthentication_required' },
        { status: 428, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const key = request.headers.get('idempotency-key');
    if (!key || !uuidPattern.test(key)) return invalid();
    try {
      const result = await dependencies.store.confirmCatalog({
        actorUserId: session.userId,
        idempotencyKey: key,
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
