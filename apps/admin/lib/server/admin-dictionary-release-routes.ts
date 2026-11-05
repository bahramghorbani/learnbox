// GET: the live dictionary release, recent history and how many panel changes are unpublished.
// POST {action: 'publish' | 'rollback'}: build + verify + go live, or point back at the previous
// release. Same guard as the editorial routes: super admin, trusted origin, CSRF, recent sign-in.
import { randomUUID } from 'node:crypto';
import {
  editorialActor,
  parseJsonArray,
  type EditorialDeps,
} from './admin-dictionary-editorial-routes';
import { readFeedback } from './dictionary-feedback';
import type { DictionaryReleasePublisher } from './dictionary-release-publisher';
import type { PostgresDictionaryEditorialStore } from './postgres-dictionary-editorial-store';

type Deps = Omit<EditorialDeps, 'store'> & {
  store?: Pick<
    PostgresDictionaryEditorialStore,
    'releaseRows' | 'changedSince' | 'recordRelease' | 'create'
  >;
  publisher?: Pick<DictionaryReleasePublisher, 'state' | 'publish' | 'rollback' | 'knownWords'>;
  feedbackDir?: string;
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

/** GET: visitor searches that found nothing and error reports, for the dictionary overview. */
export function createDictionaryFeedbackRoute(deps: Deps) {
  return async (request: Request) => {
    if (!deps.feedbackDir) return missing();
    const g = await guard(request, deps, false);
    if (g.response) return g.response;
    try {
      return json(readFeedback(deps.feedbackDir, (words) => deps.publisher!.knownWords(words)));
    } catch {
      return new Response('Dictionary feedback unavailable', { status: 503, headers: noStore });
    }
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const germanLemma = /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\- ]{0,78}$/;

/** A proposed full entry, re-validated against the same shape `dictionary-release-builder` needs. */
function validEntry(p: Record<string, unknown>) {
  const lemma = str(p.lemma);
  if (!germanLemma.test(lemma)) return undefined;
  const article = p.article === null || p.article === undefined ? null : str(p.article);
  if (article !== null && !['der', 'die', 'das'].includes(article)) return undefined;
  const senses = (Array.isArray(p.senses) ? p.senses : [])
    .map((s) => ({
      fa: str((s as Record<string, unknown>)?.fa),
      hint: str((s as Record<string, unknown>)?.hint),
    }))
    .filter((s) => s.fa);
  if (!senses.length) return undefined;
  const examples = (Array.isArray(p.examples) ? p.examples : [])
    .map((e) => ({
      de: str((e as Record<string, unknown>)?.de),
      fa: str((e as Record<string, unknown>)?.fa),
    }))
    .filter((e) => e.de);
  const freq = Number.isInteger(p.freq) && (p.freq as number) > 0 ? (p.freq as number) : 1;
  const pos = str(p.pos) || undefined;
  return { lemma, article, pos, freq, senses, examples };
}

/**
 * POST: the highest-count visitor searches that found nothing yet. One AI call proposes a full
 * entry for each (or marks it not a real/standard German word), a second independent AI call must
 * confirm each proposal before anything is written; both the reviewer's judgement and a structural
 * re-check here gate every write. Writes land `queued` — a fresh word, same as an edit, needs
 * manual approval before `buildRelease` will ever publish it.
 */
export function createDictionaryEditorialDraftMissingWordsRoute(deps: Deps) {
  return async (request: Request) => {
    const g = await guard(request, deps, true);
    if (g.response) return g.response;
    if (!deps.feedbackDir) return missing();
    if (!deps.aiProvider)
      return json({ code: 'provider_not_configured' }, { status: 503, headers: noStore });
    let body: Record<string, unknown> | undefined;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      /* invalid */
    }
    const maxWords = body && typeof body.maxWords === 'number' ? body.maxWords : 10;
    if (!Number.isSafeInteger(maxWords) || maxWords < 1 || maxWords > 20)
      return new Response('Invalid request', { status: 400, headers: noStore });

    let misses: { q: string; count: number }[];
    try {
      misses = readFeedback(deps.feedbackDir, (words) => deps.publisher!.knownWords(words)).misses;
    } catch {
      return new Response('Dictionary feedback unavailable', { status: 503, headers: noStore });
    }
    const words = misses.slice(0, maxWords);
    if (!words.length) return json({ added: 0, words: [] });

    let generated: string;
    try {
      generated = await deps.aiProvider.complete({
        system: [
          'You are a German-Persian lexicographer. Each numbered line is a word a visitor typed',
          'into a German-Persian dictionary search that found nothing. The spelling may be wrong,',
          'mis-cased, inflected, or not German at all.',
          'For each: if it is recognisably a real, standard German word (correcting case/spelling',
          'to the canonical dictionary form, e.g. a noun capitalised, a verb to its infinitive),',
          'propose a full entry. Otherwise mark it skip.',
          'Reply with a single JSON array and no other text:',
          '[{"i": <number>, "skip": <bool>, "lemma": "...", "article": "der"|"die"|"das"|null,',
          ' "pos": "noun|verb|adj|adv|...", "freq": <1-100 rough commonness estimate>,',
          ' "senses": [{"fa": "...", "hint": "..."}], "examples": [{"de": "...", "fa": "..."}]}]',
          'Every entry needs at least one sense and one example. Every "i" must be included.',
        ].join('\n'),
        user: words.map((w, i) => `${i + 1}. ${w.q}`).join('\n'),
        maxOutputTokens: 6000,
        timeoutMs: 120_000,
      });
    } catch (error) {
      return json(
        { code: 'provider_error', message: (error as Error).message },
        { status: 502, headers: noStore },
      );
    }
    const proposals = new Map<number, Record<string, unknown>>();
    for (const entry of parseJsonArray(generated)) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const i = Number(e.i);
      if (e.skip !== true && Number.isInteger(i) && i >= 1 && i <= words.length)
        proposals.set(i, e);
    }
    if (!proposals.size) return json({ added: 0, words: [] });

    let reviewed: string;
    try {
      reviewed = await deps.aiProvider.complete({
        system: [
          'You are an independent reviewer of proposed German dictionary entries. You did not',
          'write these. For each numbered item, the visitor search query is given along with the',
          'proposed entry. Confirm only if: the lemma is a real, correctly-spelled standard German',
          'word matching what the visitor likely meant, the article/pos are right, and every',
          'Persian translation is accurate and natural. Reject anything invented, mismatched, or',
          'containing offensive content.',
          'Reply with a single JSON array and no other text: [{"i": <number>, "approve": <bool>}]',
        ].join('\n'),
        user: [...proposals.entries()]
          .map(([i, p]) => `${i}. query="${words[i - 1]!.q}" proposed=${JSON.stringify(p)}`)
          .join('\n'),
        maxOutputTokens: 2048,
        timeoutMs: 120_000,
      });
    } catch (error) {
      return json(
        { code: 'provider_error', message: (error as Error).message },
        { status: 502, headers: noStore },
      );
    }
    const approved = new Set<number>();
    for (const entry of parseJsonArray(reviewed)) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const i = Number(e.i);
      if (e.approve === true && Number.isInteger(i)) approved.add(i);
    }

    const results: { q: string; status: string }[] = [];
    for (const [i, proposal] of proposals) {
      if (!approved.has(i)) continue;
      const entry = validEntry(proposal);
      if (!entry) {
        results.push({ q: words[i - 1]!.q, status: 'invalid' });
        continue;
      }
      try {
        const result = await deps.store!.create(g.user, {
          dictionaryKey: entry.lemma,
          aiPayload: { ...entry },
          source: 'ai-pilot-3/miss',
          model: null,
          costMetadata: {},
          status: 'queued',
          idempotencyKey: randomUUID(),
        });
        results.push({ q: words[i - 1]!.q, status: result.status });
      } catch {
        results.push({ q: words[i - 1]!.q, status: 'error' });
      }
    }
    return json({ added: results.filter((r) => r.status === 'applied').length, words: results });
  };
}
