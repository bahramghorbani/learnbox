import assert from 'node:assert/strict';
import { test } from 'node:test';

const { urlset, sitemapIndex, ldJson, DISALLOW, AI_AND_SEARCH_AGENTS } =
  await import('../src/seo/sitemap.ts');

test('sitemaps are valid protocol XML with escaped locations and day-precision lastmod', () => {
  const xml = urlset([
    {
      loc: 'https://learnboxapp.com/dictionary/M%C3%A4dchen',
      lastmod: new Date('2026-11-05T08:28:22Z'),
    },
    { loc: 'https://learnboxapp.com/a?x=1&y=2' },
  ]);
  assert.match(
    xml,
    /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/,
  );
  assert.match(
    xml,
    /<url><loc>https:\/\/learnboxapp.com\/dictionary\/M%C3%A4dchen<\/loc><lastmod>2026-11-05<\/lastmod><\/url>/,
  );
  assert.match(xml, /x=1&amp;y=2<\/loc><\/url>/);
  assert.doesNotMatch(xml, /priority|changefreq/);
  assert.match(
    sitemapIndex([{ loc: 'https://x/s.xml' }]),
    /<sitemapindex [^>]+><\/?|<sitemap><loc>https:\/\/x\/s.xml<\/loc><\/sitemap>/,
  );
});

test('crawl policy keeps machine endpoints out and names the AI assistants', () => {
  for (const p of ['/dictionary/search', '/dictionary/feedback', '/dev/'])
    assert.ok(DISALLOW.includes(p));
  assert.ok(!DISALLOW.some((p) => p === '/' || p === '/dictionary' || p === '/dictionary/'));
  for (const a of ['Googlebot', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'])
    assert.ok(AI_AND_SEARCH_AGENTS.includes(a));
  assert.equal(ldJson({ a: '</script>' }), '{"a":"\\u003c/script>"}');
});
