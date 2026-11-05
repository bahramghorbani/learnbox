// Server-side proxy to the public dictionary's own search endpoint (apps/learnbox-website),
// so the learner app's browser never makes a cross-origin call and no dictionary-reading code
// (or its SQLite release file) is duplicated here. Requires a learner session, same as the rest
// of the "واژه‌ها" page's API — the dictionary search itself has no secrets, this just avoids an
// unauthenticated endpoint on the learner app's domain.
import { authenticateLearner } from '../../../../../lib/learner-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'private, no-store' };

function dictionarySiteUrl() {
  return (process.env.NEXT_PUBLIC_DICTIONARY_SITE_URL || 'https://learnboxapp.com').replace(
    /\/$/,
    '',
  );
}

export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }
  const params = new URL(request.url).searchParams;
  const target = new URL('/dictionary/search', dictionarySiteUrl());
  if (params.has('q')) target.searchParams.set('q', params.get('q')!.slice(0, 40));
  if (params.has('words')) target.searchParams.set('words', params.get('words')!.slice(0, 1600));
  if (!target.searchParams.size) {
    return Response.json({ head: '', hits: [] }, { headers: privateHeaders });
  }
  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok) return Response.json({ head: '', hits: [] }, { headers: privateHeaders });
    return Response.json(await upstream.json(), { headers: privateHeaders });
  } catch (err) {
    console.error('[dictionary-search] proxy error:', err);
    return Response.json({ head: '', hits: [] }, { headers: privateHeaders });
  }
}
