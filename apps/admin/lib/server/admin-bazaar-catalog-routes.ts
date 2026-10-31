import type { AdminAuthConfig } from './admin-auth-policy';
import { loadAdminSession } from './admin-route-security';
import {
  cafeBazaarCsv,
  type PostgresBazaarCatalogExportStore,
} from './postgres-bazaar-catalog-export-store';

type Dependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresBazaarCatalogExportStore, 'exportCatalog'>;
  now?: () => Date;
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
