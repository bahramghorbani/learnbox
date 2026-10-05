import { type AdminAuthConfig } from './admin-auth-policy';
import { loadAdminSession } from './admin-route-security';
import { type PostgresContentPacksStore } from './postgres-content-packs-store';

type ListDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresContentPacksStore, 'listPacks'>;
  now?: () => Date;
  /**
   * Whether Pack/Card management writes are live (Phase 1 / M1.2). Reported to the client so the
   * workspace can keep create/edit controls hidden when they would have no real behaviour.
   */
  manageEnabled?: boolean;
  /** M1.4: whether AI pack generation is available (manage gate AND a configured provider). */
  aiEnabled?: boolean;
};

type CardsDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresContentPacksStore, 'listPackCards'>;
  now?: () => Date;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function unavailable() {
  return new Response('Content packs unavailable', {
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

export function createContentPacksListRoute(dependencies: ListDependencies) {
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
    if (!session) return unauthorized();

    try {
      const result = await dependencies.store.listPacks(session.userId);
      if (result.status === 'forbidden') return notFound();
      return json({
        packs: result.packs,
        manageEnabled: dependencies.manageEnabled === true,
        aiEnabled: dependencies.aiEnabled === true,
      });
    } catch {
      return unavailable();
    }
  };
}

export function createContentPackCardsRoute(dependencies: CardsDependencies) {
  return async function GET(request: Request, packId: string) {
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
    if (!session) return unauthorized();

    try {
      const result = await dependencies.store.listPackCards(session.userId, packId);
      // `forbidden` and `not_found` both answer 404 so an authorized-but-wrong-role actor can
      // never distinguish an existing pack from a missing one.
      if (result.status === 'forbidden' || result.status === 'not_found') return notFound();
      return json({ pack: result.pack, cards: result.cards });
    } catch {
      return unavailable();
    }
  };
}
