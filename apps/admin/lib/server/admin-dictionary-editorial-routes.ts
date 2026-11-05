import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import type { AiTextProvider } from './ai-generation-provider';
import {
  dictionaryEditorialFilters,
  dictionaryEditorialStatuses,
  type DictionaryEditorialStatus,
  type PostgresDictionaryEditorialStore,
} from './postgres-dictionary-editorial-store';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type EditorialDeps = Deps;
type Deps = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<
    PostgresDictionaryEditorialStore,
    'list' | 'create' | 'update' | 'examplesNeedingTranslation'
  >;
  now?: () => Date;
  aiProvider?: AiTextProvider;
};
const noStore = { 'Cache-Control': 'no-store' };
const missing = () => new Response('Not found', { status: 404, headers: noStore });
const invalid = () => new Response('Invalid request', { status: 400, headers: noStore });
const unavailable = () =>
  new Response('Dictionary editorial unavailable', { status: 503, headers: noStore });
const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { ...noStore, ...init?.headers } });
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const dictionaryPayload = (value: unknown, key: string) => record(value) && value.lemma === key;
function key(request: Request) {
  const value = request.headers.get('idempotency-key');
  return value && uuid.test(value) ? value : undefined;
}
export async function editorialActor(request: Request, deps: Deps, mutation: boolean) {
  return actor(request, deps, mutation);
}
async function actor(request: Request, deps: Deps, mutation: boolean) {
  if (!deps.enabled || !deps.config.enabled || !deps.sessionStore || !deps.store) return undefined;
  if (mutation) {
    try {
      assertTrustedAdminMutation(request, deps.config as EnabledAdminAuthConfig, [
        'application/json',
      ]);
    } catch {
      return null;
    }
  }
  const session = await loadAdminSession(
    request,
    deps.config,
    deps.sessionStore,
    (deps.now ?? (() => new Date()))(),
  );
  if (!session) return false;
  if (mutation) {
    try {
      verifyAdminCsrf(request, session.csrfHash, deps.config as EnabledAdminAuthConfig);
    } catch {
      return null;
    }
    if (!session.recent) return 'recent' as const;
  }
  return session.userId;
}
export function createDictionaryEditorialListRoute(deps: Deps) {
  return async (request: Request) => {
    const user = await actor(request, deps, false);
    if (user === undefined) return missing();
    if (!user) return new Response('Unauthorized', { status: 401, headers: noStore });
    const params = new URL(request.url).searchParams;
    const q = (params.get('q') ?? '').trim();
    const filter = params.get('filter') ?? 'all';
    if (q.length > 100 || !(dictionaryEditorialFilters as readonly string[]).includes(filter))
      return invalid();
    try {
      const result = await deps.store!.list(user, {
        q,
        filter: filter as (typeof dictionaryEditorialFilters)[number],
        limit: 50,
      });
      return result.status === 'forbidden'
        ? missing()
        : json({ items: result.items, total: result.total });
    } catch {
      return unavailable();
    }
  };
}
export function createDictionaryEditorialCreateRoute(deps: Deps) {
  return async (request: Request) => {
    const user = await actor(request, deps, true);
    if (user === undefined) return missing();
    if (user === null) return invalid();
    if (user === false) return new Response('Unauthorized', { status: 401, headers: noStore });
    if (user === 'recent') return json({ code: 'reauthentication_required' }, { status: 428 });
    const idempotencyKey = key(request);
    let body: Record<string, unknown> | undefined;
    try {
      body = await request.json();
    } catch {
      /* invalid */
    }
    if (
      !idempotencyKey ||
      !record(body) ||
      typeof body.dictionaryKey !== 'string' ||
      !body.dictionaryKey.trim() ||
      body.dictionaryKey.length > 500 ||
      !dictionaryPayload(body.aiPayload, body.dictionaryKey.trim()) ||
      typeof body.source !== 'string' ||
      !body.source.trim() ||
      body.source.length > 200 ||
      (body.model !== undefined && (typeof body.model !== 'string' || body.model.length > 200)) ||
      (body.costMetadata !== undefined && !record(body.costMetadata)) ||
      (body.status !== undefined && body.status !== 'queued' && body.status !== 'approved')
    )
      return invalid();
    const aiPayload = body.aiPayload as Record<string, unknown>;
    try {
      const result = await deps.store!.create(user, {
        dictionaryKey: body.dictionaryKey.trim(),
        aiPayload,
        source: body.source.trim(),
        model: typeof body.model === 'string' ? body.model : null,
        costMetadata: record(body.costMetadata) ? body.costMetadata : {},
        ...(body.status ? { status: body.status as 'queued' | 'approved' } : {}),
        idempotencyKey,
      });
      if (result.status === 'forbidden') return missing();
      if (result.status === 'duplicate')
        return json({ code: 'dictionary_key_exists' }, { status: 409 });
      return json({ status: result.status, item: result.item });
    } catch {
      return unavailable();
    }
  };
}
/**
 * POST — one AI call translates example sentences for the highest-frequency live words that are
 * missing a Persian translation. Writes land as a `queued` draft: `buildRelease` skips a `queued`
 * row and keeps serving that word's current (already-published) content, so nothing on the public
 * site changes until an admin reviews and approves the draft from the editorial list.
 */
export function createDictionaryEditorialTranslateExamplesRoute(deps: Deps) {
  return async (request: Request) => {
    const user = await actor(request, deps, true);
    if (user === undefined) return missing();
    if (user === null) return invalid();
    if (user === false) return new Response('Unauthorized', { status: 401, headers: noStore });
    if (user === 'recent') return json({ code: 'reauthentication_required' }, { status: 428 });
    if (!deps.aiProvider)
      return json({ code: 'provider_not_configured' }, { status: 503, headers: noStore });
    let body: Record<string, unknown> | undefined;
    try {
      body = await request.json();
    } catch {
      /* invalid */
    }
    const maxSentences =
      record(body) && typeof body.maxSentences === 'number' ? body.maxSentences : 50;
    if (!Number.isSafeInteger(maxSentences) || maxSentences < 1 || maxSentences > 50)
      return invalid();

    let candidates: Awaited<ReturnType<NonNullable<Deps['store']>['examplesNeedingTranslation']>>;
    try {
      // Over-fetch words (one word may supply several sentences); flattening below stops at the cap.
      candidates = await deps.store!.examplesNeedingTranslation(user, maxSentences * 2);
    } catch {
      return unavailable();
    }
    if (candidates.status === 'forbidden') return missing();

    type Slot = { wordIndex: number; exampleIndex: number; de: string };
    const slots: Slot[] = [];
    for (const [wordIndex, item] of candidates.items.entries()) {
      const examples = Array.isArray(item.payload.examples) ? item.payload.examples : [];
      for (const [exampleIndex, raw] of examples.entries()) {
        if (slots.length >= maxSentences) break;
        const example = record(raw) ? raw : {};
        const de = typeof example.de === 'string' ? example.de.trim() : '';
        const fa = typeof example.fa === 'string' ? example.fa.trim() : '';
        if (de && !fa) slots.push({ wordIndex, exampleIndex, de });
      }
      if (slots.length >= maxSentences) break;
    }
    if (!slots.length) return json({ translated: 0, words: [] });

    const numbered = slots.map((s, i) => `${i + 1}. ${s.de}`).join('\n');
    let reply: string;
    try {
      reply = await deps.aiProvider.complete({
        system: [
          'You translate German example sentences from a German-to-Persian dictionary into',
          'natural, correct Persian for an Iranian learner.',
          'Reply with a single JSON array and no other text: [{"i": <sentence number>, "fa": "..."}]',
          'One array element per numbered sentence, in any order. Every "i" must be included.',
        ].join('\n'),
        user: numbered,
        maxOutputTokens: 4096,
        timeoutMs: 120_000,
      });
    } catch (error) {
      return json(
        { code: 'provider_error', message: (error as Error).message },
        { status: 502, headers: noStore },
      );
    }
    const start = reply.indexOf('[');
    const end = reply.lastIndexOf(']');
    let parsed: unknown;
    try {
      parsed = start >= 0 && end > start ? JSON.parse(reply.slice(start, end + 1)) : undefined;
    } catch {
      /* invalid */
    }
    const translations = new Map<number, string>();
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (!record(entry)) continue;
        const i = Number(entry.i);
        const fa = typeof entry.fa === 'string' ? entry.fa.trim() : '';
        if (Number.isInteger(i) && i >= 1 && i <= slots.length && fa) translations.set(i, fa);
      }
    }
    if (!translations.size)
      return json({ code: 'provider_empty_response' }, { status: 502, headers: noStore });

    const byWord = new Map<number, Slot[]>();
    slots.forEach((slot, index) => {
      if (!translations.has(index + 1)) return;
      const list = byWord.get(slot.wordIndex) ?? [];
      list.push(slot);
      byWord.set(slot.wordIndex, list);
    });

    const results: { dictionaryKey: string; status: string }[] = [];
    for (const [wordIndex, wordSlots] of byWord) {
      const item = candidates.items[wordIndex]!;
      const examples = [...(item.payload.examples as Record<string, unknown>[])];
      for (const slot of wordSlots) {
        const i = slots.indexOf(slot) + 1;
        examples[slot.exampleIndex] = { ...examples[slot.exampleIndex], fa: translations.get(i) };
      }
      try {
        const result = await deps.store!.update(user, item.id, {
          revision: item.revision,
          manualPayload: { ...item.payload, examples },
          status: 'queued',
          idempotencyKey: crypto.randomUUID(),
        });
        results.push({ dictionaryKey: item.dictionaryKey, status: result.status });
      } catch {
        results.push({ dictionaryKey: item.dictionaryKey, status: 'error' });
      }
    }
    return json({ translated: translations.size, words: results });
  };
}

export function createDictionaryEditorialUpdateRoute(deps: Deps) {
  return async (request: Request, id: string) => {
    const user = await actor(request, deps, true);
    if (user === undefined) return missing();
    if (user === null) return invalid();
    if (user === false) return new Response('Unauthorized', { status: 401, headers: noStore });
    if (user === 'recent') return json({ code: 'reauthentication_required' }, { status: 428 });
    const idempotencyKey = key(request);
    let body: Record<string, unknown> | undefined;
    try {
      body = await request.json();
    } catch {
      /* invalid */
    }
    if (
      !uuid.test(id) ||
      !idempotencyKey ||
      !record(body) ||
      typeof body.revision !== 'number' ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 1 ||
      (!Object.hasOwn(body, 'manualPayload') && !Object.hasOwn(body, 'status')) ||
      (Object.hasOwn(body, 'manualPayload') &&
        body.manualPayload !== null &&
        !record(body.manualPayload)) ||
      (body.status !== undefined &&
        !(dictionaryEditorialStatuses as readonly string[]).includes(body.status as string))
    )
      return invalid();
    try {
      const result = await deps.store!.update(user, id, {
        revision: Number(body.revision),
        ...(Object.hasOwn(body, 'manualPayload')
          ? { manualPayload: body.manualPayload as Record<string, unknown> | null }
          : {}),
        ...(body.status ? { status: body.status as DictionaryEditorialStatus } : {}),
        idempotencyKey,
      });
      if (result.status === 'forbidden' || result.status === 'not_found') return missing();
      if (result.status === 'conflict') return json({ code: 'revision_conflict' }, { status: 409 });
      return json({ status: result.status, item: result.item });
    } catch {
      return unavailable();
    }
  };
}
