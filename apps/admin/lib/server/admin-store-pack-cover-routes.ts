import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import { StorePackCoverService } from './store-pack-cover-service';

const pack = /^[a-z0-9][a-z0-9-]{1,119}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Dependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  service?: StorePackCoverService;
  now?: () => Date;
};
const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
function fail(status: number, message = 'Invalid request') {
  return new Response(message, { status, headers: noStore });
}
async function auth(
  request: Request,
  d: Dependencies,
  mutation = false,
  contentTypes = ['application/json'],
) {
  if (!d.enabled || !d.config.enabled || !d.sessionStore || !d.service)
    return { response: fail(404, 'Not found') } as const;
  const config = d.config as EnabledAdminAuthConfig;
  try {
    if (mutation) assertTrustedAdminMutation(request, config, contentTypes);
  } catch {
    return { response: fail(400) } as const;
  }
  const session = await loadAdminSession(
    request,
    config,
    d.sessionStore,
    (d.now ?? (() => new Date()))(),
  );
  if (!session) return { response: fail(401, 'Unauthorized') } as const;
  try {
    if (mutation) verifyAdminCsrf(request, session.csrfHash, config);
  } catch {
    return { response: fail(400) } as const;
  }
  if (!session.recent)
    return {
      response: Response.json(
        { code: 'reauthentication_required' },
        { status: 428, headers: noStore },
      ),
    } as const;
  return { actor: session.userId } as const;
}
export function createStorePackCoverRoute(d: Dependencies) {
  return async function GET(request: Request) {
    const a = await auth(request, d);
    if ('response' in a) return a.response;
    const url = new URL(request.url);
    const candidateId = url.searchParams.get('candidateId');
    const packId = url.searchParams.get('packId');
    if (candidateId) {
      if (!uuid.test(candidateId)) return fail(400);
      const result = await d.service!.read(candidateId, a.actor);
      if (typeof result === 'string')
        return fail(
          result === 'forbidden' ? 403 : 404,
          result === 'forbidden' ? 'Forbidden' : 'Not found',
        );
      return new Response(new Uint8Array(result.bytes), {
        headers: { ...noStore, 'Content-Type': result.mediaType, ETag: `"${result.checksum}"` },
      });
    }
    if (!packId || !pack.test(packId)) return fail(400);
    const candidates = await d.service!.state(packId, a.actor);
    return candidates === 'forbidden'
      ? fail(403, 'Forbidden')
      : Response.json({ candidates }, { headers: noStore });
  };
}
export function createStorePackCoverMutationRoute(d: Dependencies) {
  return async function POST(request: Request) {
    const multipart = request.headers.get('content-type')?.startsWith('multipart/form-data');
    const a = await auth(
      request,
      d,
      true,
      multipart ? ['multipart/form-data'] : ['application/json'],
    );
    if ('response' in a) return a.response;
    let action: unknown, packId: unknown, candidateId: unknown, bytes: Buffer | undefined;
    try {
      if (multipart) {
        const form = await request.formData();
        action = form.get('action');
        packId = form.get('packId');
        const file = form.get('file');
        if (file instanceof File) bytes = Buffer.from(await file.arrayBuffer());
      } else ({ action, packId, candidateId } = await request.json());
    } catch {
      return fail(400);
    }
    if (typeof packId !== 'string' || !pack.test(packId)) return fail(400);
    try {
      const result =
        action === 'upload' && bytes
          ? await d.service!.upload(packId, a.actor, bytes)
          : action === 'generate'
            ? await d.service!.generate(packId, a.actor)
            : action === 'accept' && typeof candidateId === 'string' && uuid.test(candidateId)
              ? await d.service!.accept(packId, candidateId, a.actor)
              : 'unprocessable';
      if (result === 'forbidden') return fail(403, 'Forbidden');
      if (result === 'not_found') return fail(404, 'Not found');
      if (result === 'unavailable')
        return Response.json(
          { code: 'provider_not_configured' },
          { status: 503, headers: noStore },
        );
      if (result === 'unprocessable') return fail(422);
      return Response.json(
        typeof result === 'string' ? { status: result } : { candidate: result },
        { headers: noStore },
      );
    } catch {
      return Response.json({ code: 'cover_operation_failed' }, { status: 503, headers: noStore });
    }
  };
}
