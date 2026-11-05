// GET: the live dictionary release, recent history and how many panel changes are unpublished.
// POST {action: 'publish' | 'rollback'}: build + verify + go live, or point back at the previous
// release. Same guard as the editorial routes: super admin, trusted origin, CSRF, recent sign-in.
import { randomUUID } from 'node:crypto';
import { editorialActor, type EditorialDeps } from './admin-dictionary-editorial-routes';
import type { DictionaryReleasePublisher } from './dictionary-release-publisher';
import type { PostgresDictionaryEditorialStore } from './postgres-dictionary-editorial-store';

type Deps = Omit<EditorialDeps, 'store'> & {
  store?: Pick<PostgresDictionaryEditorialStore, 'releaseRows' | 'changedSince' | 'recordRelease'>;
  publisher?: Pick<DictionaryReleasePublisher, 'state' | 'publish' | 'rollback'>;
};
const noStore = { 'Cache-Control': 'no-store' };
const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { ...noStore, ...init?.headers } });
const missing = () => new Response('Not found', { status: 404, headers: noStore });

async function guard(request: Request, deps: Deps, mutation: boolean) {
  if (!deps.publisher) return { response: missing() };
  const user = await editorialActor(request, deps as EditorialDeps, mutation);
  if (user === undefined) return { response: missing() };
  if (user === null)
    return { response: new Response('Forbidden', { status: 403, headers: noStore }) };
  if (user === false)
    return { response: new Response('Unauthorized', { status: 401, headers: noStore }) };
  if (user === 'recent')
    return { response: json({ code: 'reauthentication_required' }, { status: 428 }) };
  return { user };
}

export function createDictionaryReleaseStatusRoute(deps: Deps) {
  return async (request: Request) => {
    const g = await guard(request, deps, false);
    if (g.response) return g.response;
    try {
      const state = deps.publisher!.state();
      const pending = await deps.store!.changedSince(g.user, state.current?.at ?? null);
      if (pending.status === 'forbidden')
        return new Response('Forbidden', { status: 403, headers: noStore });
      return json({
        current: state.current,
        history: state.history.slice(0, 10),
        pending: pending.changed,
      });
    } catch {
      return new Response('Dictionary release unavailable', { status: 503, headers: noStore });
    }
  };
}

export function createDictionaryReleaseActionRoute(deps: Deps) {
  return async (request: Request) => {
    const g = await guard(request, deps, true);
    if (g.response) return g.response;
    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    const now = (deps.now ?? (() => new Date()))();
    try {
      if (body?.action === 'rollback') {
        const result = deps.publisher!.rollback(g.user, now);
        if (result.status === 'busy') return json({ code: 'busy' }, { status: 409 });
        if (result.status === 'none') return json({ code: 'no_previous_release' }, { status: 409 });
        await deps.store!.recordRelease(g.user, {
          action: 'rollback',
          id: randomUUID(),
          file: result.record.file,
          sha256: result.record.sha256,
          entries: result.record.entries,
        });
        return json({ status: 'rolled-back', current: result.record });
      }
      if (body?.action !== 'publish')
        return new Response('Invalid request', { status: 400, headers: noStore });
      const rows = await deps.store!.releaseRows(g.user);
      if (rows.status === 'forbidden')
        return new Response('Forbidden', { status: 403, headers: noStore });
      const result = deps.publisher!.publish(rows.rows, g.user, now);
      if (result.status === 'busy') return json({ code: 'busy' }, { status: 409 });
      if (result.status === 'unconfigured') return json({ code: 'unconfigured' }, { status: 503 });
      if (result.status === 'failed')
        return json({ status: 'failed', report: result.report }, { status: 422 });
      await deps.store!.recordRelease(g.user, {
        action: 'publish',
        id: randomUUID(),
        file: deps.publisher!.state().current!.file,
        sha256: result.report.sha256,
        entries: result.report.entries,
      });
      return json({
        status: 'published',
        report: result.report,
        current: deps.publisher!.state().current,
      });
    } catch {
      return new Response('Dictionary release unavailable', { status: 503, headers: noStore });
    }
  };
}
