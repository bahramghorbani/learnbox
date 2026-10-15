import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import type { PostgresPackPriceStore } from './postgres-pack-price-store';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function response(body: string, status: number) {
  return new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function createPackPriceRoute(dependencies: {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresPackPriceStore, 'setPrice'>;
  now?: () => Date;
}) {
  return async function POST(request: Request, context: { params: Promise<{ packId: string }> }) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return response('Not found', 404);
    }
    const config = dependencies.config as EnabledAdminAuthConfig;
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return response('Invalid request', 400);
    }
    const session = await loadAdminSession(
      request,
      config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session) return response('Unauthorized', 401);
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return response('Invalid request', 400);
    }
    if (!session.recent)
      return Response.json({ code: 'reauthentication_required' }, { status: 428 });
    if (!uuidPattern.test(request.headers.get('idempotency-key') ?? ''))
      return response('Invalid request', 400);
    const body = (await request.json().catch(() => undefined)) as
      { priceTomans?: unknown } | undefined;
    if (!body || typeof body !== 'object') return response('Invalid request', 400);
    const { packId } = await context.params;
    try {
      const result = await dependencies.store.setPrice({
        packId,
        priceTomans: body.priceTomans,
        actorUserId: session.userId,
      });
      if (result.status === 'applied')
        return Response.json(
          { priceTomans: result.priceTomans },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      if (result.status === 'forbidden') return response('Forbidden', 403);
      if (result.status === 'not_found') return response('Not found', 404);
      if (result.status === 'locked')
        return Response.json(
          { code: 'price_locked', message: 'قیمت پس از اولین فروش قابل تغییر نیست.' },
          { status: 409 },
        );
      return Response.json(
        {
          code: 'invalid_price',
          message: 'قیمت باید عدد صحیح مثبت و حداکثر ۱۰۰٬۰۰۰٬۰۰۰ تومان باشد.',
        },
        { status: 422 },
      );
    } catch {
      return response('Content packs unavailable', 503);
    }
  };
}
