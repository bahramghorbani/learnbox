import { siteConfig } from '../../src/config/site.mjs';
import { wordHref } from '../../src/dictionary/href';
import { dictionaryPublic, lemmas, releaseDate } from '../../src/dictionary/store';
import { LANDING_PAGES, sitemapIndex, WORDS_PER_SITEMAP, xmlResponse } from '../../src/seo/sitemap';

export const dynamic = 'force-dynamic';

export function GET() {
  const at = (path: string) => new URL(path, siteConfig.siteUrl).toString();
  const newest = LANDING_PAGES.map((p) => p.updated)
    .sort()
    .at(-1)!;
  const maps = [{ loc: at('/sitemaps/pages.xml'), lastmod: new Date(newest) }];
  if (dictionaryPublic()) {
    const parts = Math.max(1, Math.ceil(new Set(lemmas().map(wordHref)).size / WORDS_PER_SITEMAP));
    const lastmod = releaseDate();
    for (let i = 1; i <= parts; i++)
      maps.push({ loc: at(`/sitemaps/dictionary-${i}.xml`), lastmod: lastmod! });
  }
  return xmlResponse(sitemapIndex(maps));
}
