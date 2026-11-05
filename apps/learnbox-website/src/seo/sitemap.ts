// Sitemaps (sitemaps.org protocol) and robots policy for learnboxapp.com.
// /sitemap.xml is an index: one child for the landing pages and one per 10,000 dictionary words
// (the protocol allows 50,000), so each child stays small and new words only grow the list.
// Google ignores <changefreq> and <priority>, so only <loc> and an honest <lastmod> are sent.

export const WORDS_PER_SITEMAP = 10_000;

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const day = (d?: Date | null) => (d ? `<lastmod>${d.toISOString().slice(0, 10)}</lastmod>` : '');

export type SitemapUrl = { loc: string; lastmod?: Date | null };

export function urlset(urls: SitemapUrl[]): string {
  const body = urls.map((u) => `<url><loc>${esc(u.loc)}</loc>${day(u.lastmod)}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function sitemapIndex(maps: SitemapUrl[]): string {
  const body = maps
    .map((m) => `<sitemap><loc>${esc(m.loc)}</loc>${day(m.lastmod)}</sitemap>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/** Landing pages and the day their content last changed (git history; update with the page). */
export const LANDING_PAGES: { path: string; updated: string }[] = [
  { path: '/', updated: '2026-11-02' },
  { path: '/privacy', updated: '2026-09-29' },
  { path: '/terms', updated: '2026-08-01' },
];

/** JSON-LD for a <script type="application/ld+json">, safe inside HTML. */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

export const xmlResponse = (xml: string) =>
  new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Fresh within an hour of a publish; the CDN and crawlers may cache it that long.
      'Cache-Control': 'public, max-age=3600',
    },
  });

/**
 * Search and AI crawlers named explicitly so the welcome is unambiguous. A named group replaces
 * the `*` group for that crawler, so each one repeats the same disallow list.
 */
export const AI_AND_SEARCH_AGENTS = [
  'Googlebot',
  'Google-Extended',
  'Bingbot',
  'Applebot',
  'Applebot-Extended',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'CCBot',
  'meta-externalagent',
  'DuckAssistBot',
  'MistralAI-User',
  'YandexBot',
];

// Machine endpoints: search JSON, the feedback endpoint, and design previews. Not pages.
export const DISALLOW = ['/dev/', '/dictionary/search', '/dictionary/feedback', '/api/'];
